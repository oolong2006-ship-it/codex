import { HttpException } from '@nestjs/common';
import { PublicController } from './public.controller';

describe('GET /health (v2.1)', () => {
  it('checks the database with SELECT 1 and returns ok', async () => {
    const prisma = { $queryRaw: jest.fn(async () => [{ ok: 1 }]) };
    const res = await new PublicController(prisma as never).health();
    expect(res).toEqual({ status: 'ok', db: 'up' });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('returns 503 when the database is down', async () => {
    const prisma = { $queryRaw: jest.fn(async () => Promise.reject(new Error('ECONNREFUSED'))) };
    const err = await new PublicController(prisma as never).health().catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(503);
    expect((err as HttpException).getResponse()).toMatchObject({ status: 'error', db: 'down' });
  });
});
