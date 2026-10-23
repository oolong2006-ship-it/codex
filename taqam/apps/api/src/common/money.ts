import { Prisma } from '@prisma/client';

export const num = (v: Prisma.Decimal | number | string | null | undefined): number =>
  v === null || v === undefined ? 0 : Number(v.toString());

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
