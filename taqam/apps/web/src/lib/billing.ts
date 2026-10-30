/**
 * Pure billing helpers (docs/ADMIN_PORTAL.md "v2 — Billing & subscription reminders" + "v2.1 — Review fixes"): invoice
 * math, document numbers, billing periods, overdue status, VAT registration (TRN) and IBAN validation, the ZATCA
 * Phase-1 TLV QR payload, settings validation and reminder selection. Shared by the in-browser demo API and the admin
 * UI (live preview). No I/O, no clock: every function takes "today" as a 'YYYY-MM-DD' Riyadh day.
 */
import { round2 } from '@taqam/core';

export { round2 };
/** Money rounding as the API does it: clean float noise to 12 significant digits, then round2 (683.3 × 0.15 → 102.5). */
export const money2 = (n: number) => round2(Number.isFinite(n) ? Number(n.toPrecision(12)) : 0);

export type InvoiceStatus = 'ISSUED' | 'PAID' | 'CREDITED';
export type DocumentType = 'TAX_INVOICE' | 'INVOICE' | 'CREDIT_NOTE';
export type DocSeries = 'SH' | 'SHC';
export type Cycle = 'MONTHLY' | 'ANNUAL';
export type ReminderType = 'TRIAL_ENDING' | 'SUBSCRIPTION_ENDING' | 'INVOICE_OVERDUE';

export interface BillingSettings {
  sellerName: string; sellerNameEn: string; sellerVatNumber: string; sellerCrNumber: string; sellerAddress: string;
  sellerEmail: string; sellerPhone: string; vatRate: number; invoiceDueDays: number; bankName: string; iban: string;
  /** v2.1 — billed employees floor for ESSENTIALS/GROWTH (default 10). */
  minBilledEmployees: number;
}
export interface ReminderSettings {
  enabled: boolean; trialDays: number[]; subscriptionDays: number[]; notifyOnExpiry: boolean; overdueInvoiceDays: number[];
}

export const DEFAULT_BILLING: BillingSettings = {
  sellerName: 'شؤون لتقنية المعلومات', sellerNameEn: 'Shuoon IT', sellerVatNumber: '', sellerCrNumber: '',
  sellerAddress: 'الرياض، المملكة العربية السعودية', sellerEmail: 'hello@shuoon.net', sellerPhone: '+966 55 042 1235',
  vatRate: 0.15, invoiceDueDays: 7, bankName: '', iban: '', minBilledEmployees: 10,
};
export const DEFAULT_REMINDERS: ReminderSettings = { enabled: true, trialDays: [7, 3, 1], subscriptionDays: [14, 7, 1], notifyOnExpiry: true, overdueInvoiceDays: [1, 7] };

// ---------- days ----------
const DAY_MS = 86400000;
const utc = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00.000Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(d: string, n: number): string {
  const x = utc(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmt(x);
}
/** Same day-of-month n months later, clamped to the target month's last day (Jan 31 + 1 → Feb 28). */
export function addMonthsClamped(d: string, n: number): string {
  const x = utc(d);
  const y = x.getUTCFullYear(); const m = x.getUTCMonth() + n; const dd = x.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(y, m, Math.min(dd, last))));
}
/** Calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / DAY_MS);
}

// ---------- periods ----------
export const cycleMonths = (cycle: Cycle): 1 | 12 => (cycle === 'ANNUAL' ? 12 : 1);
/**
 * Last day of a billing period (docs/ADMIN_PORTAL.md v2.1, as implemented by the API). Anchor D = the start's day of
 * month, or the anchor carried over from the previous period when this one directly follows it (see periodAnchor).
 * Target month = start month + months (one month sooner when the start day < D). The period ends the day before D in
 * the target month, or on that month's last day when it is shorter than D.
 * Examples: Jan 31 → Feb 28; (D = 31) Mar 1 → Mar 30; Mar 31 → Apr 30; Oct 1 → Oct 31.
 */
export function periodEnd(periodStart: string, months: number, anchorDay?: number): string {
  const s = utc(periodStart);
  const day = s.getUTCDate();
  const D = anchorDay ?? day;
  const y = s.getUTCFullYear();
  const m = s.getUTCMonth() + months - (day < D ? 1 : 0);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  if (D > last) return fmt(new Date(Date.UTC(y, m, last)));
  return addDays(fmt(new Date(Date.UTC(y, m, D))), -1);
}
/**
 * Anchor day for a period starting on `start`: when it directly follows a covering invoice (start = its end + 1),
 * the anchor is carried over through the whole chain (the day of month of the chain's first start); else the start day.
 */
