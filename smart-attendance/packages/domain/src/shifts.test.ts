import { describe, expect, it } from 'vitest';
import { evaluateOccurrence, isoWeekday, shiftOccurrences, zonedTimeToUtc, addDays } from './shifts';
import type { SessionFact } from './shifts';

const RIYADH = 'Asia/Riyadh';
const at = (iso: string) => new Date(iso);
const DAY = {
  startTime: '08:00',
  endTime: '16:00',
  days: [1, 2, 3, 4, 5, 6, 7],
};
const NIGHT = { startTime: '22:00', endTime: '06:00', days: [1, 2, 3, 4, 5, 6, 7] };

describe('local time', () => {
  it('converts a Riyadh wall-clock time to UTC (UTC+3, no DST)', () => {
    expect(zonedTimeToUtc('2026-10-26', '22:00', RIYADH).toISOString()).toBe('2026-10-26T19:00:00.000Z');
    expect(zonedTimeToUtc('2026-10-26', '00:30', RIYADH).toISOString()).toBe('2026-10-25T21:30:00.000Z');
  });

  it('computes ISO weekdays and day arithmetic', () => {
    expect(isoWeekday('2026-10-26')).toBe(1); // الاثنين
    expect(isoWeekday('2026-10-25')).toBe(7); // الأحد
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('shiftOccurrences', () => {
  it('respects assignment validity and the days of the template', () => {
    const occ = shiftOccurrences(
      { startTime: '08:00', endTime: '16:00', days: [1] },
      { validFrom: '2026-10-20', validTo: '2026-10-31' },
      '2026-10-01',
      '2026-10-31',
      RIYADH,
    );
    expect(occ.map((o) => o.date)).toEqual(['2026-10-26']);
  });

  it('an overnight shift ends on the next calendar day', () => {
    const [occ] = shiftOccurrences(NIGHT, { validFrom: '2026-10-26', validTo: '2026-10-26' }, '2026-10-01', '2026-10-31', RIYADH);
    expect(occ!.start.toISOString()).toBe('2026-10-26T19:00:00.000Z');
    expect(occ!.end.toISOString()).toBe('2026-10-27T03:00:00.000Z');
  });
});

describe('evaluateOccurrence', () => {
  const occ = (tpl: typeof DAY) => shiftOccurrences(tpl, { validFrom: '2026-10-26', validTo: '2026-10-26' }, '2026-10-26', '2026-10-26', RIYADH)[0]!;
  const grace = { lateMinutes: 10, earlyLeaveMinutes: 10 };
  const day = occ(DAY);
  const session = (startedAt: string, endedAt: string | null, status: SessionFact['status'] = 'CLOSED'): SessionFact => ({
    businessDate: '2026-10-26',
    startedAt: at(startedAt),
    endedAt: endedAt ? at(endedAt) : null,
    status,
  });

  it('on time, within grace: PRESENT with no minutes', () => {
    const r = evaluateOccurrence(day, [session('2026-10-26T05:05:00Z', '2026-10-26T13:00:00Z')], at('2026-10-27T00:00:00Z'), grace);
    expect(r).toEqual(expect.objectContaining({ outcome: 'PRESENT', lateMinutes: 0, earlyLeaveMinutes: 0 }));
  });

  it('late beyond grace: LATE with minutes after the scheduled start', () => {
    // الوردية 08:00 محليًا = 05:00Z؛ الحضور 05:30Z = 08:30 محليًا.
    const r = evaluateOccurrence(day, [session('2026-10-26T05:30:00Z', '2026-10-26T13:00:00Z')], at('2026-10-27T00:00:00Z'), grace);
    expect(r).toEqual(expect.objectContaining({ outcome: 'LATE', lateMinutes: 30 }));
  });

  it('left early beyond grace: EARLY_LEAVE', () => {
    // الانصراف 12:30 محليًا؛ الوردية تنتهي 16:00 محليًا.
    const r = evaluateOccurrence(day, [session('2026-10-26T05:00:00Z', '2026-10-26T09:30:00Z')], at('2026-10-27T00:00:00Z'), grace);
    expect(r).toEqual(expect.objectContaining({ outcome: 'EARLY_LEAVE', earlyLeaveMinutes: 210 }));
  });

  it('no session after the shift ended is ABSENT; before it ended is NOT_DUE', () => {
    expect(evaluateOccurrence(day, [], at('2026-10-27T00:00:00Z'), grace).outcome).toBe('ABSENT');
    expect(evaluateOccurrence(day, [], at('2026-10-26T06:00:00Z'), grace).outcome).toBe('NOT_DUE');
  });

  it('an incomplete session or an open one past the shift end is INCOMPLETE', () => {
    expect(evaluateOccurrence(day, [session('2026-10-26T05:00:00Z', null, 'INCOMPLETE')], at('2026-10-27T00:00:00Z'), grace).outcome).toBe('INCOMPLETE');
    expect(evaluateOccurrence(day, [session('2026-10-26T05:00:00Z', null, 'OPEN')], at('2026-10-27T00:00:00Z'), grace).outcome).toBe('INCOMPLETE');
    expect(evaluateOccurrence(day, [session('2026-10-26T05:00:00Z', null, 'OPEN')], at('2026-10-26T06:00:00Z'), grace).outcome).toBe('PRESENT');
  });

  it('a night shift matches the session that started on its start date', () => {
    const night = occ(NIGHT);
    const r = evaluateOccurrence(
      night,
      [{ businessDate: '2026-10-26', startedAt: at('2026-10-26T19:02:00Z'), endedAt: at('2026-10-27T03:00:00Z'), status: 'CLOSED' }],
      at('2026-10-28T00:00:00Z'),
      grace,
    );
    // دخول بعد 2 دقيقة من بداية الوردية: داخل السماح.
    expect(r).toEqual(expect.objectContaining({ outcome: 'PRESENT', lateMinutes: 0, earlyLeaveMinutes: 0 }));
  });
});

describe('formatLocalDateTime', () => {
  it('prints the tenant wall clock', async () => {
    const { formatLocalDateTime } = await import('./shifts');
    expect(formatLocalDateTime(at('2026-10-26T19:00:00Z'), RIYADH)).toBe('2026-10-26 22:00');
    expect(formatLocalDateTime(at('2026-10-26T19:00:00Z'), 'UTC')).toBe('2026-10-26 19:00');
  });
});
