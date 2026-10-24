/** Leading characters that make Excel/Sheets evaluate a cell as a formula (CSV/formula injection). */
const FORMULA_START = /^[=+\-@]/;

const field = (v: unknown) => {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  // Neutralise formulas in text cells; numbers (e.g. -500) stay numeric.
  if (typeof v === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV with UTF-8 BOM (so Excel shows Arabic correctly). */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [cols.join(','), ...rows.map((r) => cols.map((c) => field(r[c])).join(','))];
  return '﻿' + lines.join('\n') + '\n';
}
