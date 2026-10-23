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
});
