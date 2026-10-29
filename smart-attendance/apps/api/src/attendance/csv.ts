/**
 * CSV للكشوف: UTF-8 مع BOM ليقرأ Excel العربية بشكل صحيح.
 * الخلايا التي تبدأ بمحرف صيغة (= + - @) تُسبق بـ ' لمنع تنفيذها كمعادلة (CSV injection).
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const lines = [header.join(','), ...rows.map((row) => header.map((h) => csvCell(row[h])).join(','))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
