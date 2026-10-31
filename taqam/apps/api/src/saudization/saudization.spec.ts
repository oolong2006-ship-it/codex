import { SaudizationController } from './saudization.controller';

type Row = { branchId: string | null; isSaudi: boolean; qiwaDocumented: boolean; n: number };

function make(rows: Row[], branches = [{ id: 'b1', nameAr: 'الرياض' }, { id: 'b2', nameAr: 'جدة' }]) {
  const prisma = {
    employee: {
      groupBy: jest.fn(async () => rows.map(({ n, ...r }) => ({ ...r, _count: { _all: n } }))),
      findMany: jest.fn(async () => []),
    },
    branch: { findMany: jest.fn(async () => branches) },
  };
  const scope = { employeeWhere: jest.fn((_u: unknown, extra: object) => ({ ...extra, companyId: 'c1' })) };
  return { ctrl: new SaudizationController(prisma as never, scope as never), prisma, scope };
}

const owner = { id: 'u1', name: 'مالك', companyId: 'c1', role: 'OWNER', employeeId: null } as never;

describe('GET /saudization — Qiwa-documented (official) vs internal rate', () => {
  // 7 non-Saudis + 2 documented Saudis + 1 undocumented Saudi, all in branch b1
  const sample: Row[] = [
    { branchId: 'b1', isSaudi: false, qiwaDocumented: false, n: 7 },
    { branchId: 'b1', isSaudi: true, qiwaDocumented: true, n: 2 },
    { branchId: 'b1', isSaudi: true, qiwaDocumented: false, n: 1 },
  ];

  it('company rate/band use the official (documented) rate; internal rate is reported alongside', async () => {
    const { ctrl, prisma } = make(sample);
    const res = await ctrl.overview(owner);
    expect(res.company).toMatchObject({
      total: 10, saudis: 3, nonSaudis: 7, documentedSaudis: 2, undocumentedSaudis: 1,
      officialRate: 20, internalRate: 30, rate: 20, band: 'MID_GREEN', marginToDrop: 0, alert: true,
      nextBand: 'HIGH_GREEN', hiresToNextBand: 1, // (2+1)/(10+1) = 27.27% ≥ 27
    });
    expect(prisma.employee.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['branchId', 'isSaudi', 'qiwaDocumented'],
      where: { companyId: 'c1', status: { not: 'TERMINATED' } },
    }));
  });

  it('each branch gains the same fields; a branch with zero staff is all zeros (never NaN) and raises no alert', async () => {
    const { ctrl } = make(sample);
    const res = await ctrl.overview(owner);
    expect(res.branches[0]).toMatchObject({ branchId: 'b1', officialRate: 20, internalRate: 30, rate: 20, documentedSaudis: 2, undocumentedSaudis: 1, marginToDrop: 0, alert: true });
    expect(res.branches[1]).toEqual({
      branchId: 'b2', branchName: 'جدة', total: 0, saudis: 0, documentedSaudis: 0, undocumentedSaudis: 0,
      rate: 0, officialRate: 0, internalRate: 0, band: 'RED', marginToDrop: 0, alert: false, hiresToNextBand: 1,
    });
  });

  it('a company with zero active employees returns zeros, never NaN', async () => {
    const { ctrl } = make([], []);
    const res = await ctrl.overview(owner);
    expect(res.company).toMatchObject({ total: 0, officialRate: 0, internalRate: 0, rate: 0, marginToDrop: 0, alert: false });
    expect(Object.values(res.company).every((v) => typeof v !== 'number' || Number.isFinite(v))).toBe(true);
    expect(res.undocumented).toEqual([]);
  });

  it('lists undocumented Saudis (active, scoped to the viewer) for the bulk confirm', async () => {
    const { ctrl, prisma, scope } = make(sample);
    prisma.employee.findMany.mockResolvedValueOnce([
      { id: 'e3', employeeNumber: 'EMP-0003', firstNameAr: 'سعد', lastNameAr: 'العتيبي', branchId: 'b1', branch: { nameAr: 'الرياض' } },
    ] as never);
    const res = await ctrl.overview(owner);
    expect(scope.employeeWhere).toHaveBeenCalledWith(owner, { isSaudi: true, qiwaDocumented: false, status: { not: 'TERMINATED' } });
    expect(res.undocumented).toEqual([{ id: 'e3', employeeNumber: 'EMP-0003', name: 'سعد العتيبي', branchId: 'b1', branchName: 'الرياض' }]);
  });

  it('only all-documented Saudis with a comfortable margin → no alert', async () => {
    const { ctrl } = make([
      { branchId: 'b1', isSaudi: false, qiwaDocumented: false, n: 5 },
      { branchId: 'b1', isSaudi: true, qiwaDocumented: true, n: 5 },
    ]);
    const res = await ctrl.overview(owner);
    // 5/10 = 50% PLATINUM; 4/9 = 44.4% still PLATINUM; 3/8 = 37.5% drops → margin 1 → alert
    expect(res.company).toMatchObject({ band: 'PLATINUM', marginToDrop: 1, alert: true });
    const { ctrl: c2 } = make([
      { branchId: 'b1', isSaudi: false, qiwaDocumented: false, n: 2 },
      { branchId: 'b1', isSaudi: true, qiwaDocumented: true, n: 8 },
    ]);
    expect((await c2.overview(owner)).company).toMatchObject({ band: 'PLATINUM', undocumentedSaudis: 0, alert: false });
  });

  it('the simulator starts from the official (documented) count', async () => {
    const { ctrl } = make(sample);
    const res = await ctrl.simulate(owner, '1', '0');
    expect(res.before).toMatchObject({ total: 10, saudis: 2, rate: 20, band: 'MID_GREEN' });
    expect(res.after).toMatchObject({ total: 11, saudis: 3, rate: 27.27, band: 'HIGH_GREEN' });
  });

  it('a BRANCH_MANAGER gets branch-scoped counts and only their branch row (scope BRANCH)', async () => {
    const { ctrl, prisma, scope } = make(sample);
    const mgr = { id: 'u2', name: 'مدير', companyId: 'c1', role: 'BRANCH_MANAGER', employeeId: 'e9', branchId: 'b1' } as never;
    const res = await ctrl.overview(mgr);
    expect(res.scope).toBe('BRANCH');
    expect(scope.employeeWhere).toHaveBeenCalledWith(mgr, { status: { not: 'TERMINATED' } });
    expect(prisma.branch.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'c1', id: 'b1' } }));
    expect((await ctrl.overview(owner)).scope).toBe('COMPANY');
  });
});
