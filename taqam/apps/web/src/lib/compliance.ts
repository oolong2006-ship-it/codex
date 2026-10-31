/** Compliance center copy and chart helpers (spec §5). Pure, no I/O. */
import type { Bilingual } from './saudization';

/** Spec §5: fee defaults are labelled as editable values the owner must verify. */
export const FEES_NOTE: Bilingual = { ar: 'قابلة للتعديل من الإعدادات — تحقق من الرسوم الحالية', en: 'Editable in Settings — verify the current fees' };

export type CostKey = 'gross' | 'gosiEmployer' | 'govFees';

/**
 * The three parts of the true labor cost, in a fixed order. Colours are categorical slots 1–3 of the
 * dataviz reference palette (validated: CVD ΔE 9.2, normal-vision ΔE 27.6 on white); slot 3 is below
 * 3:1 contrast, so the branch table always sits beside the chart.
 */
export const COST_SEGMENTS: readonly { key: CostKey; color: string; label: Bilingual }[] = [
  { key: 'gross', color: '#2a78d6', label: { ar: 'إجمالي الرواتب', en: 'Gross pay' } },
  { key: 'gosiEmployer', color: '#eb6834', label: { ar: 'تأمينات (حصة المنشأة)', en: 'GOSI (employer)' } },
  { key: 'govFees', color: '#1baf7a', label: { ar: 'رسوم حكومية', en: 'Government fees' } },
];

type CostRow = Record<CostKey | 'total', number>;

/** Segment widths (%) of each branch bar relative to the largest branch total; all zeros (never NaN) when nothing costs. */
export function costBarWidths(rows: CostRow[]): CostRow[] {
  const max = Math.max(0, ...rows.map((r) => r.total));
  const w = (n: number) => (max > 0 && Number.isFinite(n) ? Math.round((n / max) * 10000) / 100 : 0);
  return rows.map((r) => ({ gross: w(r.gross), gosiEmployer: w(r.gosiEmployer), govFees: w(r.govFees), total: w(r.total) }));
}

/** Settings fee input → amount rounded to 2 decimals (the API rejects more), or a validation message. Empty is an error, never the default. */
export function parseFee(raw: string | number | null | undefined): { value: number } | { error: Bilingual } {
  const s = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(s) || s < 0) return { error: { ar: 'أدخل مبلغاً صحيحاً (0 أو أكثر)', en: 'Enter a valid amount (0 or more)' } };
  if (s > 100000) return { error: { ar: 'الحد الأقصى 100,000', en: 'Maximum 100,000' } };
  return { value: Math.round((s + Number.EPSILON) * 100) / 100 };
}
