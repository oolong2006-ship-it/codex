/**
 * Pure billing helpers (docs/ADMIN_PORTAL.md "v2 — Billing & subscription reminders"): invoice math, invoice numbers,
 * billing periods, overdue status, settings validation and reminder selection. Shared by the in-browser demo API and
 * the admin UI (live preview). No I/O, no clock: every function takes "today" as a 'YYYY-MM-DD' Riyadh day.
 */
import { round2 } from '@taqam/core';

export { round2 };
/** Money rounding as the API does it: clean float noise to 12 significant digits, then round2 (683.3 × 0.15 → 102.5). */
export const money2 = (n: number) => round2(Number.isFinite(n) ? Number(n.toPrecision(12)) : 0);

export type InvoiceStatus = 'ISSUED' | 'PAID' | 'VOID';
export type Cycle = 'MONTHLY' | 'ANNUAL';
export type ReminderType = 'TRIAL_ENDING' | 'SUBSCRIPTION_ENDING' | 'INVOICE_OVERDUE';

export interface BillingSettings {
  sellerName: string; sellerNameEn: string; sellerVatNumber: string; sellerCrNumber: string; sellerAddress: string;
  sellerEmail: string; sellerPhone: string; vatRate: number; invoiceDueDays: number; bankName: string; iban: string;
}
export interface ReminderSettings {
  enabled: boolean; trialDays: number[]; subscriptionDays: number[]; notifyOnExpiry: boolean; overdueInvoiceDays: number[];
}

export const DEFAULT_BILLING: BillingSettings = {
  sellerName: 'شؤون لتقنية المعلومات', sellerNameEn: 'Shuoon IT', sellerVatNumber: '', sellerCrNumber: '',
  sellerAddress: 'الرياض، المملكة العربية السعودية', sellerEmail: 'hello@shuoon.net', sellerPhone: '+966 55 042 1235',
  vatRate: 0.15, invoiceDueDays: 7, bankName: '', iban: '',
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
/** Last day of a billing period: periodStart + months − 1 day. */
export function periodEnd(periodStart: string, months: number): string {
  return addDays(addMonthsClamped(periodStart, months), -1);
}
/** Default start of the next invoice: the day after the latest non-void invoice's periodEnd, else today. */
export function nextPeriodStart(invoices: { status: InvoiceStatus; periodEnd: string }[], today: string): string {
  const ends = invoices.filter((i) => i.status !== 'VOID').map((i) => i.periodEnd.slice(0, 10)).sort();
  return ends.length ? addDays(ends[ends.length - 1], 1) : today;
}

// ---------- math ----------
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
export const formatInvoiceNumber = (year: number, seq: number) => `SH-${year}-${String(seq).padStart(4, '0')}`;
export function nextInvoiceNumber(existing: string[], year: number): string {
  const prefix = `SH-${year}-`;
  const max = existing.filter((n) => n.startsWith(prefix)).reduce((m, n) => Math.max(m, Number(n.slice(prefix.length)) || 0), 0);
  return formatInvoiceNumber(year, max + 1);
}

// ---------- status ----------
export const isOverdue = (inv: { status: InvoiceStatus; dueDate: string }, today: string) => inv.status === 'ISSUED' && inv.dueDate.slice(0, 10) < today;

// ---------- settings validation ----------
const STRING_KEYS: (keyof BillingSettings)[] = ['sellerName', 'sellerNameEn', 'sellerVatNumber', 'sellerCrNumber', 'sellerAddress', 'sellerEmail', 'sellerPhone', 'bankName', 'iban'];
/** null when a (partial) billing patch is valid, otherwise a class-validator style message. */
export function billingSettingsError(patch: object): string | null {
  const p = patch as Record<string, unknown>;
  for (const k of STRING_KEYS) if (p[k] !== undefined && typeof p[k] !== 'string') return `billing.${k} must be a string`;
  if (p.vatRate !== undefined && (typeof p.vatRate !== 'number' || !Number.isFinite(p.vatRate) || p.vatRate < 0 || p.vatRate > 1)) return 'billing.vatRate must be between 0 and 1';
  if (p.invoiceDueDays !== undefined && (typeof p.invoiceDueDays !== 'number' || !Number.isInteger(p.invoiceDueDays) || p.invoiceDueDays < 0 || p.invoiceDueDays > 90)) return 'billing.invoiceDueDays must be an integer between 0 and 90';
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
export interface ReminderInvoice { id: string; companyId: string; status: InvoiceStatus; dueDate: string }
export interface ReminderCandidate { type: ReminderType; companyId: string; invoiceId: string | null; days: number; dedupeKey: string }

export const expiredDedupeKey = (companyId: string, endDay: string) => `EXPIRED:${companyId}:${endDay}`;

/**
 * Automatic reminders due today. Company end dates are Riyadh calendar days ('YYYY-MM-DD').
 * Order: trials, subscriptions (company order), then overdue invoices (invoice order).
 */
export function selectReminders(companies: ReminderCompany[], invoices: ReminderInvoice[], s: ReminderSettings, today: string): ReminderCandidate[] {
  if (!s.enabled) return [];
  const out: ReminderCandidate[] = [];
  for (const c of companies) {
    if (c.status === 'TRIAL' && c.trialEndsAt) {
      const end = c.trialEndsAt.slice(0, 10); const days = daysBetween(today, end);
      if (days >= 0 && s.trialDays.includes(days)) out.push({ type: 'TRIAL_ENDING', companyId: c.id, invoiceId: null, days, dedupeKey: `TRIAL_ENDING:${c.id}:${end}:${days}` });
    }
  }
  for (const c of companies) {
    if (c.status === 'ACTIVE' && c.subscriptionEndsAt) {
      const end = c.subscriptionEndsAt.slice(0, 10); const days = daysBetween(today, end);
      if (days >= 0 && s.subscriptionDays.includes(days)) out.push({ type: 'SUBSCRIPTION_ENDING', companyId: c.id, invoiceId: null, days, dedupeKey: `SUBSCRIPTION_ENDING:${c.id}:${end}:${days}` });
    }
  }
  for (const i of invoices) {
    if (i.status !== 'ISSUED') continue;
    const days = daysBetween(i.dueDate.slice(0, 10), today);
    if (days > 0 && s.overdueInvoiceDays.includes(days)) out.push({ type: 'INVOICE_OVERDUE', companyId: i.companyId, invoiceId: i.id, days, dedupeKey: `INVOICE_OVERDUE:${i.id}:${days}` });
  }
  return out;
}
