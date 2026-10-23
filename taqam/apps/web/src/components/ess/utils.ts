// Small client-side helpers for the ESS app (no external coupling).

/** Great-circle distance in meters between two lat/lng points. */
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(m: number, lang: 'ar' | 'en') {
  if (m < 1000) return lang === 'ar' ? `${Math.round(m)} م` : `${Math.round(m)} m`;
  const km = (m / 1000).toFixed(m < 10000 ? 1 : 0);
  return lang === 'ar' ? `${km} كم` : `${km} km`;
}

/** Riyadh-local hour (0-23). */
export function riyadhHour(d = new Date()) {
  return Number(d.toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Riyadh' })) % 24;
}

/** Inclusive calendar span between two YYYY-MM-DD dates and the count excluding Fri/Sat (Saudi weekend). */
export function estimateLeaveDays(start: string, end: string, weekend: number[] = [5, 6]) {
  if (!start || !end) return { calendar: 0, working: 0 };
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return { calendar: 0, working: 0 };
  let calendar = 0; let working = 0;
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    calendar++;
    if (!weekend.includes(d.getUTCDay())) working++;
  }
  return { calendar, working };
}

/** Days from today until a YYYY-MM-DD / ISO date (negative if past). */
export function daysUntil(d: string | null | undefined) {
  if (!d) return null;
  const x = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  if (isNaN(x.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((x.getTime() - today.getTime()) / 86400000);
}

export function maskIban(iban: string | null | undefined) {
  if (!iban) return '—';
  const clean = iban.replace(/\s+/g, '');
  if (clean.length < 8) return clean;
  return `${clean.slice(0, 4)} •••• •••• •••• ${clean.slice(-4)}`;
}

/** Shift a YYYY-MM period by n months. */
export function shiftPeriod(p: string, n: number) {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Combine YYYY-MM-DD + HH:mm (Riyadh local) into an ISO timestamp. */
export function riyadhISO(date: string, hhmm: string) {
  return new Date(`${date}T${hhmm}:00+03:00`).toISOString();
}
