import { Injectable } from '@nestjs/common';
import { Payslip, Prisma } from '@prisma/client';
import { checkWpsRun, generateWpsCsv } from '@taqam/core';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../shared/audit.service';
import { NotifyService } from '../shared/notifications.service';
import { ScopeService } from '../shared/scope.service';
import { AuthUser } from '../common/types';
import { badRequest, conflict, notFound } from '../common/errors';
import { num, r2 } from '../common/money';
import { periodRange, todayStr } from '../common/dates';
import { fullName } from '../employees/employee.view';
import { approvePayrollRun, calculatePayrollRun, PayrollStateError } from './payroll.engine';
import { AdjustmentDto } from './payroll.dto';
import { wpsCheckPaymentDate, wpsCheckRow, wpsScheduledPaymentDate } from './wps-check';

export const payslipInclude = {
  employee: {
    select: {
      id: true,
      employeeNumber: true,
      firstNameAr: true,
      lastNameAr: true,
      fullNameEn: true,
      iban: true,
      bankCode: true,
      isSaudi: true,
      nationalId: true,
      jobTitle: true,
      branch: { select: { nameAr: true } },
    },
  },
  payrollRun: { select: { status: true } },
} satisfies Prisma.PayslipInclude;

type PayslipWithRel = Prisma.PayslipGetPayload<{ include: typeof payslipInclude }>;

export function payslipView(p: PayslipWithRel) {
  const { employee: e, payrollRun, inputs: _i, loanDeductions: _l, ...rest } = p;
  return {
    ...rest,
    status: payrollRun.status,
    employee: {
      id: e.id,
      employeeNumber: e.employeeNumber,
      name: fullName(e),
      nameEn: e.fullNameEn,
      jobTitle: e.jobTitle,
      branchName: e.branch?.nameAr ?? null,
      iban: e.iban,
      isSaudi: e.isSaudi,
    },
  };
}

