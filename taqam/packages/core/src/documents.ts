import { DateInput, diffDays, toUtcDate } from './dates';

/** Whole days from `from` (default: today, UTC) until `date`; negative if past. */
export function daysUntil(date: DateInput, from?: DateInput): number {
  return diffDays(from ?? new Date(), toUtcDate(date));
}

export type ExpiryStatus = 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'OK' | 'NONE';

/** <0 EXPIRED, <=30 CRITICAL, <=90 WARNING, >90 OK, null/undefined NONE. */
export function expiryStatus(date: DateInput | null | undefined, from?: DateInput): ExpiryStatus {
  if (date === null || date === undefined || date === '') return 'NONE';
  const d = daysUntil(date, from);
  if (d < 0) return 'EXPIRED';
  if (d <= 30) return 'CRITICAL';
  if (d <= 90) return 'WARNING';
  return 'OK';
}
