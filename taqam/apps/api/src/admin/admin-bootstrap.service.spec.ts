import * as bcrypt from 'bcryptjs';
import { AdminBootstrapService } from './admin-bootstrap.service';

type U = { id: string; email: string; role: string; passwordHash: string; isActive: boolean; tokenVersion: number };

function fake(existing: U | null) {
  const state = { user: existing };
  return {
    state,
    user: {
      findUnique: jest.fn(async () => (state.user ? { ...state.user } : null)),
      create: jest.fn(async ({ data }: { data: Partial<U> }) => (state.user = { id: 'u1', isActive: true, tokenVersion: 0, ...data } as U)),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const u = state.user!;
        if (data.passwordHash) u.passwordHash = data.passwordHash as string;
        const tv = data.tokenVersion as { increment?: number } | undefined;
        if (tv?.increment) u.tokenVersion += tv.increment;
        if ('isActive' in data) u.isActive = data.isActive as boolean;
        return u;
      }),
    },
  };
}

describe('AdminBootstrapService (v2.1)', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.PLATFORM_ADMIN_EMAIL = 'Root@Shuoon.net';
    process.env.PLATFORM_ADMIN_PASSWORD = 'Correct#Horse1';
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('creates the admin when missing', async () => {
    const p = fake(null);
    await new AdminBootstrapService(p as never).onApplicationBootstrap();
    expect(p.user.create).toHaveBeenCalledTimes(1);
    expect(p.state.user).toMatchObject({ email: 'root@shuoon.net', role: 'SUPER_ADMIN' });
    expect(await bcrypt.compare('Correct#Horse1', p.state.user!.passwordHash)).toBe(true);
  });

  it('leaves an existing admin untouched when the password is unchanged (no re-hash, isActive kept)', async () => {
    const p = fake({ id: 'u1', email: 'root@shuoon.net', role: 'SUPER_ADMIN', passwordHash: await bcrypt.hash('Correct#Horse1', 4), isActive: false, tokenVersion: 3 });
    await new AdminBootstrapService(p as never).onApplicationBootstrap();
    expect(p.user.update).not.toHaveBeenCalled();
    expect(p.state.user).toMatchObject({ isActive: false, tokenVersion: 3 });
  });

  it('rotates the password and bumps tokenVersion when the env password differs; never forces isActive', async () => {
    const p = fake({ id: 'u1', email: 'root@shuoon.net', role: 'SUPER_ADMIN', passwordHash: await bcrypt.hash('Old#Password1', 4), isActive: false, tokenVersion: 3 });
    await new AdminBootstrapService(p as never).onApplicationBootstrap();
    expect(p.user.update).toHaveBeenCalledTimes(1);
    expect(p.user.update.mock.calls[0][0].data).not.toHaveProperty('isActive');
    expect(p.state.user).toMatchObject({ isActive: false, tokenVersion: 4 });
    expect(await bcrypt.compare('Correct#Horse1', p.state.user!.passwordHash)).toBe(true);
  });
});
