/** Date helpers. All calendar logic is done in Asia/Riyadh (UTC+3, no DST). */
export const RIYADH_OFFSET_MIN = 180;

/** YYYY-MM-DD of "now" in Riyadh. */
export function todayStr(now: Date = new Date()): string {
  return new Date(now.getTime() + RIYADH_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD (or ISO) into a UTC-midnight Date, which is how @db.Date columns are stored. */
export function day(s: string | Date): Date {
  if (s instanceof Date) return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
  return new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
}

export function dayStr(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date | string, n: number): Date {
  const x = day(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** 0=Sun..6=Sat for a calendar day. */
export function weekday(d: Date | string): number {
  return day(d).getUTCDay();
}

export function periodRange(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return { start, end };
}

export function periodOf(d: Date | string): string {
  return dayStr(d)!.slice(0, 7);
}

export function addMonths(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Combine a calendar day + "HH:mm" Riyadh local time into an absolute Date. */
export function riyadhDateTime(date: Date | string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = day(date);
  return new Date(d.getTime() + (h * 60 + m - RIYADH_OFFSET_MIN) * 60000);
}

/** Accept "HH:mm" (Riyadh local, combined with date) or a full ISO timestamp. */
export function parseTime(date: Date | string, value: string | null | undefined): Date | null {
  if (!value) return null;
  if (/^\d{1,2}:\d{2}$/.test(value)) return riyadhDateTime(date, value.padStart(5, '0'));
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function eachDay(from: Date | string, to: Date | string): Date[] {
  const out: Date[] = [];
  for (let d = day(from); d <= day(to); d = addDays(d, 1)) out.push(d);
  return out;
}

export function maxDate(a: Date, b: Date) {
  return a > b ? a : b;
}
export function minDate(a: Date, b: Date) {
  return a < b ? a : b;
}
