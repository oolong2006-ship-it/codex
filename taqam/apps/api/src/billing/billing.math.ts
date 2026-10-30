/**
 * Pure billing / reminder logic (docs/ADMIN_PORTAL.md v2 + v2.1) — no I/O, unit-tested in billing.math.spec.ts.
 * Calendar days are 'YYYY-MM-DD' strings in Asia/Riyadh.
 */
import { round2 } from '@taqam/core';
import type { Company } from '@prisma/client';
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
  /** v2.1: default billed seats for ESSENTIALS / GROWTH = max(minBilledEmployees, active employees) */
  minBilledEmployees: number;
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
  minBilledEmployees: 10,
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

// ---------- document snapshots (v2.1) ----------
/** Seller as printed on an issued document (snapshot of the billing settings at issue). */
export interface SellerSnapshot {
  name: string;
  nameEn: string;
  vatNumber: string;
  crNumber: string;
  address: string;
  email: string;
  phone: string;
  bankName: string;
  iban: string;
}

/** Buyer as printed on an issued document (snapshot of the company at issue). */
export interface BuyerSnapshot {
  nameAr: string;
  nameEn: string | null;
  vatNumber: string | null;
  crNumber: string | null;
  address: string | null;
  city: string | null;
}

export const sellerSnapshot = (b: BillingSettings): SellerSnapshot => ({
  name: b.sellerName,
  nameEn: b.sellerNameEn,
  vatNumber: b.sellerVatNumber,
  crNumber: b.sellerCrNumber,
  address: b.sellerAddress,
  email: b.sellerEmail,
  phone: b.sellerPhone,
  bankName: b.bankName,
  iban: b.iban,
});

export const buyerSnapshot = (c: Pick<Company, 'nameAr' | 'nameEn' | 'vatNumber' | 'crNumber' | 'city'>): BuyerSnapshot => ({
  nameAr: c.nameAr,
  nameEn: c.nameEn ?? null,
  vatNumber: c.vatNumber ?? null,
  crNumber: c.crNumber ?? null,
  address: null, // the company profile has no street address yet
  city: c.city ?? null,
});

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

const daysInMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/**
 * periodEnd of a period of `months` months starting at `periodStart`, anchored on `anchorDay` (default: the start's
 * day of month). The period ends the day before the anchor day of the target month; when the target month is too
 * short for the anchor (a clamped month) it ends on that month's last day and the next period starts on the 1st.
 * A start before the anchor day (the 1st after a clamped month) reaches the anchor one month sooner.
 * Jan 31 → Feb 28; (anchor 31) Mar 1 → Mar 30; Mar 31 → Apr 30; Jan 15 → Feb 14; Jan 1 → Jan 31.
 */
export function periodEndOf(periodStart: string, months: number, anchorDay?: number | null): string {
  const [y, m, d] = periodStart.slice(0, 10).split('-').map(Number);
  const anchor = anchorDay && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : d;
  const offset = d >= anchor ? months : months - 1;
  const t = new Date(Date.UTC(y, m - 1 + offset, 1));
  const ty = t.getUTCFullYear();
  const tm = t.getUTCMonth();
  const last = daysInMonth(ty, tm);
  if (anchor > last) return fmt(new Date(Date.UTC(ty, tm, last)));
  return addDaysStr(fmt(new Date(Date.UTC(ty, tm, anchor))), -1);
}

/** Anchor day of a new period: carried over when it directly continues the previous one, else the start's day. */
export function anchorDayFor(periodStart: string, prev: { periodEnd: string; anchorDay: number | null } | null): number {
  const startDay = Number(periodStart.slice(8, 10));
  if (prev && addDaysStr(prev.periodEnd, 1) === periodStart.slice(0, 10)) return prev.anchorDay ?? Number(addDaysStr(prev.periodEnd, 1).slice(8, 10));
  return startDay;
}

// ---------- tax invoice (ZATCA) ----------
/** Saudi VAT registration number (TRN): 15 digits, starting and ending with 3. */
export const isValidTrn = (v: string | null | undefined) => typeof v === 'string' && /^3\d{13}3$/.test(v);

/** Decimal(12,2) ceiling for invoice amounts. */
export const MAX_INVOICE_TOTAL = 9999999999.99;

function tlv(tag: number, value: string): Buffer {
  let bytes = Buffer.from(value, 'utf8');
  if (bytes.length > 255) {
    // truncate on a character boundary
    let s = value;
    while (Buffer.byteLength(s, 'utf8') > 255) s = s.slice(0, -1);
    bytes = Buffer.from(s, 'utf8');
  }
  return Buffer.concat([Buffer.from([tag, bytes.length]), bytes]);
}

/** ZATCA Phase-1 QR payload: base64 of TLV tags 1 seller name, 2 VAT number, 3 timestamp, 4 total incl. VAT, 5 VAT. */
export function zatcaQr(i: { sellerName: string; vatNumber: string; timestamp: Date; total: number; vat: number }): string {
  const ts = i.timestamp.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return Buffer.concat([tlv(1, i.sellerName), tlv(2, i.vatNumber), tlv(3, ts), tlv(4, i.total.toFixed(2)), tlv(5, i.vat.toFixed(2))]).toString('base64');
}

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
  | { type: 'TRIAL_ENDING' | 'SUBSCRIPTION_ENDING'; companyId: string; daysLeft: number; threshold: number; endDay: string; dedupeKey: string }
  | { type: 'INVOICE_OVERDUE'; companyId: string; invoiceId: string; daysOverdue: number; threshold: number; dedupeKey: string };

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
 * Which automatic reminders are due at `now` (v2.1 catch-up): TRIAL companies (trialDays) and ACTIVE companies with
 * an end date (subscriptionDays) get the smallest configured threshold ≥ daysLeft; ISSUED invoices get the largest
 * overdueInvoiceDays threshold ≤ days overdue. The dedupe key carries the threshold, so a missed run is caught up
 * once and a threshold is never sent twice for the same end day. Ends already in the past are skipped (expired).
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
      const above = p.days.filter((d) => d >= daysLeft);
      if (!above.length) continue;
      const threshold = Math.min(...above);
      out.push({ type: p.type, companyId: c.id, daysLeft, threshold, endDay, dedupeKey: dedupeKey({ type: p.type, companyId: c.id, endDay, daysLeft: threshold }) });
    }
  }
  for (const inv of i.invoices) {
    const daysOverdue = daysBetween(inv.dueDate, today);
    if (daysOverdue < 1) continue;
    const below = s.overdueInvoiceDays.filter((d) => d >= 1 && d <= daysOverdue);
    if (!below.length) continue;
    const threshold = Math.max(...below);
    out.push({ type: 'INVOICE_OVERDUE', companyId: inv.companyId, invoiceId: inv.id, daysOverdue, threshold, dedupeKey: dedupeKey({ type: 'INVOICE_OVERDUE', invoiceId: inv.id, daysOverdue: threshold }) });
  }
  return out;
}
