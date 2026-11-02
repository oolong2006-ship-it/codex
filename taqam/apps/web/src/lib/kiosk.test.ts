import { describe, expect, it } from 'vitest';
import {
  afterPinFailure, isPinLocked, kioskAction, matchEmployeeNumber, normalizeDigits, normalizePin, keypadAppend, isKioskToken,
  DEMO_KIOSK_TOKEN, KIOSK_LOCK_MS, KIOSK_WINDOW_MS,
} from './kiosk';

const at = (iso: string) => new Date(iso);
const clean = { failCount: 0, firstFailAt: null, lockedUntil: null };

/** Same rules as apps/api/src/kiosk/kiosk.service.ts (pure helpers shared by the kiosk screen and the demo mock). */
describe('kiosk helpers', () => {
  it('normalizes Arabic-Indic digits', () => {
    expect(normalizeDigits(' ٠١٢٣٤٥٦٧٨٩ ')).toBe('0123456789');
    expect(normalizeDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
  });

  it('PIN: 4–6 digits (Arabic-Indic accepted)', () => {
    expect(normalizePin('١٢٣٤')).toBe('1234');
    expect(normalizePin('123456')).toBe('123456');
    for (const bad of ['123', '1234567', 'abcd', '', undefined, 1234]) expect(normalizePin(bad as unknown as string)).toBeNull();
  });

  it('keypad input keeps digits only (Arabic-Indic typed on a keyboard too) up to a max length', () => {
    expect(keypadAppend('12', '3', 6)).toBe('123');
    expect(keypadAppend('12', '٣', 6)).toBe('123');
    expect(keypadAppend('123456', '7', 6)).toBe('123456');
    expect(keypadAppend('12', 'a', 6)).toBe('12');
  });

  it('kiosk tokens are 64 hex chars; the demo token is one', () => {
    expect(isKioskToken(DEMO_KIOSK_TOKEN)).toBe(true);
    expect(isKioskToken(' ' + DEMO_KIOSK_TOKEN.toUpperCase() + ' ')).toBe(true);
    expect(isKioskToken('abc')).toBe(false);
  });

  describe('lockout', () => {
    const t0 = at('2026-11-01T08:00:00Z');
    it('locks on the 5th failure within 15 minutes, for 15 minutes', () => {
      let s: Parameters<typeof afterPinFailure>[0] = { ...clean };
      for (let i = 1; i <= 5; i++) s = afterPinFailure(s, new Date(t0.getTime() + i * 1000));
      expect(s.failCount).toBe(5);
      expect(Date.parse(s.lockedUntil!)).toBe(t0.getTime() + 5000 + KIOSK_LOCK_MS);
      expect(isPinLocked(s, new Date(t0.getTime() + 6000))).toBe(true);
      expect(isPinLocked(s, new Date(t0.getTime() + 5000 + KIOSK_LOCK_MS + 1))).toBe(false);
    });
    it('restarts when the first failure is older than 15 minutes', () => {
      const s = afterPinFailure({ failCount: 4, firstFailAt: t0.toISOString(), lockedUntil: null }, new Date(t0.getTime() + KIOSK_WINDOW_MS + 1));
      expect(s.failCount).toBe(1);
      expect(s.lockedUntil).toBeNull();
    });
  });

  it('matches the employee number exactly or by its digits', () => {
    const emps = [{ id: 'a', employeeNumber: 'EMP-0005' }, { id: 'b', employeeNumber: 'EMP-0012' }];
    expect(matchEmployeeNumber('EMP-0005', emps)?.id).toBe('a');
    expect(matchEmployeeNumber('5', emps)?.id).toBe('a');
    expect(matchEmployeeNumber('١٢', emps)?.id).toBe('b');
    expect(matchEmployeeNumber('99', emps)).toBeNull();
    expect(matchEmployeeNumber('0', emps)).toBeNull();
  });

  it('IN when no check-in today, else OUT; overnight shifts close the previous record', () => {
    const now = at('2026-11-01T10:00:00Z');
    expect(kioskAction(null, null, now)).toEqual({ action: 'IN' });
    expect(kioskAction({ checkIn: '2026-11-01T05:00:00Z', checkOut: null, shift: null }, null, now)).toEqual({ action: 'OUT', target: 'today' });
    expect(kioskAction({ checkIn: '2026-11-01T09:59:30Z', checkOut: null, shift: null }, null, now)).toEqual({ error: 'TOO_SOON' });
    expect(kioskAction({ checkIn: '2026-11-01T05:00:00Z', checkOut: '2026-11-01T09:00:00Z', shift: null }, null, now)).toEqual({ error: 'ALREADY_OUT' });
    expect(kioskAction(null, { checkIn: '2026-10-31T19:00:00Z', checkOut: null, shift: { startTime: '22:00', endTime: '06:00' } }, now)).toEqual({ action: 'OUT', target: 'previous' });
    expect(kioskAction(null, { checkIn: '2026-10-31T19:00:00Z', checkOut: null, shift: { startTime: '08:00', endTime: '17:00' } }, now)).toEqual({ action: 'IN' });
  });
});
