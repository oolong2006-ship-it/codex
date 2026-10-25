/**
 * Pure billing / reminder logic (docs/ADMIN_PORTAL.md v2) — no I/O, unit-tested in billing.math.spec.ts.
 * Calendar days are 'YYYY-MM-DD' strings in Asia/Riyadh.
 */
import { round2 } from '@taqam/core';
import { todayStr } from '../common/dates';

export type Cycle = 'MONTHLY' | 'ANNUAL';

export interface BillingSettings {
  sellerName: string;
  sellerNameEn: string;
  sellerVatNumber: string;
  sellerCrNumber: string;
  sellerAddress: string;
  sellerEmail: string;
  sellerPhone: string;
  vatRate: number;
  invoiceDueDays: number;
  bankName: string;
  iban: string;
}

export interface ReminderSettings {
  enabled: boolean;
  trialDays: number[];
  subscriptionDays: number[];
  notifyOnExpiry: boolean;
  overdueInvoiceDays: number[];
}

export const DEFAULT_BILLING: BillingSettings = {
  sellerName: 'شؤون لتقنية المعلومات',
  sellerNameEn: 'Shuoon IT',
  sellerVatNumber: '',
  sellerCrNumber: '',
  sellerAddress: 'الرياض، المملكة العربية السعودية',
  sellerEmail: 'hello@shuoon.net',
  sellerPhone: '+966 55 042 1235',
  vatRate: 0.15,
  invoiceDueDays: 7,
  bankName: '',
  iban: '',
};

export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: true,
  trialDays: [7, 3, 1],
  subscriptionDays: [14, 7, 1],
  notifyOnExpiry: true,
  overdueInvoiceDays: [1, 7],
};

const obj = (raw: unknown): Record<string, unknown> => (raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});
const isDayList = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => Number.isInteger(n));