export function periodAnchor(invoices: { status: InvoiceStatus; documentType?: DocumentType; periodStart: string; periodEnd: string }[], start: string): number {
  const rows = invoices.filter(coversPeriod);
  let cur = start.slice(0, 10);
  for (let guard = 0; guard < 1000; guard++) {
    const prev = rows.find((r) => addDays(r.periodEnd.slice(0, 10), 1) === cur);
    if (!prev || prev.periodStart.slice(0, 10) >= cur) break;
    cur = prev.periodStart.slice(0, 10);
  }
  return utc(cur).getUTCDate();
}
interface PeriodRow { status: InvoiceStatus; periodEnd: string; documentType?: DocumentType }
/** Rows that still cover their period: not credited, not credit notes. */
export const coversPeriod = (i: { status: InvoiceStatus; documentType?: DocumentType }) => i.status !== 'CREDITED' && i.documentType !== 'CREDIT_NOTE';
/**
 * Default start of the next invoice: the day after the latest covering invoice's periodEnd, else today.
 * An EXPIRED company never gets a start in the past: max(day after last end, today).
 */
export function nextPeriodStart(invoices: PeriodRow[], today: string, opts: { expired?: boolean } = {}): string {
  const ends = invoices.filter(coversPeriod).map((i) => i.periodEnd.slice(0, 10)).sort();
  const next = ends.length ? addDays(ends[ends.length - 1], 1) : today;
  return opts.expired && next < today ? today : next;
}
/** Inclusive day ranges overlap. */
export const periodsOverlap = (a: { periodStart: string; periodEnd: string }, b: { periodStart: string; periodEnd: string }) =>
  a.periodStart.slice(0, 10) <= b.periodEnd.slice(0, 10) && b.periodStart.slice(0, 10) <= a.periodEnd.slice(0, 10);
/** Allowed explicit periodStart window: [today − 60 days, today + 90 days]. */
export const PERIOD_START_WINDOW = { back: 60, ahead: 90 } as const;
export const periodStartInWindow = (start: string, today: string) =>
  start >= addDays(today, -PERIOD_START_WINDOW.back) && start <= addDays(today, PERIOD_START_WINDOW.ahead);

// ---------- math ----------
/** Input / total limits (400 above them). */
export const LIMITS = { unitPrice: 99_999_999, employees: 100_000, total: 9_999_999_999.99, notes: 2000, paymentRef: 200, reason: 1000, message: 2000 } as const;
/** Default billed employees: max(minBilledEmployees, active) for ESSENTIALS/GROWTH; ENTERPRISE max(1, active). */
export function defaultBilledEmployees(plan: string, activeEmployees: number, minBilledEmployees = DEFAULT_BILLING.minBilledEmployees): number {
  return plan === 'ENTERPRISE' ? Math.max(1, activeEmployees) : Math.max(1, minBilledEmployees, activeEmployees);
}
/** True when n has at most 2 decimals (money input). */
export const hasAtMost2Decimals = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
export interface InvoiceAmounts {
  months: number; subtotal: number; discountRate: number; discount: number; taxable: number; vatRate: number; vat: number; total: number;
}
export function computeInvoice(p: { employees: number; unitPrice: number; billingCycle: Cycle; annualDiscount: number; vatRate: number }): InvoiceAmounts {
  const months = cycleMonths(p.billingCycle);
  const subtotal = money2(p.employees * p.unitPrice * months);
  const discountRate = p.billingCycle === 'ANNUAL' ? p.annualDiscount : 0;
  const discount = money2(subtotal * discountRate);
  const taxable = money2(subtotal - discount);
  const vat = money2(taxable * p.vatRate);
  const total = money2(taxable + vat);
  return { months, subtotal, discountRate, discount, taxable, vatRate: p.vatRate, vat, total };
}

// ---------- numbers ----------
export const formatDocNumber = (series: DocSeries, year: number, seq: number) => `${series}-${year}-${String(seq).padStart(4, '0')}`;
export const formatInvoiceNumber = (year: number, seq: number) => formatDocNumber('SH', year, seq);
/**
 * Takes the next number of a per-year, per-series counter (SH = invoices, SHC = credit notes) and advances it.
 * Numbers are never reused, even if rows disappear: the counter, not the rows, is the source of truth.
 */
export function takeDocNumber(counters: Record<string, number>, series: DocSeries, year: number): string {
  const key = `${series}-${year}`;
  counters[key] = (counters[key] ?? 0) + 1;
  return formatDocNumber(series, year, counters[key]);
}

// ---------- status ----------
/** Unpaid (ISSUED) invoice past its due date. Credit notes are never payable, so never overdue. */
export const isOverdue = (inv: { status: InvoiceStatus; dueDate: string; documentType?: DocumentType }, today: string) =>
  inv.status === 'ISSUED' && inv.documentType !== 'CREDIT_NOTE' && inv.dueDate.slice(0, 10) < today;
