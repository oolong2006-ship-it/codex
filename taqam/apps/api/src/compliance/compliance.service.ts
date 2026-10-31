import { Injectable } from '@nestjs/common';
import {
  branchLaborCost,
  calculateGosi,
  complianceDocCounts,
  governmentRisk,
  gosiRatesFor,
  laborCostTotals,
  LaborCostRow,
  nitaqatAlert,
  officialSaudization,
} from '@taqam/core';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../shared/scope.service';
import { PayrollService } from '../payroll/payroll.service';
import { EmployeesService } from '../employees/employees.service';
import { AuthUser } from '../common/types';
import { badRequest } from '../common/errors';
import { addMonths, periodRange, riyadhDateTime, todayStr } from '../common/dates';
import { num } from '../common/money';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Employed at some point during [start, end]: hired by the end and not terminated before the start. */
const employedDuring = (start: Date, end: Date) => ({
  hireDate: { lte: end },
  OR: [{ terminationDate: null, status: { not: 'TERMINATED' as const } }, { terminationDate: { gte: start } }],
});

/** Compliance center (spec §5): government-services risk + true labor cost per branch. */
@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly payroll: PayrollService,
    private readonly employees: EmployeesService,
  ) {}

  /**
   * Saudization and documents follow the user's scope (a branch manager sees their branch). WPS is a
   * company-level payroll matter: `wps` is null for branch managers and does not feed their risk.
   */
  async overview(u: AuthUser) {
    const today = todayStr();
    const isManager = u.role === 'BRANCH_MANAGER';
    const [staff, docs, wps] = await Promise.all([
      this.prisma.employee.findMany({
        where: this.scope.employeeWhere(u, { status: { not: 'TERMINATED' } }),
        select: { isSaudi: true, qiwaDocumented: true },
      }),
      this.employees.compliance(u),
      isManager ? Promise.resolve(null) : this.wpsStatus(u, today),
    ]);
    const s = officialSaudization(staff);
    const split = complianceDocCounts(docs.items);
    const risk = governmentRisk({
      band: s.band,
      marginToDrop: s.marginToDrop,
      undocumentedSaudis: s.undocumentedSaudis,
      total: s.total,
      prevMonthWpsExported: wps ? wps.exported || !wps.due : true,
      dayOfMonth: Number(today.slice(8, 10)),
      latestWpsErrors: wps?.errors ?? 0,
      ...split,
    });
    return {
      /** BRANCH: a branch manager's figures cover their branch only (as GET /saudization) */
      scope: isManager ? ('BRANCH' as const) : ('COMPANY' as const),
      risk,
      saudization: { ...s, alert: nitaqatAlert(s) },
      wps,
      documents: { ...docs.counts, ...split },
    };
  }

  /**
   * Previous month's WPS export + the latest run's check errors. The export is due only when the company
   * existed before the end of last month (Riyadh) and employed someone that month.
   */
  private async wpsStatus(u: AuthUser, today: string) {
    const prevPeriod = addMonths(today.slice(0, 7), -1);
    const { start, end } = periodRange(prevPeriod);
    const monthStart = riyadhDateTime(`${today.slice(0, 7)}-01`, '00:00');
    const [prevRun, latest, employedPrev, company] = await Promise.all([
      this.prisma.payrollRun.findUnique({ where: { companyId_period: { companyId: u.companyId, period: prevPeriod } }, select: { wpsExportedAt: true } }),
      this.prisma.payrollRun.findFirst({ where: { companyId: u.companyId, status: { not: 'DRAFT' } }, orderBy: { period: 'desc' }, select: { id: true, period: true } }),
      this.prisma.employee.count({ where: { companyId: u.companyId, ...employedDuring(start, end) } }),
      this.prisma.company.findUniqueOrThrow({ where: { id: u.companyId }, select: { createdAt: true } }),
    ]);
    const errors = latest ? (await this.payroll.wpsCheck(u, latest.id)).errors : 0;
    return {
      prevPeriod,
      due: employedPrev > 0 && company.createdAt < monthStart,
      exported: !!prevRun?.wpsExportedAt,
      exportedAt: prevRun?.wpsExportedAt ?? null,
      latestRunId: latest?.id ?? null,
      latestRunPeriod: latest?.period ?? null,
      errors,
    };
  }

  /**
   * True labor cost per branch for a period: the period run's payslips when it has been calculated,
   * else contract salaries of staff employed during the period (`estimated: true`). Staff terminated
   * before the period are excluded; branch is the employee's current branch.
   */
  async branchCosts(u: AuthUser, periodQ?: string) {
    const period = periodQ || todayStr().slice(0, 7);
    if (!PERIOD.test(period)) throw badRequest('Invalid period (expected YYYY-MM)', 'الفترة غير صالحة (الصيغة YYYY-MM)');
    const { start, end } = periodRange(period);
    const [company, branches, run] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: u.companyId }, select: { expatLevyMonthly: true, iqamaFeeAnnual: true } }),
      this.prisma.branch.findMany({
        where: { companyId: u.companyId, ...(u.role === 'BRANCH_MANAGER' ? { id: u.branchId ?? '__none__' } : {}) },
        orderBy: { createdAt: 'asc' },
        select: { id: true, nameAr: true },
      }),
      this.prisma.payrollRun.findUnique({ where: { companyId_period: { companyId: u.companyId, period } }, select: { id: true, status: true } }),
    ]);
    const fees = { expatLevyMonthly: num(company.expatLevyMonthly), iqamaFeeAnnual: num(company.iqamaFeeAnnual) };
    const estimated = !run || run.status === 'DRAFT';

    let rows: LaborCostRow[];
    if (!estimated) {
      const slips = await this.prisma.payslip.findMany({
        where: { payrollRunId: run!.id, companyId: u.companyId, employee: this.scope.employeeWhere(u) },
        select: { gross: true, gosiEmployer: true, employee: { select: { branchId: true, isSaudi: true, employeeNumber: true } } },
        orderBy: { employee: { employeeNumber: 'asc' } },
      });
      rows = slips.map((s) => ({ branchId: s.employee.branchId, isSaudi: s.employee.isSaudi, gross: num(s.gross), gosiEmployer: num(s.gosiEmployer) }));
    } else {
      const staff = await this.prisma.employee.findMany({
        where: this.scope.employeeWhere(u, employedDuring(start, end)),
        select: {
          branchId: true,
          isSaudi: true,
          basicSalary: true,
          housingAllowance: true,
          transportAllowance: true,
          otherAllowances: true,
          gosiRegistered: true,
          gosiFirstRegisteredAt: true,
        },
        orderBy: { employeeNumber: 'asc' },
      });
      rows = staff.map((e) => {
        const basic = num(e.basicSalary);
        const housing = num(e.housingAllowance);
        const rates = gosiRatesFor({ isSaudi: e.isSaudi, firstRegisteredAt: e.gosiFirstRegisteredAt }, period);
        return {
          branchId: e.branchId,
          isSaudi: e.isSaudi,
          gross: basic + housing + num(e.transportAllowance) + num(e.otherAllowances),
          gosiEmployer: e.gosiRegistered ? calculateGosi({ basic, housing, isSaudi: e.isSaudi }, rates).employer : 0,
        };
      });
    }

    const order = new Map(branches.map((b, i) => [b.id, i]));
    const names = new Map(branches.map((b) => [b.id, b.nameAr]));
    const rank = (id: string | null) => (id !== null && order.has(id) ? order.get(id)! : branches.length);
    const out = branchLaborCost(rows, fees)
      .sort((a, b) => rank(a.branchId) - rank(b.branchId))
      .map((r) => ({ ...r, branchName: r.branchId ? names.get(r.branchId) ?? null : null }));
    return { period, estimated, runId: estimated ? null : run!.id, fees, branches: out, totals: laborCostTotals(out) };
  }
}
