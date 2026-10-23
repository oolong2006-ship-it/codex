/** Minimal REST router for the in-browser demo API + shared view/validation helpers. */
import type { DB, Employee, LeaveRequest, Payslip, Role } from './db';
import { badRequest } from './errors';
import { Services, fullName, type AuthUser } from './services';

export type Query = Record<string, string>;
export interface Ctx {
  db: DB;
  svc: Services;
  user: AuthUser;
  params: Record<string, string>;
  query: Query;
  body: Record<string, unknown>;
}
export type Handler = (ctx: Ctx) => unknown;
export interface Route { method: string; pattern: string; roles?: Role[] | 'PUBLIC'; handler: Handler; segs: string[] }

export function route(method: string, pattern: string, roles: Route['roles'], handler: Handler): Route {
  return { method, pattern, roles, handler, segs: pattern.split('/').filter(Boolean) };
}

export function match(routes: Route[], method: string, path: string): { route: Route; params: Record<string, string> } | null {
  const segs = path.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  for (const r of routes) {
    if (r.method !== method || r.segs.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < segs.length; i++) {
      if (r.segs[i].startsWith(':')) params[r.segs[i].slice(1)] = segs[i];
      else if (r.segs[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

// ---------- pagination ----------
export function pageParams(q: Query) {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(q.pageSize) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize };
}
export function paginate<T>(rows: T[], q: Query) {
  const { page, pageSize, skip } = pageParams(q);
  return { data: rows.slice(skip, skip + pageSize), total: rows.length, page, pageSize };
}
export const byCreatedDesc = (a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt);
export const byCreatedAsc = (a: { createdAt: string }, b: { createdAt: string }) => a.createdAt.localeCompare(b.createdAt);

// ---------- validation (class-validator equivalents) ----------
export const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const invalid = (field: string, rule: string) => badRequest(`${field} ${rule}`);
export const v = {
  str(b: Record<string, unknown>, k: string, opts: { optional?: boolean; min?: number } = {}): string | undefined {
    const x = b[k];
    if (x === undefined || x === null) { if (opts.optional) return undefined; throw invalid(k, 'must be a string'); }
    if (typeof x !== 'string') throw invalid(k, 'must be a string');
    if (opts.min && x.length < opts.min) throw invalid(k, `must be longer than or equal to ${opts.min} characters`);
    return x;
  },
  num(b: Record<string, unknown>, k: string, opts: { optional?: boolean; min?: number; max?: number } = {}): number | undefined {
    const x = b[k];
    if (x === undefined || x === null || x === '') { if (opts.optional) return undefined; throw invalid(k, 'must be a number'); }
    const n = Number(x);
    if (!Number.isFinite(n)) throw invalid(k, 'must be a number');
    if (opts.min !== undefined && n < opts.min) throw invalid(k, `must not be less than ${opts.min}`);
    if (opts.max !== undefined && n > opts.max) throw invalid(k, `must not be greater than ${opts.max}`);
    return n;
  },
  match(b: Record<string, unknown>, k: string, re: RegExp, optional = false): string | undefined {
    const x = b[k];
    if (x === undefined || x === null || (optional && x === '')) { if (optional) return undefined; throw invalid(k, `must match ${re}`); }
    if (typeof x !== 'string' || !re.test(x)) throw invalid(k, `must match ${re}`);
    return x;
  },
  oneOf<T extends string>(b: Record<string, unknown>, k: string, values: readonly T[], optional = false): T | undefined {
    const x = b[k];
    if (x === undefined || x === null) { if (optional) return undefined; throw invalid(k, `must be one of ${values.join(', ')}`); }
    if (!values.includes(x as T)) throw invalid(k, `must be one of ${values.join(', ')}`);
    return x as T;
  },
  email(b: Record<string, unknown>, k: string, optional = false): string | undefined {
    const x = b[k];
    if (x === undefined || x === null || (optional && x === '')) { if (optional) return undefined; throw invalid(k, 'must be an email'); }
    if (typeof x !== 'string' || !EMAIL_RE.test(x.trim())) throw invalid(k, 'must be an email');
    return x.trim().toLowerCase();
  },
};
/** ValidationPipe whitelist: keep only known keys that are present. */
export function pick(b: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (b[k] !== undefined) out[k] = b[k];
  return out;
}

// ---------- views ----------
export function employeeView(svc: Services, e: Employee) {
  const b = svc.branch(e.branchId);
  const d = svc.dept(e.departmentId);
  const m = svc.emp(e.managerId);
  return {
    ...e,
    branch: b ? { id: b.id, nameAr: b.nameAr, nameEn: b.nameEn } : null,
    department: d ? { id: d.id, name: d.name } : null,
    name: fullName(e),
    manager: m ? { id: m.id, name: fullName(m) } : null,
  };
}
export function leaveView(svc: Services, l: LeaveRequest) {
  const e = svc.emp(l.employeeId)!;
  const t = svc.leaveType(l.leaveTypeId);
  return {
    ...l,
    employee: { id: e.id, name: fullName(e), branchId: e.branchId, branchName: svc.branch(e.branchId)?.nameAr ?? null },
    leaveType: t ? { id: t.id, code: t.code, nameAr: t.nameAr, nameEn: t.nameEn, paid: t.paid } : null,
  };
}
export function empLite(svc: Services, id: string) {
  const e = svc.emp(id)!;
  return { id: e.id, name: fullName(e), employeeNumber: e.employeeNumber, branchId: e.branchId, branchName: svc.branch(e.branchId)?.nameAr ?? null };
}
export function payslipView(svc: Services, p: Payslip) {
  const { inputs: _i, loanDeductions: _l, ...rest } = p;
  const e = svc.emp(p.employeeId)!;
  return {
    ...rest,
    status: svc.runStatus(p.companyId, p.payrollRunId),
    employee: {
      id: e.id, employeeNumber: e.employeeNumber, name: fullName(e), nameEn: e.fullNameEn, jobTitle: e.jobTitle,
      branchName: svc.branch(e.branchId)?.nameAr ?? null, iban: e.iban, isSaudi: e.isSaudi,
    },
  };
}
export const ok = { ok: true };
