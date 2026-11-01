/** Platform family from a user agent, for the HR device list (no photos, no fingerprinting beyond this). */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  if (/iPad/.test(ua)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';
  return '';
}

const RECEIVED_LATE_MS = 10 * 60_000;
/** The server receive time when a punch arrived more than 10 minutes after it was captured (offline replay), else null. */
export function receivedLate(captured: string | null | undefined, received: string | null | undefined): string | null {
  if (!captured || !received) return null;
  return Date.parse(received) - Date.parse(captured) > RECEIVED_LATE_MS ? received : null;
}
