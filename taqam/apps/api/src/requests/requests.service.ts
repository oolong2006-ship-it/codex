import { Injectable } from '@nestjs/common';
import { Employee, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../shared/audit.service';
import { NotifyService } from '../shared/notifications.service';
import { ScopeService } from '../shared/scope.service';
import { AttendanceService } from '../attendance/attendance.service';
import { AuthUser } from '../common/types';
import { addMonths, periodOf, todayStr } from '../common/dates';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { num, r2 } from '../common/money';
import { pageParams } from '../common/pagination';
import { fullName } from '../employees/employee.view';
import { LoanDto, MyRequestDto, UpdateLoanDto } from './requests.dto';

const empSelect = { select: { id: true, firstNameAr: true, lastNameAr: true, employeeNumber: true, branchId: true, branch: { select: { nameAr: true } } } } as const;

type EmpLite = { id: string; firstNameAr: string; lastNameAr: string; employeeNumber: string; branchId: string | null; branch: { nameAr: string } | null };
const empView = (e: EmpLite) => ({ id: e.id, name: fullName(e), employeeNumber: e.employeeNumber, branchId: e.branchId, branchName: e.branch?.nameAr ?? null });

/** Roles that may approve a LOAN request (it creates a payroll deduction). */
export const LOAN_APPROVERS: Role[] = ['OWNER', 'HR_ADMIN', 'PAYROLL'];

export const REQUEST_TYPE_AR: Record<string, string> = {
  SALARY_CERTIFICATE: 'تعريف بالراتب',
  EXPENSE_CLAIM: 'مطالبة مصروفات',
  LOAN: 'سلفة',
  EXIT_REENTRY: 'خروج وعودة',
  ATTENDANCE_CORRECTION: 'تصحيح حضور',
  LETTER: 'خطاب',
  OTHER: 'طلب آخر',
};

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
    private readonly scope: ScopeService,
    private readonly attendance: AttendanceService,
  ) {}

  async list(u: AuthUser, q: { page?: string; pageSize?: string; type?: string; status?: string; employeeId?: string; branchId?: string }) {
    const { page, pageSize, skip, take } = pageParams(q);
    const b = this.scope.branchFilter(u, q.branchId);
    const where: Prisma.EmployeeRequestWhereInput = {
      companyId: u.companyId,
      employee: this.scope.employeeWhere(u, b ? { branchId: b } : {}),
      ...(q.type ? { type: q.type as Prisma.EmployeeRequestWhereInput['type'] } : {}),
      ...(q.status ? { status: q.status as Prisma.EmployeeRequestWhereInput['status'] } : {}),
      ...(q.employeeId ? { employeeId: q.employeeId } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.employeeRequest.findMany({ where, include: { employee: empSelect }, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.employeeRequest.count({ where }),
    ]);
    return { data: data.map((r) => ({ ...r, employee: empView(r.employee) })), total, page, pageSize };
  }

  async listOwn(u: AuthUser) {
    const data = await this.prisma.employeeRequest.findMany({
      where: { companyId: u.companyId, employeeId: u.employeeId ?? '__none__' },
      orderBy: { createdAt: 'desc' },
    });
    return data;
  }

  async createOwn(u: AuthUser, emp: Employee, dto: MyRequestDto) {
    if (dto.type === 'LOAN' && !(dto.amount && dto.amount > 0)) throw badRequest('amount is required for LOAN', 'مبلغ السلفة مطلوب');
    if (dto.type === 'ATTENDANCE_CORRECTION') {
      const p = dto.payload ?? {};
      if (!p.date || !p.checkIn) throw badRequest('payload.date and payload.checkIn are required', 'التاريخ ووقت الحضور مطلوبان');
    }
    const r = await this.prisma.employeeRequest.create({
      data: {
        companyId: u.companyId,
        employeeId: emp.id,
        type: dto.type,
        title: dto.title,
        details: dto.details,
        amount: dto.amount,
        payload: (dto.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    await this.audit.log(u, 'CREATE', 'EmployeeRequest', r.id, dto);
    await this.notify.toApprovers(u.companyId, emp.branchId, `طلب جديد: ${REQUEST_TYPE_AR[dto.type]}`, `${fullName(emp)} — ${dto.title}`, '/requests');
    return r;
  }

  async decide(u: AuthUser, id: string, approve: boolean, comment?: string) {
    const r = await this.prisma.employeeRequest.findFirst({ where: { id, companyId: u.companyId } });
    if (!r) throw notFound('Request', 'الطلب غير موجود');
    const emp = await this.scope.employee(u, r.employeeId);
    if (r.status !== 'PENDING') throw badRequest('Only pending requests can be decided', 'يمكن البت في الطلبات المعلقة فقط');
    if (u.employeeId === r.employeeId && u.role === 'BRANCH_MANAGER') throw badRequest('You cannot approve your own request', 'لا يمكنك اعتماد طلبك بنفسك');

    // ---- validate everything before claiming the request ----
    let loanData: Prisma.LoanUncheckedCreateInput | undefined;
    let months = 0;
    if (approve && r.type === 'LOAN') {
      if (!LOAN_APPROVERS.includes(u.role)) {
        throw forbidden('Loan approval requires HR or payroll', 'اعتماد السلف من صلاحية الموارد البشرية أو الرواتب');
      }
      const amount = num(r.amount);
      if (amount <= 0) throw badRequest('Loan amount missing', 'مبلغ السلفة غير محدد');
      const payload = (r.payload ?? {}) as { months?: number };
      months = Math.max(1, Math.min(60, Number(payload.months) || 1));
      loanData = {
        companyId: u.companyId,
        employeeId: r.employeeId,
        amount,
        monthlyDeduction: r2(amount / months),
        remaining: amount,
        startPeriod: addMonths(periodOf(todayStr()), 1),
        note: r.title,
        requestId: r.id,
      };
    }
    const correction = approve && r.type === 'ATTENDANCE_CORRECTION' ? ((r.payload ?? {}) as { date?: string; checkIn?: string; checkOut?: string }) : null;
    if (correction && (!correction.date || !correction.checkIn)) throw badRequest('Invalid correction payload', 'بيانات التصحيح غير مكتملة');

    // ---- claim: only the first concurrent decision flips PENDING; side effects follow inside the same tx ----
    const status = approve ? 'APPROVED' : 'REJECTED';
    const loanId = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.employeeRequest.updateMany({
        where: { id, companyId: u.companyId, status: 'PENDING' },
        data: { status, approverId: u.id, approverName: u.name, decidedAt: new Date(), comment },
      });
      if (claimed.count === 0) throw conflict('Request already processed', 'تمت معالجة هذا الطلب مسبقاً');
      return loanData ? (await tx.loan.create({ data: loanData })).id : undefined;
    });
    if (loanId) await this.audit.log(u, 'CREATE', 'Loan', loanId, { fromRequest: r.id, amount: loanData!.amount, months });
    if (correction) {
      try {
        const rec = await this.attendance.upsertRecord(u.companyId, emp, correction.date!, correction.checkIn!, correction.checkOut, { source: 'CORRECTION', note: r.title });
        await this.audit.log(u, 'CORRECTION', 'AttendanceRecord', rec.id, correction);
      } catch (e) {
        // the correction could not be applied → hand the request back for a new decision
        await this.prisma.employeeRequest.updateMany({
          where: { id, status },
          data: { status: 'PENDING', approverId: null, approverName: null, decidedAt: null, comment: null },
        });
        throw e;
      }
    }
    const updated = await this.prisma.employeeRequest.findUniqueOrThrow({ where: { id }, include: { employee: empSelect } });
    await this.audit.log(u, approve ? 'APPROVE' : 'REJECT', 'EmployeeRequest', id, { comment, loanId });
    await this.notify.toEmployees(
      u.companyId,
      [r.employeeId],
      approve ? `تمت الموافقة على طلبك: ${REQUEST_TYPE_AR[r.type]}` : `تم رفض طلبك: ${REQUEST_TYPE_AR[r.type]}`,
      comment ?? r.title,
      '/me/requests',
    );
    return { ...updated, employee: empView(updated.employee), loanId };
  }

  // ---------- Loans ----------
  async loans(u: AuthUser, q: { status?: string; employeeId?: string }) {
    const data = await this.prisma.loan.findMany({
      where: {
        companyId: u.companyId,
        ...(q.status ? { status: q.status as Prisma.LoanWhereInput['status'] } : {}),
        ...(q.employeeId ? { employeeId: q.employeeId } : {}),
      },
      include: { employee: empSelect },
      orderBy: { createdAt: 'desc' },
    });
    return data.map((l) => ({ ...l, employee: empView(l.employee), paid: r2(num(l.amount) - num(l.remaining)) }));
  }

  async createLoan(u: AuthUser, dto: LoanDto) {
    await this.scope.employee(u, dto.employeeId);
    if (dto.monthlyDeduction > dto.amount) throw badRequest('monthlyDeduction exceeds amount', 'القسط الشهري أكبر من مبلغ السلفة');
    const l = await this.prisma.loan.create({
      data: { ...dto, companyId: u.companyId, remaining: dto.amount },
      include: { employee: empSelect },
    });
    await this.audit.log(u, 'CREATE', 'Loan', l.id, dto);
    return { ...l, employee: empView(l.employee) };
  }

  async updateLoan(u: AuthUser, id: string, dto: UpdateLoanDto) {
    const l = await this.prisma.loan.findFirst({ where: { id, companyId: u.companyId } });
    if (!l) throw notFound('Loan', 'السلفة غير موجودة');
    const data: Prisma.LoanUpdateInput = { ...dto };
    if (dto.remaining !== undefined && dto.remaining <= 0 && !dto.status) data.status = 'PAID';
    const updated = await this.prisma.loan.update({ where: { id }, data, include: { employee: empSelect } });
    await this.audit.log(u, 'UPDATE', 'Loan', id, dto);
    return { ...updated, employee: empView(updated.employee) };
  }
}
