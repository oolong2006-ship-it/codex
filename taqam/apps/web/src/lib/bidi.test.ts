import { describe, expect, it } from 'vitest';
import { LRI, PDI, isolateLtrRuns, ltr, stripIsolates } from './bidi';

describe('bidi isolates for Arabic plain text', () => {
  it('wraps ISO dates and document numbers in LRI … PDI', () => {
    const s = isolateLtrRuns('صدرت الفاتورة SH-2026-0012 عن الفترة 2026-10-01 إلى 2026-10-31 وإشعار SHC-2026-0001.');
    expect(s).toBe(`صدرت الفاتورة ${LRI}SH-2026-0012${PDI} عن الفترة ${LRI}2026-10-01${PDI} إلى ${LRI}2026-10-31${PDI} وإشعار ${LRI}SHC-2026-0001${PDI}.`);
  });
  it('is idempotent and reversible', () => {
    const once = isolateLtrRuns('تستحق في 2026-11-05');
    expect(isolateLtrRuns(once)).toBe(once);
    expect(ltr(ltr('x'))).toBe(ltr('x'));
    expect(stripIsolates(once)).toBe('تستحق في 2026-11-05');
  });
  it('leaves text without Latin runs untouched', () => {
    expect(isolateLtrRuns('مرحباً بك')).toBe('مرحباً بك');
  });
});