const lineAmount = (lines: unknown, code: string) =>
  ((lines ?? []) as { code: string; amount: number }[]).filter((l) => l.code === code).reduce((s, l) => s + l.amount, 0);

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
    private readonly scope: ScopeService,
  ) {}

  runs(u: AuthUser) {
    return this.prisma.payrollRun.findMany({ where: { companyId: u.companyId }, orderBy: { period: 'desc' } });
  }

  private async getRun(u: AuthUser, id: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, companyId: u.companyId } });
    if (!run) throw notFound('Payroll run', 'مسير الرواتب غير موجود');
    return run;
  }

  async createRun(u: AuthUser, period: string) {
    const exists = await this.prisma.payrollRun.findUnique({ where: { companyId_period: { companyId: u.companyId, period } } });
    if (exists) throw conflict(`Payroll run for ${period} already exists`, `يوجد مسير رواتب لشهر ${period} مسبقاً`);
    const run = await this.prisma.payrollRun.create({ data: { companyId: u.companyId, period } });
    await this.audit.log(u, 'CREATE', 'PayrollRun', run.id, { period });
    return run;
  }

  private mapStateError(e: unknown): never {
    if (e instanceof PayrollStateError) {
      if (e.message === 'NOT_FOUND') throw notFound('Payroll run', 'مسير الرواتب غير موجود');
      if (e.message === 'LOCKED') throw badRequest('Run is already approved', 'لا يمكن إعادة احتساب مسير معتمد');
      if (e.message === 'ALREADY_PROCESSED') throw conflict('Payroll run was already processed', 'تمت معالجة هذا الطلب مسبقاً');
      if (e.message === 'NOT_CALCULATED') throw badRequest('Run must be CALCULATED first', 'يجب احتساب المسير قبل اعتماده');
    }
    throw e;
  }

  async calculate(u: AuthUser, id: string) {
    const run = await calculatePayrollRun(this.prisma, u.companyId, id).catch((e) => this.mapStateError(e));
    await this.audit.log(u, 'CALCULATE', 'PayrollRun', id, { period: run.period, totalNet: run.totalNet });
    return this.detail(u, id);
  }

  async detail(u: AuthUser, id: string) {
    const run = await this.getRun(u, id);
    const payslips = await this.prisma.payslip.findMany({
      where: { payrollRunId: id },
      include: payslipInclude,
      orderBy: { employee: { employeeNumber: 'asc' } },
    });
    return { ...run, payslips: payslips.map(payslipView) };
  }

  async approve(u: AuthUser, id: string) {
    const run = await approvePayrollRun(this.prisma, u.companyId, id, u).catch((e) => this.mapStateError(e));
    await this.audit.log(u, 'APPROVE', 'PayrollRun', id, { period: run.period });
    return run;
  }

  async markPaid(u: AuthUser, id: string) {
    const run = await this.getRun(u, id);
    if (run.status !== 'APPROVED') throw badRequest('Run must be APPROVED first', 'يجب اعتماد المسير قبل تأكيد الصرف');
    const updated = await this.prisma.payrollRun.update({ where: { id }, data: { status: 'PAID', paidAt: new Date() } });
    const slips = await this.prisma.payslip.findMany({ where: { payrollRunId: id }, select: { id: true, employeeId: true } });
    const users = await this.prisma.user.findMany({
      where: { companyId: u.companyId, employeeId: { in: slips.map((s) => s.employeeId) }, isActive: true },
      select: { id: true, employeeId: true },
    });
    const slipByEmp = new Map(slips.map((s) => [s.employeeId, s.id]));
    if (users.length) {
      await this.prisma.notification.createMany({
        data: users.map((x) => ({
          companyId: u.companyId,
          userId: x.id,
          title: `تم صرف راتب شهر ${run.period}`,
          body: 'قسيمة الراتب متاحة الآن في الخدمة الذاتية',
          link: `/me/payslips/${slipByEmp.get(x.employeeId!)}`,
        })),
      });
    }
    await this.audit.log(u, 'MARK_PAID', 'PayrollRun', id, { period: run.period, notified: users.length });
    return updated;
  }

  async remove(u: AuthUser, id: string) {
    const run = await this.getRun(u, id);
    if (run.status !== 'DRAFT' && run.status !== 'CALCULATED') {
      throw badRequest('Only DRAFT/CALCULATED runs can be deleted', 'لا يمكن حذف مسير معتمد أو مصروف');
    }
    await this.prisma.payrollRun.delete({ where: { id } });
    await this.audit.log(u, 'DELETE', 'PayrollRun', id, { period: run.period });
    return { ok: true };
  }

  async wps(u: AuthUser, id: string) {
    const run = await this.getRun(u, id);
    if (run.status === 'DRAFT') throw badRequest('Run is not calculated', 'يجب احتساب المسير أولاً');
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: u.companyId } });
    const slips = await this.prisma.payslip.findMany({
      where: { payrollRunId: id },
      include: { employee: true },
      orderBy: { employee: { employeeNumber: 'asc' } },
    });
    const paymentDate = wpsScheduledPaymentDate(run, company.payrollDay);
    const rows = slips.map((s: Payslip & { employee: { employeeNumber: string; nationalId: string; fullNameEn: string | null; firstNameAr: string; lastNameAr: string; iban: string | null; bankCode: string | null } }) => {
      const basic = lineAmount(s.earnings, 'BASIC');
      const housing = lineAmount(s.earnings, 'HOUSING');
      return {
        employeeNumber: s.employee.employeeNumber,
        nationalId: s.employee.nationalId,
        nameEn: s.employee.fullNameEn || fullName(s.employee),
        iban: s.employee.iban || '',
        bankCode: s.employee.bankCode || '',
        basic,
        housing,
        otherEarnings: r2(num(s.gross) - basic - housing),
        deductions: num(s.totalDeductions),
        net: num(s.net),
      };
    });
    const result = generateWpsCsv(
      {
        establishmentId: company.establishmentId || '',
        companyNameEn: company.nameEn || company.nameAr,
        companyIban: company.iban || '',
        bankCode: company.bankCode || '',
        period: run.period,
        paymentDate,
      },
      rows,
    );
    await this.audit.log(u, 'EXPORT_WPS', 'PayrollRun', id, { count: result.count, errors: result.errors.length });
    return { ...result, period: run.period };
  }

  /** The WPS file was handed out (not a validate-only call): remember when, for the pre-upload checker. */
  async markWpsExported(u: AuthUser, id: string) {
    await this.prisma.payrollRun.updateMany({ where: { id, companyId: u.companyId }, data: { wpsExportedAt: new Date() } });
  }

  /**
   * Mudad pre-upload check (spec §2). "Active" = employed during the period as of the period:
   * hired on/before its end and not terminated before its start (any status, ON_LEAVE included), so
   * staff who left before the period are never reported missing, while a mid-period leaver still is.
   * `paymentDate` is the date LATE_PAYMENT is tested against (see wpsCheckPaymentDate).
   */
  async wpsCheck(u: AuthUser, id: string) {
    const run = await this.getRun(u, id);
    if (run.status === 'DRAFT') throw badRequest('Run is not calculated', 'يجب احتساب المسير أولاً');
    const { start, end } = periodRange(run.period);
    const employeeSelect = { id: true, employeeNumber: true, firstNameAr: true, lastNameAr: true } as const;
    const [company, slips, active] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: u.companyId }, select: { payrollDay: true } }),
      this.prisma.payslip.findMany({
        where: { payrollRunId: id, companyId: u.companyId },
        include: { employee: { select: { ...employeeSelect, nationalId: true, iban: true, basicSalary: true } } },
        orderBy: { employee: { employeeNumber: 'asc' } },
      }),
      this.prisma.employee.findMany({
        where: {
          companyId: u.companyId,
          hireDate: { lte: end },
          OR: [{ terminationDate: null, status: { not: 'TERMINATED' } }, { terminationDate: { gte: start } }],
        },
        select: employeeSelect,
        orderBy: { employeeNumber: 'asc' },
      }),
    ]);
    const { paymentDate, scheduledPaymentDate } = wpsCheckPaymentDate(run, company.payrollDay, todayStr());
    const rows = slips.map((s) => wpsCheckRow(s, run.status));
    const result = checkWpsRun({ period: run.period, paymentDate, rows, activeEmployeeNumbers: active.map((e) => e.employeeNumber) });
    const byNumber = new Map([...slips.map((s) => s.employee), ...active].map((e) => [e.employeeNumber, e]));
    return {
      period: run.period,
      paymentDate,
      scheduledPaymentDate,
      exportedAt: run.wpsExportedAt,
      ready: result.ready,
      errors: result.errors,
      warnings: result.warnings,
      issues: result.issues.map((i) => {
        const e = i.employeeNumber ? byNumber.get(i.employeeNumber) : undefined;
        return { ...i, employeeId: e?.id ?? null, employeeName: e ? fullName(e) : null };
      }),
    };
  }

  async payslip(u: AuthUser, id: string) {
    const p = await this.prisma.payslip.findFirst({ where: { id, companyId: u.companyId }, include: payslipInclude });
    if (!p) throw notFound('Payslip', 'قسيمة الراتب غير موجودة');
    return payslipView(p);
  }

  // ---------- Adjustments ----------
  async adjustments(u: AuthUser, q: { period?: string; employeeId?: string }) {
    const data = await this.prisma.payrollAdjustment.findMany({
      where: { companyId: u.companyId, ...(q.period ? { period: q.period } : {}), ...(q.employeeId ? { employeeId: q.employeeId } : {}) },
      include: { employee: { select: { id: true, firstNameAr: true, lastNameAr: true, employeeNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return data.map((a) => ({ ...a, employee: { id: a.employee.id, name: fullName(a.employee), employeeNumber: a.employee.employeeNumber } }));
  }

  private async assertPeriodOpen(companyId: string, period: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { companyId_period: { companyId, period } } });
    if (run && (run.status === 'APPROVED' || run.status === 'PAID')) {
      throw badRequest('Payroll for this period is already approved', 'مسير هذا الشهر معتمد ولا يمكن تعديله');
    }
  }

  async createAdjustment(u: AuthUser, dto: AdjustmentDto) {
    await this.scope.employee(u, dto.employeeId);
    await this.assertPeriodOpen(u.companyId, dto.period);
    const a = await this.prisma.payrollAdjustment.create({ data: { ...dto, companyId: u.companyId, createdById: u.id } });
    await this.audit.log(u, 'CREATE', 'PayrollAdjustment', a.id, dto);
    return a;
  }

  async deleteAdjustment(u: AuthUser, id: string) {
    const a = await this.prisma.payrollAdjustment.findFirst({ where: { id, companyId: u.companyId } });
    if (!a) throw notFound('Adjustment', 'التسوية غير موجودة');
    await this.assertPeriodOpen(u.companyId, a.period);
    await this.prisma.payrollAdjustment.delete({ where: { id } });
    await this.audit.log(u, 'DELETE', 'PayrollAdjustment', id);
    return { ok: true };
  }
}
