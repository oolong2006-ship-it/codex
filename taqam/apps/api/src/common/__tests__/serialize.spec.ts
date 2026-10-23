import { Prisma } from '@prisma/client';
import { serialize } from '../serialize';

describe('serialize', () => {
  it('converts Decimals to numbers and dates to ISO / day strings', () => {
    const out = serialize({
      basicSalary: new Prisma.Decimal('5500.50'),
      hireDate: new Date('2024-01-15T00:00:00.000Z'),
      createdAt: new Date('2026-10-23T08:30:00.000Z'),
      passwordHash: 'secret',
      nested: [{ amount: new Prisma.Decimal(12), date: new Date('2026-02-22T00:00:00Z') }],
    }) as Record<string, unknown>;
    expect(out.basicSalary).toBe(5500.5);
    expect(out.hireDate).toBe('2024-01-15');
    expect(out.createdAt).toBe('2026-10-23T08:30:00.000Z');
    expect(out.passwordHash).toBeUndefined();
    expect(out.nested).toEqual([{ amount: 12, date: '2026-02-22' }]);
  });

  it('passes primitives through', () => {
    expect(serialize('csv,data')).toBe('csv,data');
    expect(serialize(null)).toBeNull();
    expect(serialize(3)).toBe(3);
  });
});
