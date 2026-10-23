const field = (v: unknown) => {
  const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV with UTF-8 BOM (so Excel shows Arabic correctly). */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [cols.join(','), ...rows.map((r) => cols.map((c) => field(r[c])).join(','))];
  return '﻿' + lines.join('\n') + '\n';
}
