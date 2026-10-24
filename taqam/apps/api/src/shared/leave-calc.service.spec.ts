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

const emp = { id: 'e1', companyId: 'c1', hireDate: D('2020-01-01'), annualLeaveCarryOver: new Prisma.Decimal(0) } as never;
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
