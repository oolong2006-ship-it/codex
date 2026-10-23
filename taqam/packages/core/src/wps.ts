import { DateInput, formatIsoDate, round2 } from './dates';

export interface WpsEmployeeRow {
  employeeNumber: string;
  nationalId: string;
  nameEn: string;
  iban: string;
  bankCode: string;
  basic: number;
  housing: number;
  otherEarnings: number;
  deductions: number;
  net: number;
}

export interface WpsHeader {
  establishmentId: string;
  companyNameEn: string;
  companyIban: string;
  bankCode: string;
  period: string;
  paymentDate: DateInput;
}

function normalizeIban(iban: string): string {
  return String(iban ?? '').replace(/\s+/g, '').toUpperCase();
}

/** ISO 7064 mod-97 over an IBAN (already normalized). */
function ibanMod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const digits = code >= 65 && code <= 90 ? String(code - 55) : ch;
    for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem;
}

/** SA + 22 digits (24 chars), ISO 7064 mod-97 == 1. Spaces and lowercase tolerated. */
export function validateSaudiIban(iban: string): boolean {
  const v = normalizeIban(iban);
  if (!/^SA\d{22}$/.test(v)) return false;
  return ibanMod97(v) === 1;
}

/** Bank code = IBAN characters at index 4..5 (the 5th and 6th characters). */
export function bankCodeFromIban(iban: string): string {
  return normalizeIban(iban).slice(4, 6);
}

/** Compute check digits for a Saudi BBAN (20 digits after the check digits). Helper. */
export function makeSaudiIban(bban: string): string {
  const b = String(bban).replace(/\s+/g, '');
  const rem = ibanMod97('SA00' + b);
  const check = String(98 - rem).padStart(2, '0');
  return 'SA' + check + b;
}

function csvField(v: string | number): string {
  const s = String(v ?? '');
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const money = (n: number) => round2(n || 0).toFixed(2);

/**
 * Generate a WPS / Mudad-style payroll CSV (UTF-8, "\n" line endings).
 *
 * Line 1 — header record, columns:
 *   establishmentId, bankCode, companyIban, period (YYYY-MM),
 *   paymentDate (YYYY-MM-DD), count (valid employee lines), totalNet (2 decimals)
 *
 * Following lines — one per valid employee, columns:
 *   employeeNumber, nationalId, nameEn, iban, bankCode, basic, housing,
 *   otherEarnings, deductions, net   (amounts with 2 decimals)
 *
 * Fields containing commas, quotes or newlines are quoted (RFC 4180).
 * Rows with an invalid IBAN, missing nationalId or net <= 0 are reported in
 * `errors` (Arabic) and excluded from the file and totals. Header problems are
 * reported with employeeNumber "HEADER".
 */
export function generateWpsCsv(
  header: WpsHeader,
  rows: WpsEmployeeRow[],
): { csv: string; errors: { employeeNumber: string; messageAr: string }[]; totalNet: number; count: number } {
  const errors: { employeeNumber: string; messageAr: string }[] = [];
  const companyIban = normalizeIban(header.companyIban);
  if (!validateSaudiIban(companyIban)) {
    errors.push({ employeeNumber: 'HEADER', messageAr: 'رقم الآيبان الخاص بالمنشأة غير صالح' });
  }
  if (!header.establishmentId || !String(header.establishmentId).trim()) {
    errors.push({ employeeNumber: 'HEADER', messageAr: 'رقم المنشأة مفقود' });
  }

  const lines: string[] = [];
  let totalCents = 0;
  let count = 0;
  for (const r of rows) {
    const rowErrors: string[] = [];
    const iban = normalizeIban(r.iban);
    if (!validateSaudiIban(iban)) rowErrors.push('رقم الآيبان غير صالح');
    if (!r.nationalId || !String(r.nationalId).trim()) rowErrors.push('رقم الهوية/الإقامة مفقود');
    if (!(typeof r.net === 'number' && Number.isFinite(r.net) && r.net > 0)) rowErrors.push('صافي الراتب يجب أن يكون أكبر من صفر');
    if (rowErrors.length) {
      for (const m of rowErrors) errors.push({ employeeNumber: r.employeeNumber, messageAr: m });
      continue;
    }
    const bankCode = (r.bankCode && String(r.bankCode).trim()) || bankCodeFromIban(iban);
    lines.push(
      [
        r.employeeNumber,
        String(r.nationalId).trim(),
        r.nameEn,
        iban,
        bankCode,
        money(r.basic),
        money(r.housing),
        money(r.otherEarnings),
        money(r.deductions),
        money(r.net),
      ]
        .map(csvField)
        .join(','),
    );
    totalCents += Math.round(round2(r.net) * 100);
    count++;
  }
  const totalNet = round2(totalCents / 100);
  const headerLine = [
    header.establishmentId,
    (header.bankCode && String(header.bankCode).trim()) || bankCodeFromIban(companyIban),
    companyIban,
    header.period,
    formatIsoDate(header.paymentDate),
    count,
    totalNet.toFixed(2),
  ]
    .map(csvField)
    .join(',');
  const csv = [headerLine, ...lines].join('\n') + '\n';
  return { csv, errors, totalNet, count };
}
