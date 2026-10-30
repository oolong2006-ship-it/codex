import { Lang } from './i18n';

/** Joins truthy class names. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Locale-aware thousands formatting; Western digits for cross-locale consistency. */
export function formatNumber(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('en-US');
}

/** Compact relative time, e.g. "منذ 3 د" / "3m ago". */
export function formatRelativeTime(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSec = Math.round((Date.now() - then) / 1000);
  const abs = Math.abs(diffSec);
  let value: number;
  let suffix: string;
  if (abs < 60) {
    value = abs;
    suffix = lang === 'ar' ? 'ث' : 's';
  } else if (abs < 3600) {
    value = Math.round(abs / 60);
    suffix = lang === 'ar' ? 'د' : 'm';
  } else if (abs < 86400) {
    value = Math.round(abs / 3600);
    suffix = lang === 'ar' ? 'س' : 'h';
  } else {
    value = Math.round(abs / 86400);
    suffix = lang === 'ar' ? 'ي' : 'd';
  }
  if (lang === 'ar') return `منذ ${value} ${suffix}`;
  return `${value}${suffix} ago`;
}