/** Stored (partial) billing JSON → full settings with defaults filled; values of the wrong type are ignored. */
export function mergeBilling(raw: unknown): BillingSettings {
  const r = obj(raw);
  const out = { ...DEFAULT_BILLING };
  for (const k of Object.keys(DEFAULT_BILLING) as (keyof BillingSettings)[]) {
    const v = r[k];
    if (v !== undefined && typeof v === typeof DEFAULT_BILLING[k]) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Stored (partial) reminders JSON → full settings with defaults filled. */
export function mergeReminders(raw: unknown): ReminderSettings {
  const r = obj(raw);
  const out: ReminderSettings = { ...DEFAULT_REMINDERS, trialDays: [...DEFAULT_REMINDERS.trialDays], subscriptionDays: [...DEFAULT_REMINDERS.subscriptionDays], overdueInvoiceDays: [...DEFAULT_REMINDERS.overdueInvoiceDays] };
  if (typeof r.enabled === 'boolean') out.enabled = r.enabled;
  if (typeof r.notifyOnExpiry === 'boolean') out.notifyOnExpiry = r.notifyOnExpiry;
  if (isDayList(r.trialDays)) out.trialDays = r.trialDays;
  if (isDayList(r.subscriptionDays)) out.subscriptionDays = r.subscriptionDays;
  if (isDayList(r.overdueInvoiceDays)) out.overdueInvoiceDays = r.overdueInvoiceDays;
  return out;
}

/** Unique, descending day list (PATCH normalisation). */
export const normalizeDays = (days: number[]) => [...new Set(days)].sort((a, b) => b - a);

// ---------- invoice math ----------
export const cycleMonths = (cycle: Cycle) => (cycle === 'ANNUAL' ? 12 : 1);

export interface InvoiceAmounts {
  months: number;
  subtotal: number;
  discountRate: number;
  discount: number;
  taxable: number;
  vat: number;
  total: number;
}

/** round2 of a product after trimming binary noise (683.3 × 0.15 = 102.49499… → 102.495 → 102.5). */
const money = (n: number) => round2(Number(n.toPrecision(12)));

export function computeInvoice(i: { employees: number; unitPrice: number; billingCycle: Cycle; annualDiscount: number; vatRate: number }): InvoiceAmounts {
  const months = cycleMonths(i.billingCycle);
  const subtotal = money(i.employees * i.unitPrice * months);
  const discountRate = i.billingCycle === 'ANNUAL' ? i.annualDiscount : 0;
  const discount = money(subtotal * discountRate);
  const taxable = money(subtotal - discount);
  const vat = money(taxable * i.vatRate);
  const total = money(taxable + vat);
  return { months, subtotal, discountRate, discount, taxable, vat, total };
}

/** `SH-<year>-<4-digit seq>`: one more than the highest sequence already used in that year. */
export function nextInvoiceNumber(year: number, existing: string[]): string {
  const prefix = `SH-${year}-`;
  let max = 0;
  for (const n of existing) {
    if (!n.startsWith(prefix)) continue;
    const seq = Number(n.slice(prefix.length));
    if (Number.isInteger(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

// ---------- calendar ----------
const utc = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00.000Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function addDaysStr(d: string, n: number): string {
  const x = utc(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmt(x);
}

/** Same day-of-month `n` months later, clamped to the length of the target month (Jan 31 + 1 → Feb 28). */
export function addMonthsClamped(d: string, n: number): string {
  const [y, m, dd] = d.slice(0, 10).split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(dd, lastDay));
  return fmt(target);
}

/** periodEnd = periodStart + months − 1 day. */
export const periodEndOf = (periodStart: string, months: number) => addDaysStr(addMonthsClamped(periodStart, months), -1);

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string) => Math.round((utc(to).getTime() - utc(from).getTime()) / 86400000);

// ---------- reminders ----------
export type ReminderType = 'TRIAL_ENDING' | 'SUBSCRIPTION_ENDING' | 'EXPIRED' | 'INVOICE_OVERDUE';

export type DedupeInput =
  | { type: 'TRIAL_ENDING' | 'SUBSCRIPTION_ENDING'; companyId: string; endDay: string; daysLeft: number }
  | { type: 'EXPIRED'; companyId: string; endDay: string }
  | { type: 'INVOICE_OVERDUE'; invoiceId: string; daysOverdue: number };

export function dedupeKey(k: DedupeInput): string {
  switch (k.type) {
    case 'TRIAL_ENDING':
    case 'SUBSCRIPTION_ENDING':
      return `${k.type}:${k.companyId}:${k.endDay}:${k.daysLeft}`;
    case 'EXPIRED':
      return `EXPIRED:${k.companyId}:${k.endDay}`;
    case 'INVOICE_OVERDUE':
      return `INVOICE_OVERDUE:${k.invoiceId}:${k.daysOverdue}`;
  }
}

export type DueReminder =
  | { type: 'TRIAL_ENDING' | 'SUBSCRIPTION_ENDING'; companyId: string; daysLeft: number; endDay: string; dedupeKey: string }
  | { type: 'INVOICE_OVERDUE'; companyId: string; invoiceId: string; daysOverdue: number; dedupeKey: string };

export interface ReminderCompany {
  id: string;
  status: string;
  trialEndsAt: Date | null;
  subscriptionEndsAt: Date | null;
}
export interface ReminderInvoice {
  id: string;
  companyId: string;
  /** YYYY-MM-DD */
  dueDate: string;
}

/**
 * Which automatic reminders are due at `now`: TRIAL companies whose daysLeft ∈ trialDays, ACTIVE companies
 * (with an end date) whose daysLeft ∈ subscriptionDays, and ISSUED invoices whose days overdue ∈ overdueInvoiceDays.
 * Ends already in the past are skipped (those companies are expired, not reminded).
 */
export function selectReminders(i: { companies: ReminderCompany[]; invoices: ReminderInvoice[]; settings: ReminderSettings; now?: Date }): DueReminder[] {
  const { settings: s } = i;
  if (!s.enabled) return [];
  const now = i.now ?? new Date();
  const today = todayStr(now);
  const out: DueReminder[] = [];
  const phases: { status: string; field: 'trialEndsAt' | 'subscriptionEndsAt'; type: 'TRIAL_ENDING' | 'SUBSCRIPTION_ENDING'; days: number[] }[] = [
    { status: 'TRIAL', field: 'trialEndsAt', type: 'TRIAL_ENDING', days: s.trialDays },
    { status: 'ACTIVE', field: 'subscriptionEndsAt', type: 'SUBSCRIPTION_ENDING', days: s.subscriptionDays },
  ];
  for (const p of phases) {
    for (const c of i.companies) {
      const end = c[p.field];
      if (c.status !== p.status || !end || end <= now) continue;
      const endDay = todayStr(end);
      const daysLeft = daysBetween(today, endDay);
      if (!p.days.includes(daysLeft)) continue;
      out.push({ type: p.type, companyId: c.id, daysLeft, endDay, dedupeKey: dedupeKey({ type: p.type, companyId: c.id, endDay, daysLeft }) });
    }
  }
  for (const inv of i.invoices) {
    const daysOverdue = daysBetween(inv.dueDate, today);
    if (daysOverdue < 1 || !s.overdueInvoiceDays.includes(daysOverdue)) continue;
    out.push({ type: 'INVOICE_OVERDUE', companyId: inv.companyId, invoiceId: inv.id, daysOverdue, dedupeKey: dedupeKey({ type: 'INVOICE_OVERDUE', invoiceId: inv.id, daysOverdue }) });
  }
  return out;
}
