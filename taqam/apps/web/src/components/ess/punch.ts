/** Pure helpers behind the ESS punch card: offline queue replay and the card mode (spec §6). */
import { ApiError } from '@/lib/api';
import type { QueuedPunch } from '@/lib/offlineQueue';

export const punchPath = (kind: 'IN' | 'OUT') => `/me/attendance/${kind === 'IN' ? 'check-in' : 'check-out'}`;

/** Calendar day in Riyadh for an instant. */
export function riyadhDate(iso: string | Date): string {
  return new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

/** in / out / done — a punch waiting in the offline queue counts as recorded. */
export function punchMode(today: { checkIn: string | null; checkOut: string | null }, pending: QueuedPunch[], day: string): 'in' | 'out' | 'done' {
  const queued = (k: 'IN' | 'OUT') => pending.some((p) => p.kind === k && riyadhDate(p.capturedAt) === day);
  if (!today.checkIn && !queued('IN')) return 'in';
  if (!today.checkOut && !queued('OUT')) return 'out';
  return 'done';
}

const OFFLINE_MAX_AGE_MS = 12 * 3600_000;

/** 403 because this device waits for HR approval — temporary: HR may approve it soon. A rejected device is final. */
export function isAwaitingDevice(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 403) return false;
  const body = err.body as { code?: string; deviceStatus?: string } | undefined;
  return body?.code === 'DEVICE_NOT_REGISTERED' && body.deviceStatus !== 'REJECTED';
}

/**
 * A refusal the server will never accept for this replay (outside 12 h, outside the geofence…). A device awaiting
 * approval stays queued until the punch is older than the 12-hour window.
 */
export function isPermanentPunchError(err: unknown, p: QueuedPunch, now: Date = new Date()): boolean {
  if (isAwaitingDevice(err)) return now.getTime() - Date.parse(p.capturedAt) > OFFLINE_MAX_AGE_MS;
  return err instanceof ApiError && [400, 403, 404, 422].includes(err.status);
}

/** Replays one queued punch with its original capture time; 409 means the server already has it. */
export async function sendQueuedPunch(p: QueuedPunch, post: (path: string, body: unknown) => Promise<unknown>): Promise<void> {
  try {
    await post(punchPath(p.kind), { lat: p.lat, lng: p.lng, capturedAt: p.capturedAt, ...(p.branchCode ? { branchCode: p.branchCode } : {}) });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return;
    throw e;
  }
}
