import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import {
  bankCodeFromIban,
  calculateEndOfService,
  expiryStatus,
  TerminationReason,
  validateSaudiIban,
} from '@taqam/core';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../shared/audit.service';
import { ScopeService } from '../shared/scope.service';
import { LeaveCalcService } from '../shared/leave-calc.service';
import { AuthUser } from '../common/types';
import { addDays, day, todayStr } from '../common/dates';
import { badRequest, conflict, notFound } from '../common/errors';
import { num } from '../common/money';
import { pageParams } from '../common/pagination';
import { CreateEmployeeDto, DocumentDto, TerminateDto, UpdateEmployeeDto } from './employees.dto';
import { employeeInclude, employeeView, fullName } from './employee.view';

const AVATAR_COLORS = ['#0F3D3E', '#145A5C', '#1F7A7C', '#F2A541', '#3B7EA1', '#2E8B57', '#C8553D', '#7A5C99'];
const DATE_FIELDS = ['birthDate', 'idExpiry', 'passportExpiry', 'hireDate', 'contractEndDate', 'probationEndDate', 'terminationDate'] as const;

export interface EmployeeQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  branchId?: string;
  departmentId?: string;
  status?: string;
  nationality?: string;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly leaves: LeaveCalcService,
  ) {}

  async list(u: AuthUser, q: EmployeeQuery) {
    const { page, pageSize, skip, take } = pageParams(q);
    const extra: Prisma.EmployeeWhereInput = {};
    if (q.branchId) extra.branchId = q.branchId;
    if (q.departmentId) extra.departmentId = q.departmentId;
    if (q.status && ['ACTIVE', 'ON_LEAVE', 'TERMINATED'].includes(q.status)) extra.status = q.status as Prisma.EmployeeWhereInput['status'];
    if (q.nationality === 'SA') extra.isSaudi = true;
    else if (q.nationality === 'NON_SA') extra.isSaudi = false;
    else if (q.nationality && q.nationality.length === 2) extra.nationality = q.nationality.toUpperCase();
    if (q.search?.trim()) {
      const s = q.search.trim();
      const parts = s.split(/\s+/);
      extra.OR = [
        { firstNameAr: { contains: s, mode: 'insensitive' } },
        { lastNameAr: { contains: s, mode: 'insensitive' } },
        { fullNameEn: { contains: s, mode: 'insensitive' } },
        { employeeNumber: { contains: s, mode: 'insensitive' } },
        { nationalId: { contains: s } },
        { phone: { contains: s } },
        { email: { contains: s, mode: 'insensitive' } },
        { jobTitle: { contains: s, mode: 'insensitive' } },
        ...(parts.length > 1
          ? [{ AND: [{ firstNameAr: { contains: parts[0] } }, { lastNameAr: { contains: parts.slice(1).join(' ') } }] }]
          : []),
      ];
    }
    const where = this.scope.employeeWhere(u, extra);
    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({ where, include: employeeInclude, orderBy: { employeeNumber: 'asc' }, skip, take }),
      this.prisma.employee.count({ where }),
    ]);
    return { data: data.map(employeeView), total, page, pageSize };
  }

  async detail(u: AuthUser, id: string) {
    await this.scope.employee(u, id);
    const e = await this.prisma.employee.findUniqueOrThrow({
      where: { id },
      include: { ...employeeInclude, documents: { orderBy: { expiryDate: 'asc' } }, user: { select: { id: true, email: true, role: true } } },
    });
    const { documents, user, ...rest } = e;
    const leaveBalance = await this.leaves.annualBalance(e);
    const today = todayStr();
    return {
      ...employeeView(rest),
      documents: documents.map((d) => ({ ...d, status: expiryStatus(d.expiryDate, today) })),
      leaveBalance,
      user: user ?? null,
    };
  }

  private async validateRefs(u: AuthUser, dto: Partial<CreateEmployeeDto>, selfId?: string) {
    if (dto.branchId) {
      if (!(await this.prisma.branch.findFirst({ where: { id: dto.branchId, companyId: u.companyId } }))) {
        throw badRequest('Invalid branchId', 'الفرع غير موجود');
      }
    }
    if (dto.departmentId) {
      if (!(await this.prisma.department.findFirst({ where: { id: dto.departmentId, companyId: u.companyId } }))) {
        throw badRequest('Invalid departmentId', 'القسم غير موجود');
      }
    }
    if (dto.managerId) {
      if (dto.managerId === selfId) throw badRequest('Employee cannot manage themselves', 'لا يمكن أن يكون الموظف مديراً لنفسه');
      if (!(await this.prisma.employee.findFirst({ where: { id: dto.managerId, companyId: u.companyId } }))) {
        throw badRequest('Invalid managerId', 'المدير غير موجود');
      }
    }
  }

  private toData(dto: Partial<CreateEmployeeDto & { terminationDate?: string | null }>) {
    const { createUser: _cu, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };
    for (const f of DATE_FIELDS) {
      const v = (dto as Record<string, unknown>)[f];
      if (v !== undefined) data[f] = v ? day(v as string) : null;
    }
    if (dto.nationality) data.isSaudi = dto.nationality === 'SA';
    if (dto.iban) {
      const iban = dto.iban.replace(/\s+/g, '').toUpperCase();
      if (!validateSaudiIban(iban)) throw badRequest('Invalid Saudi IBAN', 'رقم الآيبان غير صالح');
      data.iban = iban;
      data.bankCode = dto.bankCode || bankCodeFromIban(iban);
    }
    for (const k of ['branchId', 'departmentId', 'managerId']) if (data[k] === '') data[k] = null;
    return data;
  }

  private async nextNumber(companyId: string) {
    const existing = await this.prisma.employee.findMany({ where: { companyId, employeeNumber: { startsWith: 'EMP-' } }, select: { employeeNumber: true } });
    const max = existing.reduce((m, e) => Math.max(m, Number(e.employeeNumber.slice(4)) || 0), 0);
    return `EMP-${String(max + 1).padStart(4, '0')}`;
  }

  async create(u: AuthUser, dto: CreateEmployeeDto) {
    await this.validateRefs(u, dto);
    if (dto.createUser && (await this.prisma.user.findUnique({ where: { email: dto.createUser.email.toLowerCase() } }))) {
      throw conflict('Login email already in use', 'البريد الإلكتروني للدخول مستخدم مسبقاً');
    }
    const employeeNumber = dto.employeeNumber || (await this.nextNumber(u.companyId));
    if (await this.prisma.employee.findFirst({ where: { companyId: u.companyId, employeeNumber } })) {
      throw conflict('Employee number already exists', 'الرقم الوظيفي مستخدم مسبقاً');
    }
    const data = this.toData(dto);
    const count = await this.prisma.employee.count({ where: { companyId: u.companyId } });
    const emp = await this.prisma.$transaction(async (tx) => {
      const e = await tx.employee.create({
        data: {
          ...(data as Prisma.EmployeeUncheckedCreateInput),
          employeeNumber,
          companyId: u.companyId,
          avatarColor: dto.avatarColor || AVATAR_COLORS[count % AVATAR_COLORS.length],
        },
        include: employeeInclude,
      });
      if (dto.createUser) {
        await tx.user.create({
          data: {
            companyId: u.companyId,
            email: dto.createUser.email.toLowerCase(),
            name: fullName(e),
            role: 'EMPLOYEE',
            employeeId: e.id,
            passwordHash: await bcrypt.hash(dto.createUser.password, 10),
          },
        });
      }
      return e;
    });
    await this.audit.log(u, 'CREATE', 'Employee', emp.id, { employeeNumber, name: fullName(emp) });
    return employeeView(emp);
  }

  async update(u: AuthUser, id: string, dto: UpdateEmployeeDto) {
    await this.scope.employee(u, id);
    await this.validateRefs(u, dto, id);
    if (dto.employeeNumber) {
      const dup = await this.prisma.employee.findFirst({ where: { companyId: u.companyId, employeeNumber: dto.employeeNumber, id: { not: id } } });
      if (dup) throw conflict('Employee number already exists', 'الرقم الوظيفي مستخدم مسبقاً');
    }
    const data = this.toData(dto);
    const e = await this.prisma.employee.update({ where: { id }, data: data as Prisma.EmployeeUncheckedUpdateInput, include: employeeInclude });
    await this.audit.log(u, 'UPDATE', 'Employee', id, dto);
    return employeeView(e);
  }

  async eosb(u: AuthUser, id: string, endDate?: string, reason?: string) {
    const e = await this.scope.employee(u, id);
    const r = (reason || 'EMPLOYER_TERMINATION') as TerminationReason;
    const end = endDate || (e.terminationDate ? e.terminationDate.toISOString().slice(0, 10) : todayStr());
    const bal = await this.leaves.annualBalance(e, end);
    return calculateEndOfService({
      startDate: e.hireDate,
      endDate: end,
      reason: r,
      wage: { basic: num(e.basicSalary), housing: num(e.housingAllowance), transport: num(e.transportAllowance), other: num(e.otherAllowances) },
      unusedLeaveDays: Math.max(0, bal.balance),
    });
  }

  async terminate(u: AuthUser, id: string, dto: TerminateDto) {
    const e = await this.scope.employee(u, id);
    if (e.status === 'TERMINATED') throw badRequest('Employee already terminated', 'تم إنهاء خدمة الموظف مسبقاً');
    if (day(dto.terminationDate) < e.hireDate) throw badRequest('Termination before hire date', 'تاريخ إنهاء الخدمة قبل تاريخ التعيين');
    const eosb = await this.eosb(u, id, dto.terminationDate, dto.reason);
    const employee = await this.prisma.employee.update({
      where: { id },
      data: { status: 'TERMINATED', terminationDate: day(dto.terminationDate), terminationReason: dto.reason },
      include: employeeInclude,
    });
    await this.prisma.user.updateMany({ where: { employeeId: id }, data: { isActive: false } });
    await this.audit.log(u, 'TERMINATE', 'Employee', id, { ...dto, eosbTotal: eosb.total });
    return { employee: employeeView(employee), eosb };
  }

  // ---------- Documents ----------
  async documents(u: AuthUser, employeeId: string) {
    await this.scope.employee(u, employeeId);
    const docs = await this.prisma.employeeDocument.findMany({ where: { employeeId, companyId: u.companyId }, orderBy: { createdAt: 'desc' } });
    const today = todayStr();
    return docs.map((d) => ({ ...d, status: expiryStatus(d.expiryDate, today) }));
  }

  async addDocument(u: AuthUser, employeeId: string, dto: DocumentDto) {
    await this.scope.employee(u, employeeId);
    const d = await this.prisma.employeeDocument.create({
      data: {
        companyId: u.companyId,
        employeeId,
        type: dto.type,
        number: dto.number,
        note: dto.note,
        issueDate: dto.issueDate ? day(dto.issueDate) : null,
        expiryDate: dto.expiryDate ? day(dto.expiryDate) : null,
      },
    });
    if (dto.type === 'IQAMA' && dto.expiryDate) {
      await this.prisma.employee.update({ where: { id: employeeId }, data: { idExpiry: day(dto.expiryDate) } });
    }
    if (dto.type === 'PASSPORT' && dto.expiryDate) {
      await this.prisma.employee.update({
        where: { id: employeeId },
        data: { passportExpiry: day(dto.expiryDate), ...(dto.number ? { passportNumber: dto.number } : {}) },
      });
    }
    await this.audit.log(u, 'CREATE', 'EmployeeDocument', d.id, { employeeId, ...dto });
    return { ...d, status: expiryStatus(d.expiryDate, todayStr()) };
  }

  async deleteDocument(u: AuthUser, employeeId: string, docId: string) {
    await this.scope.employee(u, employeeId);
    const d = await this.prisma.employeeDocument.findFirst({ where: { id: docId, employeeId, companyId: u.companyId } });
    if (!d) throw notFound('Document', 'المستند غير موجود');
    await this.prisma.employeeDocument.delete({ where: { id: docId } });
    await this.audit.log(u, 'DELETE', 'EmployeeDocument', docId, { employeeId, type: d.type });
    return { ok: true };
  }

  async expiring(u: AuthUser, days = 90) {
    const today = todayStr();
    const docs = await this.prisma.employeeDocument.findMany({
      where: {
        companyId: u.companyId,
        expiryDate: { not: null, lte: addDays(today, days) },
        employee: this.scope.employeeWhere(u, { status: { not: 'TERMINATED' } }),
      },
      include: { employee: { select: { id: true, firstNameAr: true, lastNameAr: true, branch: { select: { nameAr: true } } } } },
      orderBy: { expiryDate: 'asc' },
    });
    return docs.map((d) => ({
      id: d.id,
      employeeId: d.employeeId,
      employeeName: fullName(d.employee),
      branchName: d.employee.branch?.nameAr ?? null,
      type: d.type,
      number: d.number,
      expiryDate: d.expiryDate,
      status: expiryStatus(d.expiryDate, today),
    }));
  }

  async orgChart(u: AuthUser) {
    const emps = await this.prisma.employee.findMany({
      where: this.scope.employeeWhere(u, { status: { not: 'TERMINATED' } }),
      include: { branch: { select: { nameAr: true } } },
      orderBy: { employeeNumber: 'asc' },
    });
    return emps.map((e) => ({
      id: e.id,
      name: fullName(e),
      jobTitle: e.jobTitle,
      managerId: e.managerId,
      branchName: e.branch?.nameAr ?? null,
      avatarColor: e.avatarColor,
    }));
  }
}
