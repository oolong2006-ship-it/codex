import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import { isAwaitingDevice, isPermanentPunchError, punchMode, riyadhDate, sendQueuedPunch } from './punch';

const q = (kind: 'IN' | 'OUT', capturedAt: string, branchCode?: string) => ({ id: kind, kind, lat: 1, lng: 2, capturedAt, employeeId: 'emp-A', ...(branchCode ? { branchCode } : {}) });
const deviceRefusal = () => new ApiError(403, 'device', 'هذا الجهاز غير مسجل لحسابك. اطلب من الموارد البشرية اعتماد الجهاز الجديد', { code: 'DEVICE_NOT_REGISTERED' });

describe('ESS punch helpers', () => {
  it('riyadhDate uses Asia/Riyadh (UTC+3)', () => {
    expect(riyadhDate('2026-10-31T20:59:00Z')).toBe('2026-10-31');
    expect(riyadhDate('2026-10-31T21:01:00Z')).toBe('2026-11-01');
  });

  it('a queued punch moves the card on as if it were recorded', () => {
    const day = '2026-10-31';
    expect(punchMode({ checkIn: null, checkOut: null }, [], day)).toBe('in');
    expect(punchMode({ checkIn: null, checkOut: null }, [q('IN', '2026-10-31T05:00:00Z')], day)).toBe('out');
    expect(punchMode({ checkIn: '2026-10-31T05:00:00Z', checkOut: null }, [q('OUT', '2026-10-31T13:00:00Z')], day)).toBe('done');
    expect(punchMode({ checkIn: '2026-10-31T05:00:00Z', checkOut: '2026-10-31T13:00:00Z' }, [], day)).toBe('done');
    // yesterday's queued punch does not count for today
    expect(punchMode({ checkIn: null, checkOut: null }, [q('IN', '2026-10-30T05:00:00Z')], day)).toBe('in');
  });

  it('only refusals the server will never accept are permanent (network, auth, 5xx retry)', () => {
    const now = new Date('2026-10-31T12:00:00Z');
    const p = q('IN', '2026-10-31T09:00:00Z');
    expect(isPermanentPunchError(new ApiError(400, 'window'), p, now)).toBe(true);
    expect(isPermanentPunchError(new ApiError(403, 'forbidden'), p, now)).toBe(true);
    expect(isPermanentPunchError(new ApiError(0, 'Network error'), p, now)).toBe(false);
    expect(isPermanentPunchError(new ApiError(401, 'expired'), p, now)).toBe(false);
    expect(isPermanentPunchError(new ApiError(503, 'down'), p, now)).toBe(false);
    expect(isPermanentPunchError(new Error('x'), p, now)).toBe(false);
  });

  it('a device waiting for HR approval is temporary: kept queued until the 12-hour window passes', () => {
    const now = new Date('2026-10-31T12:00:00Z');
    expect(isPermanentPunchError(deviceRefusal(), q('IN', '2026-10-31T09:00:00Z'), now)).toBe(false);
    expect(isPermanentPunchError(deviceRefusal(), q('IN', '2026-10-31T00:30:00Z'), now)).toBe(false);
    expect(isPermanentPunchError(deviceRefusal(), q('IN', '2026-10-30T23:59:00Z'), now)).toBe(true);
    expect(isAwaitingDevice(deviceRefusal())).toBe(true);
    expect(isAwaitingDevice(new ApiError(403, 'forbidden'))).toBe(false);
    // HR rejected this device: drop the queued punch and show the refusal now
    const rejected = new ApiError(403, 'device', 'هذا الجهاز غير مسجل لحسابك. اطلب من الموارد البشرية اعتماد الجهاز الجديد', { code: 'DEVICE_NOT_REGISTERED', deviceStatus: 'REJECTED' });
    expect(isAwaitingDevice(rejected)).toBe(false);
    expect(isPermanentPunchError(rejected, q('IN', '2026-10-31T11:00:00Z'), now)).toBe(true);
    expect(isAwaitingDevice(new ApiError(0, 'net'))).toBe(false);
  });

  it('sendQueuedPunch replays with capturedAt and treats 409 (already recorded) as delivered', async () => {
    const calls: [string, unknown][] = [];
    await sendQueuedPunch(q('IN', '2026-10-31T05:00:00.000Z'), async (path, body) => { calls.push([path, body]); });
    expect(calls).toEqual([['/me/attendance/check-in', { lat: 1, lng: 2, capturedAt: '2026-10-31T05:00:00.000Z' }]]);
    await sendQueuedPunch(q('OUT', '2026-10-31T13:00:00.000Z', '482913'), async (path, body) => { calls.push([path, body]); });
    expect(calls[1]).toEqual(['/me/attendance/check-out', { lat: 1, lng: 2, capturedAt: '2026-10-31T13:00:00.000Z', branchCode: '482913' }]);
    await expect(sendQueuedPunch(q('OUT', '2026-10-31T13:00:00.000Z'), async () => { throw new ApiError(409, 'dup'); })).resolves.toBeUndefined();
    await expect(sendQueuedPunch(q('OUT', '2026-10-31T13:00:00.000Z'), async () => { throw new ApiError(0, 'net'); })).rejects.toMatchObject({ status: 0 });
  });
});
