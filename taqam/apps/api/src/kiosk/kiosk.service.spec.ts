import { createHash } from 'crypto';
import {
  afterPinFailure,
  hashKioskToken,
  isPinLocked,
  kioskAction,
  matchEmployeeNumber,
  newKioskToken,
  normalizeDigits,
  normalizePin,
  KIOSK_LOCK_MS,
  KIOSK_WINDOW_MS,
} from './kiosk.service';

const at = (iso: string) => new Date(iso);
const clean = { kioskFailCount: 0, kioskFirstFailAt: null, kioskLockedUntil: null };

describe('kiosk helpers', () => {
  it('tokens: 32 random bytes hex, stored as sha256', () => {
    const a = newKioskToken();
    const b = newKioskToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(hashKioskToken(a)).toBe(createHash('sha256').update(a).digest('hex'));
    expect(hashKioskToken(a)).not.toBe(a);
  });

  it('normalizes Arabic-Indic digits', () => {
    expect(normalizeDigits(' ٠١٢٣٤٥٦٧٨٩ ')).toBe('0123456789');
    expect(normalizeDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(normalizeDigits('emp-٠٠٠٧')).toBe('emp-0007');
  });

  it('PIN: 4–6 digits (Arabic-Indic accepted), anything else → null', () => {
    expect(normalizePin('1234')).toBe('1234');
    expect(normalizePin('١٢٣٤٥٦')).toBe('123456');
    expect(normalizePin(' 4321 ')).toBe('4321');
    for (const bad of ['123', '1234567', 'abcd', '12 34', '', '12.4', undefined, null, 1234]) expect(normalizePin(bad as unknown as string)).toBeNull();
  });

  describe('lockout (5 wrong PINs within 15 minutes → locked 15 minutes)', () => {
    const t0 = at('2026-11-01T08:00:00Z');
    it('counts failures and locks on the 5th', () => {
      let s = { ...clean } as Parameters<typeof afterPinFailure>[0];
      for (let i = 1; i <= 4; i++) {
        s = afterPinFailure(s, new Date(t0.getTime() + i * 1000));
        expect(s.kioskFailCount).toBe(i);
        expect(s.kioskLockedUntil).toBeNull();
        expect(s.kioskFirstFailAt).toEqual(new Date(t0.getTime() + 1000));
      }
      const fifth = new Date(t0.getTime() + 5000);
      s = afterPinFailure(s, fifth);
      expect(s.kioskFailCount).toBe(5);
      expect(s.kioskLockedUntil).toEqual(new Date(fifth.getTime() + KIOSK_LOCK_MS));
      expect(isPinLocked(s, new Date(fifth.getTime() + 1))).toBe(true);
      expect(isPinLocked(s, new Date(fifth.getTime() + KIOSK_LOCK_MS + 1))).toBe(false);
    });

    it('restarts the count when the first failure is older than 15 minutes', () => {
      const s = afterPinFailure({ kioskFailCount: 4, kioskFirstFailAt: t0, kioskLockedUntil: null }, new Date(t0.getTime() + KIOSK_WINDOW_MS + 1));
      expect(s).toEqual({ kioskFailCount: 1, kioskFirstFailAt: new Date(t0.getTime() + KIOSK_WINDOW_MS + 1), kioskLockedUntil: null });
    });

    it('an expired lock starts a fresh window', () => {
      const locked = { kioskFailCount: 5, kioskFirstFailAt: t0, kioskLockedUntil: new Date(t0.getTime() + KIOSK_LOCK_MS) };
      const later = new Date(t0.getTime() + KIOSK_LOCK_MS + 60_000);
      expect(isPinLocked(locked, later)).toBe(false);
      expect(afterPinFailure(locked, later)).toEqual({ kioskFailCount: 1, kioskFirstFailAt: later, kioskLockedUntil: null });
    });

    it('no lock state → not locked', () => {
      expect(isPinLocked(clean, t0)).toBe(false);
    });
  });

  describe('employee number matching', () => {
    const emps = [
      { id: 'a', employeeNumber: 'EMP-0007' },
      { id: 'b', employeeNumber: 'EMP-0012' },
      { id: 'c', employeeNumber: '512' },
    ];
    it('exact (case-insensitive) match first', () => {
      expect(matchEmployeeNumber('EMP-0007', emps)?.id).toBe('a');
      expect(matchEmployeeNumber('emp-0012', emps)?.id).toBe('b');
      expect(matchEmployeeNumber('512', emps)?.id).toBe('c');
    });
    it('digits only (keypad, Arabic-Indic too) match the numeric part', () => {
      expect(matchEmployeeNumber('7', emps)?.id).toBe('a');
      expect(matchEmployeeNumber('0007', emps)?.id).toBe('a');
      expect(matchEmployeeNumber('١٢', emps)?.id).toBe('b');
    });
    it('no match or an ambiguous one → null', () => {
      expect(matchEmployeeNumber('99', emps)).toBeNull();
      expect(matchEmployeeNumber('', emps)).toBeNull();
      expect(matchEmployeeNumber('0', emps)).toBeNull();
      expect(matchEmployeeNumber('7', [...emps, { id: 'd', employeeNumber: 'B-7' }])).toBeNull();
    });
  });

  describe('punch action (IN when no check-in today, else OUT)', () => {
    const now = at('2026-11-01T10:00:00Z');
    const day = { startTime: '08:00', endTime: '17:00' };
    const night = { startTime: '22:00', endTime: '06:00' };
    it('no record today → IN', () => {
      expect(kioskAction(null, null, now)).toEqual({ action: 'IN' });
      expect(kioskAction({ checkIn: null, checkOut: null, shift: day }, null, now)).toEqual({ action: 'IN' });
    });
    it('open record today → OUT on it; a tap within a minute of the check-in is refused', () => {
      expect(kioskAction({ checkIn: at('2026-11-01T05:00:00Z'), checkOut: null, shift: day }, null, now)).toEqual({ action: 'OUT', target: 'today' });
      expect(kioskAction({ checkIn: at('2026-11-01T09:59:30Z'), checkOut: null, shift: day }, null, now)).toEqual({ error: 'TOO_SOON' });
    });
    it('closed record today → already checked out', () => {
      expect(kioskAction({ checkIn: at('2026-11-01T05:00:00Z'), checkOut: at('2026-11-01T09:00:00Z'), shift: day }, null, now)).toEqual({ error: 'ALREADY_OUT' });
    });
    it('previous open record closes as OUT only for an overnight shift', () => {
      const prevNight = { checkIn: at('2026-10-31T19:00:00Z'), checkOut: null, shift: night };
      expect(kioskAction(null, prevNight, now)).toEqual({ action: 'OUT', target: 'previous' });
      const prevDay = { checkIn: at('2026-10-31T19:00:00Z'), checkOut: null, shift: day };
      expect(kioskAction(null, prevDay, now)).toEqual({ action: 'IN' });
      expect(kioskAction(null, { ...prevNight, shift: null }, now)).toEqual({ action: 'IN' });
    });
  });
});
