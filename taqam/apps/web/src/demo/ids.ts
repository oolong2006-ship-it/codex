/**
 * Deterministic id pools for the in-browser demo. The static export pre-renders one page per pooled id
 * (generateStaticParams), so records created in the browser get ids that already have a page.
 * Kept dependency-free: imported by server pages at build time.
 */
const pad = (n: number, w: number) => String(n).padStart(w, '0');

export const IS_DEMO_EXPORT = process.env.NEXT_PUBLIC_DEMO === '1';

export const SEED_EMPLOYEES = 41;
export const NEW_EMPLOYEE_POOL = 30;
export const JOB_POOL = 20;
/** Months before/after "today" for which payroll-run pages are pre-rendered. */
export const RUN_MONTHS_BACK = 24;
export const RUN_MONTHS_FORWARD = 24;

export const seedEmployeeId = (n: number) => `emp-${pad(n, 3)}`;
export const newEmployeeId = (n: number) => `emp-new-${pad(n, 2)}`;
export const jobId = (n: number) => `job-${pad(n, 2)}`;
export const runId = (period: string) => `run-${period}`;
export const payslipId = (period: string, employeeId: string) => `ps-${period}-${employeeId}`;

function shiftPeriod(period: string, n: number) {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
function riyadhPeriod(now = new Date()) {
  return new Date(now.getTime() + 180 * 60000).toISOString().slice(0, 7);
}

export function allEmployeeIds(): string[] {
  return [
    ...Array.from({ length: SEED_EMPLOYEES }, (_, i) => seedEmployeeId(i + 1)),
    ...Array.from({ length: NEW_EMPLOYEE_POOL }, (_, i) => newEmployeeId(i + 1)),
  ];
}
export function allJobIds(): string[] {
  return Array.from({ length: JOB_POOL }, (_, i) => jobId(i + 1));
}
export function allRunIds(now = new Date()): string[] {
  const p = riyadhPeriod(now);
  return Array.from({ length: RUN_MONTHS_BACK + RUN_MONTHS_FORWARD + 1 }, (_, i) => runId(shiftPeriod(p, i - RUN_MONTHS_BACK)));
}

/** generateStaticParams helpers: all pooled ids in the demo export, nothing (on-demand rendering) otherwise. */
export const staticParams = {
  employees: () => (IS_DEMO_EXPORT ? allEmployeeIds().map((id) => ({ id })) : []),
  jobs: () => (IS_DEMO_EXPORT ? allJobIds().map((id) => ({ id })) : []),
  runs: () => (IS_DEMO_EXPORT ? allRunIds().map((id) => ({ id })) : []),
};
