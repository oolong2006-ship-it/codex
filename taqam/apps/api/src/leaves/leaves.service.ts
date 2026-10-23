import { Injectable } from '@nestjs/common';
import { Employee, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../shared/audit.service';
import { NotifyService } from '../shared/notifications.service';
import { ScopeService } from '../shared/scope.service';
import { LeaveCalcService } from '../shared/leave-calc.service';
import { AuthUser } from '../common/types';
import { day, todayStr } from '../common/dates';
import { badRequest, notFound } from '../common/errors';
import { pageParams } from '../common/pagination';
import { fullName } from '../employees/employee.view';
import { MyLeaveDto } from './leaves.dto';

export const leaveInclude = {
  employee: { select: { id: true, firstNameAr: true, lastNameAr: true, branchId: true, branch: { select: { nameAr: true } } } },
  leaveType: { select: { id: true, code: true, nameAr: true, nameEn: true, paid: true } },
} satisfies Prisma.LeaveRequestInclude;

type LeaveWithRel = Prisma.LeaveRequestGetPayload<{ include: typeof leaveInclude }>;

export function leaveView(l: LeaveWithRel) {
  const { employee, ...rest } = l;
  return {
    ...rest,
    employee: { id: employee.id, name: fullName(employee), branchId: employee.branchId, branchName: employee.branch?.nameAr ?? null },
  };
}

@Injectable()
export class LeavesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
    private readonly scope: ScopeService,
    private readonly calc: LeaveCalcService,
  ) {}

  async list(u: AuthUser, q: { page?: string; pageSize?: string; status?: string; employeeId?: string; branchId?: string; from?: string; to?: string; leaveTypeId?: string }) {
    const { page, pageSize, skip, take } = pageParams(q);
    const b = this.scope.branchFilter(u, q.branchId);
    const where: Prisma.LeaveRequestWhereInput = {
      companyId: u.companyId,
      employee: this.scope.employeeWhere(u, b ? { branchId: b } : {}),
      ...(q.status ? { status: q.status as Prisma.LeaveRequestWhereInput['status'] } : {}),
      ...(q.employeeId ? { employeeId: q.employeeId } : {}),
      ...(q.leaveTypeId ? { leaveTypeId: q.leaveTypeId } : {}),
      ...(q.from ? { endDate: { gte: day(q.from) } } : {}),
      ...(q.to ? { startDate: { lte: day(q.to) } } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({ where, include: leaveInclude, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    return { data: data.map(leaveView), total, page, pageSize };
  }

  /** Shared by admin-on-behalf and self-service. */
  async createFor(actor: AuthUser, emp: Employee, dto: MyLeaveDto) {
    if (emp.status === 'TERMINATED') throw badRequest('Employee is terminated', 'لا يمكن إنشاء إجازة لموظف منتهية خدمته');
    const type = await this.prisma.leaveType.findFirst({ where: { id: dto.leaveTypeId, companyId: actor.companyId } });
    if (!type) throw notFound('Leave type', 'نوع الإجازة غير موجود');
    const days = await this.calc.validate(emp, type, dto.startDate, dto.endDate);
    const l = await this.prisma.leaveRequest.create({
      data: {
        companyId: actor.companyId,
        employeeId: emp.id,
        leaveTypeId: type.id,
        startDate: day(dto.startDate),
        endDate: day(dto.endDate),
        days,
        reason: dto.reason,
      },
      include: leaveInclude,
    });
    await this.audit.log(actor, 'CREATE', 'LeaveRequest', l.id, { employeeId: emp.id, code: type.code, days, ...dto });
    if (actor.employeeId === emp.id) {
      await this.notify.toApprovers(actor.companyId, emp.branchId, 'طلب إجازة جديد', `${fullName(emp)} — ${type.nameAr} (${days} يوم)`, '/leaves');
    }
    return leaveView(l);
  }

  async create(u: AuthUser, dto: MyLeaveDto & { employeeId: string }) {
    const emp = await this.scope.employee(u, dto.employeeId);
    return this.createFor(u, emp, dto);
  }

  async decide(u: AuthUser, id: string, approve: boolean, comment?: string) {
    const l = await this.prisma.leaveRequest.findFirst({ where: { id, companyId: u.companyId }, include: { leaveType: true } });
    if (!l) throw notFound('Leave request', 'طلب الإجازة غير موجود');
    const emp = await this.scope.employee(u, l.employeeId);
    if (l.status !== 'PENDING') throw badRequest('Only pending requests can be decided', 'يمكن البت في الطلبات المعلقة فقط');
    if (u.employeeId && u.employeeId === l.employeeId && u.role === 'BRANCH_MANAGER') {
      throw badRequest('You cannot approve your own request', 'لا يمكنك اعتماد طلبك بنفسك');
    }
    if (approve && l.leaveType.code === 'ANNUAL') {
      // re-check balance at approval time (other leaves may have been approved meanwhile)
      await this.calc.validate(emp, l.leaveType, l.startDate.toISOString().slice(0, 10), l.endDate.toISOString().slice(0, 10), l.id);
    }
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: approve ? 'APPROVED' : 'REJECTED', approverId: u.id, approverName: u.name, decidedAt: new Date(), comment },
      include: leaveInclude,
    });
    const today = todayStr();
    if (approve && day(today) >= l.startDate && day(today) <= l.endDate) {
      await this.prisma.employee.update({ where: { id: emp.id }, data: { status: 'ON_LEAVE' } });
    }
    await this.audit.log(u, approve ? 'APPROVE' : 'REJECT', 'LeaveRequest', id, { comment });
    await this.notify.toEmployees(
      u.companyId,
      [l.employeeId],
      approve ? 'تمت الموافقة على طلب إجازتك' : 'تم رفض طلب إجازتك',
      `${l.leaveType.nameAr}: ${l.startDate.toISOString().slice(0, 10)} → ${l.endDate.toISOString().slice(0, 10)}${comment ? ` — ${comment}` : ''}`,
      '/me/leaves',
    );
    return leaveView(updated);
  }

  async cancelOwn(u: AuthUser, id: string) {
    const l = await this.prisma.leaveRequest.findFirst({ where: { id, companyId: u.companyId, employeeId: u.employeeId ?? '__none__' } });
    if (!l) throw notFound('Leave request', 'طلب الإجازة غير موجود');
    if (l.status !== 'PENDING') throw badRequest('Only pending requests can be cancelled', 'يمكن إلغاء الطلبات المعلقة فقط');
    const updated = await this.prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED', decidedAt: new Date() }, include: leaveInclude });
    await this.audit.log(u, 'CANCEL', 'LeaveRequest', id);
    return leaveView(updated);
  }

  async balances(u: AuthUser, employeeId?: string) {
    const id = employeeId || u.employeeId;
    if (!id) throw badRequest('employeeId is required', 'رقم الموظف مطلوب');
    const emp = await this.scope.employee(u, id);
    return this.calc.balances(emp);
  }
}
