import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LeaveCalcService } from './leave-calc.service';

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function make(opts: { overlap?: boolean; approvedAnnual?: number; pending?: number }) {
  const prisma = {
    company: { findUniqueOrThrow: jest.fn(async () => ({ weekendDays: [5, 6] })) },
    publicHoliday: { findMany: jest.fn(async () => []) },
    leaveRequest: {
      findFirst: jest.fn(async () => (opts.overlap ? { id: 'x' } : null)),
      aggregate: jest.fn(async ({ where }: { where: { status: unknown } }) => ({
        _sum: { days: where.status === 'APPROVED' ? (opts.approvedAnnual ?? 0) : (opts.pending ?? 0) },
      })),
    },
  };
  return new LeaveCalcService(prisma as never);
}

// record created today: no service year has been tracked in Shuoon yet, so no computed carry-over
const emp = { id: 'e1', companyId: 'c1', hireDate: D('2020-01-01'), createdAt: new Date(), annualLeaveCarryOver: new Prisma.Decimal(0) } as never;
const annual = { id: 't1', code: 'ANNUAL', nameAr: 'إجازة سنوية', maxDaysPerYear: 21 } as never;

describe('LeaveCalcService.validate', () => {
  it('counts working days excluding Fri/Sat', async () => {
    // Sun 1 Nov – Sat 7 Nov 2026 → 5 working days
    const days = await make({}).validate(emp, annual, '2026-11-01', '2026-11-07');
    expect(days).toBe(5);
  });

  it('rejects overlapping requests with an Arabic message', async () => {
    await expect(make({ overlap: true }).validate(emp, annual, '2026-11-01', '2026-11-02')).rejects.toMatchObject({
      response: { messageAr: 'يوجد طلب إجازة متداخل مع هذه الفترة' },
    });
  });

  it('rejects requests exceeding the annual balance', async () => {
    const err = await make({ approvedAnnual: 20 })
      .validate(emp, annual, '2026-11-01', '2026-11-12')
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse().messageAr).toContain('رصيد الإجازة السنوية غير كافٍ');
  });

  it('rejects end before start', async () => {
    await expect(make({}).validate(emp, annual, '2026-11-05', '2026-11-01')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('counts MATERNITY in calendar days: 117 calendar days exceeds the 84-day maximum (review #15)', async () => {
    const maternity = { id: 't2', code: 'MATERNITY', nameAr: 'إجازة وضع', maxDaysPerYear: 84 } as never;
    // Wed 2026-11-04 → Sun 2027-02-28 = 117 calendar days but only 83 working days (Fri/Sat off)
    const err = await make({}).validate(emp, maternity, '2026-11-04', '2027-02-28').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse().messageAr).toContain('تتجاوز الحد السنوي');
  });

  it('returns calendar days for SICK, MATERNITY and UNPAID; ANNUAL stays in working days', async () => {
    const sick = { id: 't3', code: 'SICK', nameAr: 'إجازة مرضية', maxDaysPerYear: 120 } as never;
    const unpaid = { id: 't4', code: 'UNPAID', nameAr: 'إجازة بدون أجر', maxDaysPerYear: null } as never;
    const maternity = { id: 't2', code: 'MATERNITY', nameAr: 'إجازة وضع', maxDaysPerYear: 84 } as never;
    // Sun 1 Nov – Sat 7 Nov 2026: 7 calendar days, 5 working days
    expect(await make({}).validate(emp, sick, '2026-11-01', '2026-11-07')).toBe(7);
    expect(await make({}).validate(emp, unpaid, '2026-11-01', '2026-11-07')).toBe(7);
    expect(await make({}).validate(emp, maternity, '2026-11-01', '2026-11-07')).toBe(7);
    expect(await make({}).validate(emp, annual, '2026-11-01', '2026-11-07')).toBe(5);
  });
});

// ---- Task 8: in-memory leave store that honours the where clauses used by the service ----
interface Row { id: string; employeeId: string; leaveTypeId: string; code: string; status: string; startDate: Date; days: number }
type Range = { gte?: Date; lt?: Date; lte?: Date };
function matches(r: Row, w: Record<string, unknown>): boolean {
  if (w.employeeId && r.employeeId !== w.employeeId) return false;
  if (w.leaveTypeId && r.leaveTypeId !== w.leaveTypeId) return false;
  const lt = w.leaveType as { code?: string } | undefined;
  if (lt?.code && r.code !== lt.code) return false;
  const st = w.status as string | { in: string[] } | undefined;
  if (typeof st === 'string' && r.status !== st) return false;
  if (st && typeof st === 'object' && !st.in.includes(r.status)) return false;
  const sd = w.startDate as Range | undefined;
  if (sd?.gte && r.startDate < sd.gte) return false;
  if (sd?.lt && r.startDate >= sd.lt) return false;
  if (sd?.lte && r.startDate > sd.lte) return false;
  const id = w.id as { not?: string } | undefined;
  if (id?.not && r.id === id.not) return false;
  return true;
}
function store(rows: Row[], types: { id: string; code: string; nameAr: string; maxDaysPerYear: number | null }[] = []) {
  const sum = (w: Record<string, unknown>) => rows.filter((r) => matches(r, w)).reduce((s, r) => s + r.days, 0);
  const prisma = {
    company: { findUniqueOrThrow: jest.fn(async () => ({ weekendDays: [5, 6] })) },
    publicHoliday: { findMany: jest.fn(async () => []) },
    leaveType: { findMany: jest.fn(async () => types) },
    leaveRequest: {
      findFirst: jest.fn(async () => null),
      aggregate: jest.fn(async ({ where }: { where: Record<string, unknown> }) => ({ _sum: { days: sum(where) } })),
      groupBy: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const ids = [...new Set(rows.filter((r) => matches(r, where)).map((r) => r.leaveTypeId))];
        return ids.map((leaveTypeId) => ({ leaveTypeId, _sum: { days: sum({ ...where, leaveTypeId }) } }));
      }),
    },
  };
  return new LeaveCalcService(prisma as never);
}
const row = (id: string, code: string, startDate: string, days: number, status = 'APPROVED'): Row => ({
  id, employeeId: 'e1', leaveTypeId: `t-${code}`, code, status, startDate: D(startDate), days,
});
const person = (hireDate: string, createdAt = hireDate, carry = 0) =>
  ({ id: 'e1', companyId: 'c1', hireDate: D(hireDate), createdAt: D(createdAt), annualLeaveCarryOver: new Prisma.Decimal(carry) }) as never;

