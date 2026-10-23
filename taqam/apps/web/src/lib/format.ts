// Formatting helpers. Western digits are used for numbers (common in Saudi business software).
export function money(n: number | null | undefined, opts: { currency?: boolean; decimals?: number } = {}) {
  const v = Number(n ?? 0);
  const s = v.toLocaleString('en-US', { minimumFractionDigits: opts.decimals ?? 2, maximumFractionDigits: opts.decimals ?? 2 });
  return opts.currency === false ? s : `${s} ر.س`;
}
export function num(n: number | null | undefined, decimals = 0) {
  return Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: decimals });
}
export function pct(n: number | null | undefined) { return `${Number(n ?? 0).toFixed(1)}%`; }

export function date(d: string | Date | null | undefined, lang: 'ar' | 'en' = 'ar') {
  if (!d) return '—';
  const x = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00` : d) : d;
  if (isNaN(x.getTime())) return '—';
  return x.toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}
export function time(d: string | Date | null | undefined) {
  if (!d) return '—';
  const x = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(x.getTime())) return '—';
  return x.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' });
}
export function minutesToHours(m: number | null | undefined) {
  const v = Math.max(0, Math.round(Number(m ?? 0)));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/** "2026-09" -> "سبتمبر 2026" */
export function period(p: string | null | undefined, lang: 'ar' | 'en' = 'ar') {
  if (!p) return '—';
  const [y, m] = p.split('-').map(Number);
  return `${(lang === 'ar' ? MONTHS_AR : MONTHS_EN)[m - 1] ?? m} ${y}`;
}
export function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
}
export function currentPeriod() { return todayISO().slice(0, 7); }
export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
}
