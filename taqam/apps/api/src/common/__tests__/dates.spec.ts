import { addMonths, parseTime, periodRange, riyadhDateTime, todayStr, weekday } from '../dates';

describe('dates (Asia/Riyadh)', () => {
  it('computes today in Riyadh (UTC+3)', () => {
    expect(todayStr(new Date('2026-10-22T21:30:00Z'))).toBe('2026-10-23');
    expect(todayStr(new Date('2026-10-22T20:59:00Z'))).toBe('2026-10-22');
  });
  it('builds absolute times from local HH:mm', () => {
    expect(riyadhDateTime('2026-10-23', '08:00').toISOString()).toBe('2026-10-23T05:00:00.000Z');
    expect(parseTime('2026-10-23', '16:30')!.toISOString()).toBe('2026-10-23T13:30:00.000Z');
    expect(parseTime('2026-10-23', '2026-10-23T06:00:00.000Z')!.toISOString()).toBe('2026-10-23T06:00:00.000Z');
  });
  it('handles periods and weekdays', () => {
    const r = periodRange('2026-02');
    expect(r.start.toISOString().slice(0, 10)).toBe('2026-02-01');
    expect(r.end.toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(addMonths('2026-01', -2)).toBe('2025-11');
    expect(weekday('2026-10-23')).toBe(5); // Friday
  });
});
