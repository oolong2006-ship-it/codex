/** Demo API — compliance center (spec §5): port of apps/api/src/compliance (same paths, fields, codes and messages). */
import {
  branchLaborCost, calculateGosi, complianceDocCounts, governmentRisk, gosiRatesFor, laborCostTotals, nitaqatAlert, officialSaudization, type LaborCostRow,
} from '@taqam/core';
import { addMonths, periodRange, todayStr } from './dates';
import { badRequest } from './errors';
import { byCreatedAsc, PERIOD_RE, route, type Route } from './router';
import { documentsCompliance } from './routes-core';
import { wpsCheck } from './routes-more';
import { STAFF, Services, byNumber, type AuthUser } from './services';
import type { Employee } from './db';

/** Employed at some point during the period: hired by its end and not terminated before its start. */
const employedDuring = (start: string, end: string) => (e: Employee) =>
  e.hireDate <= end && (e.terminationDate ? e.terminationDate >= start : e.status !== 'TERMINATED');

/** Previous month's WPS export (due only when someone was employed that month) + the latest run's check errors. */
function wpsStatus(svc: Services, u: AuthUser, today: string) {
  const prevPeriod = addMonths(today.slice(0, 7), -1);
  const { start, end } = periodRange(prevPeriod);
  const runs = svc.db.runs.filter((r) => r.companyId === u.companyId);
  const prevRun = runs.find((r) => r.period === prevPeriod);
  const latest = runs.filter((r) => r.status !== 'DRAFT').sort((a, b) => b.period.localeCompare(a.period))[0];
  // due only for a company that existed before the end of last month (Riyadh) and employed someone then
  const existed = new Date(svc.company(u.companyId).createdAt) < new Date(`${today.slice(0, 7)}-01T00:00:00+03:00`);
  const due = existed && svc.db.employees.some((e) => e.companyId === u.companyId && employedDuring(start, end)(e));
  return {
    prevPeriod,
    due,
    exported: !!prevRun?.wpsExportedAt,
    exportedAt: prevRun?.wpsExportedAt ?? null,
    latestRunId: latest?.id ?? null,
    latestRunPeriod: latest?.period ?? null,
    errors: latest ? wpsCheck(svc, u, latest.id).errors : 0,
  };
}

function overview(svc: Services, u: AuthUser) {
  const today = todayStr();
  const where = svc.employeeWhere(u);
  const s = officialSaudization(svc.db.employees.filter((e) => where(e) && e.status !== 'TERMINATED'));
  const docs = documentsCompliance(svc, u);
  const split = complianceDocCounts(docs.items);
  // WPS is a company-level payroll matter: not shown to (nor counted for) a branch manager
  const wps = u.role === 'BRANCH_MANAGER' ? null : wpsStatus(svc, u, today);
  const risk = governmentRisk({
    band: s.band, marginToDrop: s.marginToDrop, undocumentedSaudis: s.undocumentedSaudis, total: s.total,
    prevMonthWpsExported: wps ? wps.exported || !wps.due : true,
    dayOfMonth: Number(today.slice(8, 10)),
    latestWpsErrors: wps?.errors ?? 0,
    ...split,
  });
  return { scope: u.role === 'BRANCH_MANAGER' ? 'BRANCH' : 'COMPANY', risk, saudization: { ...s, alert: nitaqatAlert(s) }, wps, documents: { ...docs.counts, ...split } };
}

function branchCosts(svc: Services, u: AuthUser, periodQ?: string) {
  const period = periodQ || todayStr().slice(0, 7);
  if (!PERIOD_RE.test(period)) throw badRequest('Invalid period (expected YYYY-MM)', 'الفترة غير صالحة (الصيغة YYYY-MM)');
  const { start, end } = periodRange(period);
  const company = svc.company(u.companyId);
  const fees = { expatLevyMonthly: company.expatLevyMonthly ?? 800, iqamaFeeAnnual: company.iqamaFeeAnnual ?? 650 };
  const branches = svc.db.branches.filter((b) => b.companyId === u.companyId && (u.role !== 'BRANCH_MANAGER' || b.id === u.branchId)).sort(byCreatedAsc);
  const run = svc.db.runs.find((r) => r.companyId === u.companyId && r.period === period);
  const estimated = !run || run.status === 'DRAFT';
  const where = svc.employeeWhere(u);
  let rows: LaborCostRow[];
  if (!estimated) {
    rows = svc.db.payslips
      .filter((p) => p.companyId === u.companyId && p.payrollRunId === run!.id)
      .map((p) => ({ p, e: svc.emp(p.employeeId)! }))
      .filter(({ e }) => e && where(e))
      .sort((a, b) => byNumber(a.e, b.e))
      .map(({ p, e }) => ({ branchId: e.branchId, isSaudi: e.isSaudi, gross: p.gross, gosiEmployer: p.gosiEmployer }));
  } else {
    rows = svc.db.employees
      .filter((e) => where(e) && employedDuring(start, end)(e))
      .sort(byNumber)
      .map((e) => {
        const rates = gosiRatesFor({ isSaudi: e.isSaudi, firstRegisteredAt: e.gosiFirstRegisteredAt ?? null }, period);
        return {
          branchId: e.branchId,
          isSaudi: e.isSaudi,
          gross: e.basicSalary + e.housingAllowance + e.transportAllowance + e.otherAllowances,
          gosiEmployer: e.gosiRegistered ? calculateGosi({ basic: e.basicSalary, housing: e.housingAllowance, isSaudi: e.isSaudi }, rates).employer : 0,
        };
      });
  }
  const order = new Map(branches.map((b, i) => [b.id, i]));
  const rank = (id: string | null) => (id !== null && order.has(id) ? order.get(id)! : branches.length);
  const out = branchLaborCost(rows, fees)
    .sort((a, b) => rank(a.branchId) - rank(b.branchId))
    .map((r) => ({ ...r, branchName: r.branchId ? branches.find((b) => b.id === r.branchId)?.nameAr ?? null : null }));
  return { period, estimated, runId: estimated ? null : run!.id, fees, branches: out, totals: laborCostTotals(out) };
}

export const complianceRoutes: Route[] = [
  route('GET', '/compliance/overview', STAFF, ({ svc, user }) => overview(svc, user)),
  route('GET', '/compliance/branch-costs', STAFF, ({ svc, user, query }) => branchCosts(svc, user, query.period)),
];