/** Counts toward «outstanding»: an unpaid invoice (credit notes excluded). */
export const isOutstanding = (inv: { status: InvoiceStatus; documentType?: DocumentType }) => inv.status === 'ISSUED' && inv.documentType !== 'CREDIT_NOTE';

// ---------- VAT registration / bank ----------
/** Saudi VAT registration number (TRN): 15 digits, starts and ends with 3. */
export const isValidTrn = (s: string | null | undefined) => /^3\d{13}3$/.test((s ?? '').trim());
export const TRN_ERROR = ['billing.sellerVatNumber must be 15 digits starting and ending with 3', 'الرقم الضريبي يجب أن يكون 15 رقماً يبدأ وينتهي بالرقم 3'] as const;
/** Saudi IBAN: SA + 22 digits (spaces ignored). */
export const isValidSaIban = (s: string | null | undefined) => /^SA\d{22}$/.test((s ?? '').replace(/\s+/g, '').toUpperCase());
export const IBAN_ERROR = ['IBAN must be SA followed by 22 digits', 'الآيبان يجب أن يبدأ بـ SA ويتبعه 22 رقماً'] as const;
/** Registered seller → tax invoice at the configured rate; otherwise a plain invoice with VAT 0. */
export function vatGate(b: Pick<BillingSettings, 'sellerVatNumber' | 'vatRate'>): { documentType: 'TAX_INVOICE' | 'INVOICE'; vatRate: number } {
  return isValidTrn(b.sellerVatNumber) ? { documentType: 'TAX_INVOICE', vatRate: b.vatRate } : { documentType: 'INVOICE', vatRate: 0 };
}
export const UNREGISTERED_NOTE = ['The seller is not registered for VAT', 'المنشأة غير مسجلة في ضريبة القيمة المضافة'] as const;

// ---------- ZATCA Phase-1 QR ----------
export interface ZatcaFields { sellerName: string; vatNumber: string; timestamp: string; total: number | string; vat: number | string }
const amount = (n: number | string) => (typeof n === 'number' ? n.toFixed(2) : n);
function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
/**
 * ZATCA Phase-1 QR payload: base64 of TLV records (1 byte tag, 1 byte UTF-8 length, value) —
 * 1 seller name, 2 VAT number, 3 timestamp (ISO 8601), 4 total incl. VAT ("1334.00"), 5 VAT total.
 */
export function zatcaTlv(f: ZatcaFields): string {
  const enc = new TextEncoder();
  const values = [f.sellerName, f.vatNumber, f.timestamp, amount(f.total), amount(f.vat)];
  const parts: number[] = [];
  values.forEach((v, i) => {
    const b = enc.encode(v);
    if (b.length > 255) throw new Error(`ZATCA TLV tag ${i + 1} is longer than 255 bytes`);
    parts.push(i + 1, b.length, ...b);
  });
  return toBase64(Uint8Array.from(parts));
}
/** Decodes a Phase-1 TLV payload into { tag: value } (for tests and diagnostics). */
export function decodeZatcaTlv(b64: string): Record<number, string> {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const dec = new TextDecoder();
  const out: Record<number, string> = {};
  for (let i = 0; i < bytes.length;) {
    const tag = bytes[i]; const len = bytes[i + 1];
    out[tag] = dec.decode(bytes.slice(i + 2, i + 2 + len));
    i += 2 + len;
  }
  return out;
}

// ---------- strict input ----------
/** Strict 'YYYY-MM-DD' that is a real calendar day (2026-02-30 → false). */
export function isStrictDay(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// ---------- settings validation ----------
/** Arabic message for a billingSettingsError() result. */
export const billingSettingsErrorAr = (err: string) => (err === TRN_ERROR[0] ? TRN_ERROR[1] : 'قيمة غير صالحة في بيانات الفوترة');
const STRING_KEYS: (keyof BillingSettings)[] = ['sellerName', 'sellerNameEn', 'sellerVatNumber', 'sellerCrNumber', 'sellerAddress', 'sellerEmail', 'sellerPhone', 'bankName', 'iban'];
/** null when a (partial) billing patch is valid, otherwise a class-validator style message. */
export function billingSettingsError(patch: object): string | null {
  const p = patch as Record<string, unknown>;
  for (const k of STRING_KEYS) if (p[k] !== undefined && typeof p[k] !== 'string') return `billing.${k} must be a string`;
  if (p.vatRate !== undefined && (typeof p.vatRate !== 'number' || !Number.isFinite(p.vatRate) || p.vatRate < 0 || p.vatRate > 1)) return 'billing.vatRate must be between 0 and 1';
  if (p.invoiceDueDays !== undefined && (typeof p.invoiceDueDays !== 'number' || !Number.isInteger(p.invoiceDueDays) || p.invoiceDueDays < 0 || p.invoiceDueDays > 90)) return 'billing.invoiceDueDays must be an integer between 0 and 90';
  if (p.minBilledEmployees !== undefined && (typeof p.minBilledEmployees !== 'number' || !Number.isInteger(p.minBilledEmployees) || p.minBilledEmployees < 1 || p.minBilledEmployees > LIMITS.employees)) return `billing.minBilledEmployees must be an integer between 1 and ${LIMITS.employees}`;
  if (typeof p.sellerVatNumber === 'string' && p.sellerVatNumber.trim() !== '' && !isValidTrn(p.sellerVatNumber)) return TRN_ERROR[0];
  return null;
}
const dayList = (x: unknown) => Array.isArray(x) && x.length <= 6 && x.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 60);
export function remindersSettingsError(patch: object): string | null {
  const p = patch as Record<string, unknown>;
  for (const k of ['enabled', 'notifyOnExpiry']) if (p[k] !== undefined && typeof p[k] !== 'boolean') return `reminders.${k} must be a boolean value`;
  for (const k of ['trialDays', 'subscriptionDays', 'overdueInvoiceDays']) if (p[k] !== undefined && !dayList(p[k])) return `reminders.${k} must be a list of up to 6 integers between 0 and 60`;
  return null;
}
/** Sorted (descending), de-duplicated day list. */
export const normalizeDays = (xs: number[]) => Array.from(new Set(xs)).sort((a, b) => b - a);

