import { describe, expect, it } from 'vitest';
import { localDate, pairSessions, type SessionPunch } from './sessions';

const at = (iso: string) => new Date(iso);
const punch = (ref: string, type: SessionPunch['type'], iso: string): SessionPunch => ({ ref, type, at: at(iso) });
const NOW = at('2026-10-26T12:00:00Z');

describe('pairSessions', () => {
  it('pairs clock-in with the following clock-out and measures minutes', () => {
    const [s] = pairSessions([punch('a', 'CLOCK_IN', '2026-10-26T05:00:00Z'), punch('b', 'CLOCK_OUT', '2026-10-26T09:30:00Z')], NOW, 16);
    expect(s).toEqual(expect.objectContaining({ status: 'CLOSED', startRef: 'a', endRef: 'b', durationMinutes: 270 }));
  });

  it('keeps an overnight shift (22:00 to 06:00) as one session', () => {
    const [s] = pairSessions([punch('a', 'CLOCK_IN', '2026-10-25T19:00:00Z'), punch('b', 'CLOCK_OUT', '2026-10-26T03:00:00Z')], NOW, 16);
    expect(s!.status).toBe('CLOSED');
    expect(s!.durationMinutes).toBe(480);
  });

  it('an open session within the maximum stays OPEN', () => {
    const [s] = pairSessions([punch('a', 'CLOCK_IN', '2026-10-26T10:00:00Z')], NOW, 16);
    expect(s).toEqual(expect.objectContaining({ status: 'OPEN', endRef: null, durationMinutes: null }));
  });

  it('an open session older than the maximum is INCOMPLETE', () => {
    const [s] = pairSessions([punch('a', 'CLOCK_IN', '2026-10-25T19:59:00Z')], NOW, 16);
    expect(s).toEqual(expect.objectContaining({ status: 'INCOMPLETE', endRef: null, durationMinutes: null }));
  });

  it('a second clock-in before any clock-out makes the first one INCOMPLETE', () => {
    const out = pairSessions(
      [punch('a', 'CLOCK_IN', '2026-10-26T05:00:00Z'), punch('b', 'CLOCK_IN', '2026-10-26T06:00:00Z'), punch('c', 'CLOCK_OUT', '2026-10-26T07:00:00Z')],
      NOW,
      16,
    );
    expect(out.map((s) => [s.startRef, s.status])).toEqual([
      ['a', 'INCOMPLETE'],
      ['b', 'CLOSED'],
    ]);
  });

  it('a clock-out without an open clock-in forms no session', () => {
    expect(pairSessions([punch('b', 'CLOCK_OUT', '2026-10-26T07:00:00Z')], NOW, 16)).toEqual([]);
  });

  it('a span longer than the maximum closes as INCOMPLETE, without a duration', () => {
    const [s] = pairSessions([punch('a', 'CLOCK_IN', '2026-10-25T01:00:00Z'), punch('b', 'CLOCK_OUT', '2026-10-26T06:00:00Z')], NOW, 16);
    expect(s).toEqual(expect.objectContaining({ status: 'INCOMPLETE', endRef: null, durationMinutes: null }));
  });

  it('is independent of input order', () => {
    const a = punch('a', 'CLOCK_IN', '2026-10-26T05:00:00Z');
    const b = punch('b', 'CLOCK_OUT', '2026-10-26T09:00:00Z');
    expect(pairSessions([b, a], NOW, 16)).toEqual(pairSessions([a, b], NOW, 16));
  });
});

describe('localDate', () => {
  it('uses the tenant timezone, not UTC', () => {
    // 22:30 UTC on the 26th is 01:30 on the 27th in Riyadh.
    expect(localDate(at('2026-10-26T22:30:00Z'), 'Asia/Riyadh')).toBe('2026-10-27');
    expect(localDate(at('2026-10-26T22:30:00Z'), 'UTC')).toBe('2026-10-26');
  });
});
