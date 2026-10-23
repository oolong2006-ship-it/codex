/** Port of apps/api/src/common/dates.ts — calendar logic in Asia/Riyadh (UTC+3). Days are 'YYYY-MM-DD' strings. */
export const RIYADH_OFFSET_MIN = 180;

export function todayStr(now: Date = new Date()): string {
  return new Date(now.getTime() + RIYADH_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}
export function day(s: string | Date): Date {
  if (s instanceof Date) return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
  return new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
}
export function dayStr(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}
export function addDays(d: Date | string, n: number): string {
  const x = day(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
export function weekday(d: Date | string): number {
  return day(d).getUTCDay();
}
export function periodRange(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10), end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}
export function periodOf(d: Date | string): string {
  return dayStr(d)!.slice(0, 7);
}
export function addMonths(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
/** Calendar day + "HH:mm" Riyadh local → absolute Date. */
export function riyadhDateTime(date: Date | string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(day(date).getTime() + (h * 60 + m - RIYADH_OFFSET_MIN) * 60000);
}
export function parseTime(date: Date | string, value: string | null | undefined): Date | null {
  if (!value) return null;
  if (/^\d{1,2}:\d{2}$/.test(value)) return riyadhDateTime(date, value.padStart(5, '0'));
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from.slice(0, 10); d <= to.slice(0, 10); d = addDays(d, 1)) out.push(d);
  return out;
}
export const maxDay = (a: string, b: string) => (a > b ? a : b);
export const minDay = (a: string, b: string) => (a < b ? a : b);
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const iso = (d: Date = new Date()) => d.toISOString();
