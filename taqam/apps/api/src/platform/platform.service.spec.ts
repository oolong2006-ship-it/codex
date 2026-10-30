import { Prisma } from '@prisma/client';
import { PlatformService } from './platform.service';

type Row = { id: string; nameAr: string; status: string; trialEndsAt: Date | null; subscriptionEndsAt: Date | null };

/** Minimal in-memory company.updateMany honouring the where shapes PlatformService uses. */
function fakePrisma(row: Row) {
  const matches = (w: Record<string, unknown>) =>
    Object.entries(w).every(([k, cond]) => {
      const v = (row as Record<string, unknown>)[k];
      if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        const c = cond as { lt?: Date; lte?: Date };
        if (!(v instanceof Date)) return false;
        if (c.lt && !(v < c.lt)) return false;
        if (c.lte && !(v <= c.lte)) return false;
        return true;
      }
      return v === cond;
    });
  return {
    company: {
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        if (!matches(where)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      findUnique: jest.fn(async () => ({ ...row })),
      findUniqueOrThrow: jest.fn(async () => ({ ...row })),
    },
    companyEvent: { create: jest.fn(async () => ({})) },
  };
}

describe('PlatformService.expire (race with extend)', () => {
  const past = new Date(Date.now() - 60_000);
  const future = new Date(Date.now() + 30 * 86_400_000);

  it('leaves an ACTIVE company ACTIVE when subscriptionEndsAt was extended after the snapshot', async () => {
    const row: Row = { id: 'c1', nameAr: 'منشأة', status: 'ACTIVE', trialEndsAt: null, subscriptionEndsAt: future };
    const prisma = fakePrisma(row);
    const svc = new PlatformService(prisma as never);
    const snapshot = { ...row, subscriptionEndsAt: past } as never; // read before the admin extended it
    expect(await svc.expire(snapshot)).toBe(false);
    expect(row.status).toBe('ACTIVE');
    expect(prisma.companyEvent.create).not.toHaveBeenCalled();
  });

  it('leaves a TRIAL company in TRIAL when trialEndsAt was extended after the snapshot', async () => {
    const row: Row = { id: 'c1', nameAr: 'منشأة', status: 'TRIAL', trialEndsAt: future, subscriptionEndsAt: null };
    const svc = new PlatformService(fakePrisma(row) as never);
    expect(await svc.expire({ ...row, trialEndsAt: past } as never)).toBe(false);
    expect(row.status).toBe('TRIAL');
  });

  it('still expires a company whose end date really passed', async () => {
    const row: Row = { id: 'c1', nameAr: 'منشأة', status: 'ACTIVE', trialEndsAt: null, subscriptionEndsAt: past };
    const svc = new PlatformService(fakePrisma(row) as never);
    expect(await svc.expire({ ...row } as never)).toBe(true);
    expect(row.status).toBe('EXPIRED');
  });

  it('assertCompanyAccess lets the request through when the snapshot was stale', async () => {
    const row: Row = { id: 'c1', nameAr: 'منشأة', status: 'ACTIVE', trialEndsAt: null, subscriptionEndsAt: future };
    const svc = new PlatformService(fakePrisma(row) as never);
    await expect(svc.assertCompanyAccess({ ...row, subscriptionEndsAt: past } as never)).resolves.toBe('ACTIVE');
  });
});

describe('PlatformService.mrr rounding', () => {
  it('uses core round2 (1.005 → 1.01)', () => {
    const svc = new PlatformService({} as never);
    const settings = { requireApproval: false, trialDays: 14, prices: { ESSENTIALS: 19, GROWTH: 29, ENTERPRISE: null }, annualDiscount: 0.15 };
    const c = { status: 'ACTIVE', plan: 'GROWTH', billingCycle: 'MONTHLY', pricePerEmployee: new Prisma.Decimal('1.005') } as never;
    expect(svc.mrr(c, 1, settings as never)).toBe(1.01);
  });
});

describe('PlatformService expiry listeners', () => {
  const past = new Date(Date.now() - 60_000);

  it('runs listeners once after a successful expire; a failing listener never breaks expiry', async () => {
    const row: Row = { id: 'c1', nameAr: 'منشأة', status: 'TRIAL', trialEndsAt: past, subscriptionEndsAt: null };
    const svc = new PlatformService(fakePrisma(row) as never);
    const seen: string[] = [];
    svc.onExpired(() => {
      throw new Error('boom');
    });
    svc.onExpired((c) => {
      seen.push(`${c.id}:${c.status}`);
    });
    expect(await svc.expire({ ...row } as never)).toBe(true);
    await svc.settleListeners();
    expect(seen).toEqual(['c1:TRIAL']); // receives the pre-expiry snapshot (status it expired from)
    expect(await svc.expire({ ...row, status: 'TRIAL' } as never)).toBe(false); // already EXPIRED in the store
    expect(seen).toHaveLength(1);
  });

  it('v2.1: expire() never waits for a slow listener (fire-and-forget; errors logged)', async () => {
    const row: Row = { id: 'c2', nameAr: 'منشأة', status: 'TRIAL', trialEndsAt: past, subscriptionEndsAt: null };
    const svc = new PlatformService(fakePrisma(row) as never);
    let release: () => void = () => undefined;
    const slow = new Promise<void>((r) => (release = r));
    let done = false;
    svc.onExpired(async () => {
      await slow;
      done = true;
    });
    svc.onExpired(async () => {
      throw new Error('smtp down');
    });
    const t0 = Date.now();
    expect(await svc.expire({ ...row } as never)).toBe(true);
    expect(Date.now() - t0).toBeLessThan(200);
    expect(done).toBe(false);
    release();
    await svc.settleListeners();
    expect(done).toBe(true);
  });
});
