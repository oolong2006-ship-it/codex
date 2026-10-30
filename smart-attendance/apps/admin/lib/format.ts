import { DEFAULT_TIMEZONE } from './config';

/** تاريخ ووقت بتوقيت المنطقة، بصيغة YYYY-MM-DD HH:MM (أرقام لاتينية، مناسبة للجداول). */
export function formatDateTime(value: string | Date | null | undefined, timeZone = DEFAULT_TIMEZONE): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

/** الشهر الحالي بصيغة YYYY-MM في منطقة العميل. */
export function currentMonth(timeZone = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  return formatDateTime(now, timeZone).slice(0, 7);
}

/** تاريخ اليوم بصيغة YYYY-MM-DD في منطقة العميل. */
export function today(timeZone = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  return formatDateTime(now, timeZone).slice(0, 10);
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  return `${minutes} د`;
}

/** يضيف أيامًا إلى تاريخ YYYY-MM-DD ويعيد YYYY-MM-DD. */
export function addDaysIso(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) + days * 24 * 3600 * 1000;
  return new Date(time).toISOString().slice(0, 10);
}