// ---------- reminders ----------
export interface ReminderCompany { id: string; status: string; trialEndsAt: string | null; subscriptionEndsAt: string | null }
export interface ReminderInvoice { id: string; companyId: string; status: InvoiceStatus; dueDate: string; documentType?: DocumentType }
/** `days` = actual days left / overdue (for the message); `threshold` = the configured point it catches up to (dedupe key). */
export interface ReminderCandidate { type: ReminderType; companyId: string; invoiceId: string | null; days: number; threshold: number; dedupeKey: string }

export const expiredDedupeKey = (companyId: string, endDay: string) => `EXPIRED:${companyId}:${endDay}`;

/** Smallest configured threshold ≥ days (catch-up for "days before"), else null. */
const catchUpBefore = (thresholds: number[], days: number) => {
  const xs = thresholds.filter((t) => t >= days);
  return xs.length ? Math.min(...xs) : null;
};
/** Largest configured threshold ≤ days (catch-up for "days overdue"), else null. */
const catchUpAfter = (thresholds: number[], days: number) => {
  const xs = thresholds.filter((t) => t <= days && t > 0);
  return xs.length ? Math.max(...xs) : null;
};

/**
 * Automatic reminders due today, with catch-up: for each target the smallest configured threshold ≥ days left
 * (overdue invoices: the largest threshold ≤ days overdue). The dedupe key uses the threshold, so a missed run is
 * caught up once and never repeated. Company end dates are Riyadh calendar days ('YYYY-MM-DD').
 * Order: trials, subscriptions (company order), then overdue invoices (invoice order). Credit notes are skipped.
 */
export function selectReminders(companies: ReminderCompany[], invoices: ReminderInvoice[], s: ReminderSettings, today: string): ReminderCandidate[] {
  if (!s.enabled) return [];
  const out: ReminderCandidate[] = [];
  for (const c of companies) {
    if (c.status === 'TRIAL' && c.trialEndsAt) {
      const end = c.trialEndsAt.slice(0, 10); const days = daysBetween(today, end);
      const t = days >= 0 ? catchUpBefore(s.trialDays, days) : null;
      if (t !== null) out.push({ type: 'TRIAL_ENDING', companyId: c.id, invoiceId: null, days, threshold: t, dedupeKey: `TRIAL_ENDING:${c.id}:${end}:${t}` });
    }
  }
  for (const c of companies) {
    if (c.status === 'ACTIVE' && c.subscriptionEndsAt) {
      const end = c.subscriptionEndsAt.slice(0, 10); const days = daysBetween(today, end);
      const t = days >= 0 ? catchUpBefore(s.subscriptionDays, days) : null;
      if (t !== null) out.push({ type: 'SUBSCRIPTION_ENDING', companyId: c.id, invoiceId: null, days, threshold: t, dedupeKey: `SUBSCRIPTION_ENDING:${c.id}:${end}:${t}` });
    }
  }
  for (const i of invoices) {
    if (!isOutstanding(i)) continue;
    const days = daysBetween(i.dueDate.slice(0, 10), today);
    const t = days > 0 ? catchUpAfter(s.overdueInvoiceDays, days) : null;
    if (t !== null) out.push({ type: 'INVOICE_OVERDUE', companyId: i.companyId, invoiceId: i.id, days, threshold: t, dedupeKey: `INVOICE_OVERDUE:${i.id}:${t}` });
  }
  return out;
}
