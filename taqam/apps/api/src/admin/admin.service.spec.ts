import { AdminService } from './admin.service';

const company = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `c${i}`,
  nameAr: `منشأة ${i}`,
  nameEn: null,
  sector: null,
  city: null,
  crNumber: null,
  status: 'ACTIVE',
  plan: 'GROWTH',
  billingCycle: 'MONTHLY',
  maxEmployees: null,
  pricePerEmployee: null,
  trialEndsAt: null,
  subscriptionEndsAt: null,
  activatedAt: null,
  suspendedAt: null,
  suspensionReason: null,
  adminNotes: null,
  lastActivityAt: null,
  createdAt: new Date(Date.UTC(2026, 0, i)),
  ...extra,
});

function make(rows: ReturnType<typeof company>[], employees: { companyId: string; status: string; n: number }[] = []) {
  const prisma = {
    company: {
      findMany: jest.fn(async (args: { skip?: number; take?: number }) => rows.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? rows.length))),
      count: jest.fn(async () => rows.length),
    },
    employee: {
      groupBy: jest.fn(async () => employees.map((e) => ({ companyId: e.companyId, status: e.status, _count: { _all: e.n } }))),
      count: jest.fn(async () => employees.length),
    },
    user: { groupBy: jest.fn(async () => []), findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    branch: { groupBy: jest.fn(async () => []) },
    lead: { count: jest.fn(async () => 0) },
  };
  const settings = { requireApproval: false, trialDays: 14, prices: { ESSENTIALS: 19, GROWTH: 29, ENTERPRISE: null }, annualDiscount: 0.15 };
  const platform = {
    expireDue: jest.fn(async () => 0),
    getSettings: jest.fn(async () => settings),
    effectivePrice: jest.fn(() => 29),
    mrr: jest.fn(() => 0),
    daysLeft: jest.fn(() => null),
  };
  const svc = new AdminService(prisma as never, platform as never, {} as never, {} as never, {} as never);
  return { svc, prisma, platform };
}

describe('AdminService.list', () => {
  it('does not run the expiry sweep on a read', async () => {
    const { svc, platform } = make([company(1)]);
    await svc.list({});
    expect(platform.expireDue).not.toHaveBeenCalled();
  });

  it('pages in the database for the default (createdAt) sort', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => company(i + 1));
    const { svc, prisma } = make(rows);
    const res = await svc.list({ page: '2', pageSize: '2', status: 'ACTIVE,TRIAL', plan: 'GROWTH' } as never);
    const args = prisma.company.findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(args).toMatchObject({ skip: 2, take: 2, where: { status: { in: ['ACTIVE', 'TRIAL'] }, plan: 'GROWTH' } });
    expect(prisma.company.count).toHaveBeenCalled();
    expect(res).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    expect(res.data).toHaveLength(2);
    // views (groupBy counts) are built only for the returned page
    expect((prisma.employee.groupBy.mock.calls[0] as unknown as [{ where: { companyId: { in: string[] } } }])[0].where.companyId.in).toHaveLength(2);
  });

  it('still sorts by employees across all rows', async () => {
    const rows = [company(1), company(2), company(3)];
    const { svc } = make(rows, [
      { companyId: 'c1', status: 'ACTIVE', n: 1 },
      { companyId: 'c2', status: 'ACTIVE', n: 5 },
      { companyId: 'c3', status: 'ACTIVE', n: 3 },
    ]);
    const res = await svc.list({ sort: 'employees', pageSize: '2' } as never);
    expect(res.total).toBe(3);
    expect(res.data.map((c) => c.id)).toEqual(['c2', 'c3']);
  });
});

describe('AdminService.overview MRR', () => {
  it('rounds the platform MRR with core round2 (1.005 → 1.01)', async () => {
    const { svc, platform } = make([company(1)], [{ companyId: 'c1', status: 'ACTIVE', n: 1 }]);
    platform.mrr.mockReturnValue(1.005);
    const ov = await svc.overview();
    expect(ov.mrr).toBe(1.01);
    expect(ov.mrrByPlan.find((m) => m.plan === 'GROWTH')!.mrr).toBe(1.01);
  });
});