describe('LeaveCalcService yearly caps and carry-over (review #8, #9, #13, #18)', () => {
  it('yearly maximum counts only leaves starting within Jan 1 – Dec 31 of the request year', async () => {
    const marriage = { id: 't-MARRIAGE', code: 'MARRIAGE', nameAr: 'إجازة زواج', maxDaysPerYear: 5 } as never;
    // a 5-day marriage leave already booked for NEXT year must not consume this year's allowance
    const svc = store([row('m1', 'MARRIAGE', '2027-03-07', 5)]);
    await expect(svc.validate(person('2020-01-01'), marriage, '2026-11-01', '2026-11-02')).resolves.toBe(2);
    // ...but it does count against a request in 2027
    const err = await svc.validate(person('2020-01-01'), marriage, '2027-05-02', '2027-05-03').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
  });

  it('balances() counts this calendar year only (a booking for next year is not "taken" yet)', async () => {
    const nextYear = Number(new Date().toISOString().slice(0, 4)) + 1;
    const svc = store([row('m1', 'MARRIAGE', `${nextYear}-03-07`, 5)], [{ id: 't-MARRIAGE', code: 'MARRIAGE', nameAr: 'إجازة زواج', maxDaysPerYear: 5 }]);
    const [b] = await svc.balances(person('2020-01-01') as never);
    expect(b).toMatchObject({ code: 'MARRIAGE', taken: 0, balance: 5 });
  });

  it('service year of a Feb-29 hire starts on Feb 28 in non-leap years (core addYears)', () => {
    const svc = store([]);
    expect(svc.serviceYearStart(D('2024-02-29'), '2025-02-28')).toEqual(D('2025-02-28'));
    expect(svc.serviceYearStart(D('2024-02-29'), '2026-03-01')).toEqual(D('2026-02-28'));
    expect(svc.serviceYearStart(D('2024-02-29'), '2028-02-29')).toEqual(D('2028-02-29'));
  });

  it('annual balance carries over unused entitlement from completed service years', async () => {
    const svc = store([row('a1', 'ANNUAL', '2023-05-01', 10), row('a2', 'ANNUAL', '2024-07-01', 15), row('a3', 'ANNUAL', '2025-03-02', 3)]);
    // 2 completed years × 21 = 42, minus 25 taken before 2025-01-01 → 17 carried; accrued 21 × 151/365 = 8.69; taken 3
    const b = await svc.annualBalance(person('2023-01-01'), '2025-06-01');
    expect(b).toMatchObject({ accrued: 8.69, taken: 3, balance: 22.69 });
  });

  it('carry-over never goes negative', async () => {
    const svc = store([row('a1', 'ANNUAL', '2023-05-01', 30), row('a2', 'ANNUAL', '2024-07-01', 20), row('a3', 'ANNUAL', '2025-03-02', 3)]);
    const b = await svc.annualBalance(person('2023-01-01'), '2025-06-01');
    expect(b.balance).toBe(5.69);
  });

  it('completed years from the 6th service year on carry 30 days (Art. 109)', async () => {
    // 5 × 21 + 2 × 30 = 165 carried, accrued 30 × 31/365 = 2.55
    const b = await store([]).annualBalance(person('2019-01-01'), '2026-02-01');
    expect(b.balance).toBe(167.55);
  });

  it('years completed before the employee was added are covered by the HR opening balance, not recomputed', async () => {
    // hired 2022, added to Shuoon on 2026-05-01 with a 6-day opening balance → only 6 + accrued
    const b = await store([]).annualBalance(person('2022-01-01', '2026-05-01', 6), '2026-10-24');
    expect(b.balance).toBe(23.03);
  });
});
