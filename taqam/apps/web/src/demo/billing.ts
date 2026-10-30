/**
 * Demo billing service (docs/ADMIN_PORTAL.md v2 + v2.1): issue / pay / credit invoices, invoice views and the reminder
 * job. All math comes from @/lib/billing so the demo matches the API's numbers exactly. Issued documents are never
 * edited or deleted: a credit note (SHC- series) reverses an invoice, and views render from the seller/buyer snapshots.
 */
import {
  LIMITS, addDays, computeInvoice, periodAnchor, coversPeriod, defaultBilledEmployees, isOutstanding, isOverdue, nextPeriodStart, periodEnd, periodStartInWindow,
  periodsOverlap, selectReminders, takeDocNumber, vatGate, zatcaTlv, type BillingSettings, type Cycle,
} from '@/lib/billing';
import { riyadhDateTime, todayStr } from './dates';
import { nextId, type BuyerSnapshot, type Company, type DB, type Invoice, type PaymentMethod, type SellerSnapshot } from './db';
import { badRequest, conflict, notFound } from './errors';
import { activeEmployeeCount, dayOf, daysLeft, effectivePrice, endOfDay, logEvent, type Actor } from './lifecycle';
import { ownerOf, sendEmail } from './mail';
import { nowIso, type Services } from './services';

export const PAYMENT_METHODS: PaymentMethod[] = ['BANK_TRANSFER', 'CARD', 'CASH', 'OTHER'];
export const ALREADY_PROCESSED = ['Invoice has already been processed', 'تمت معالجة هذه الفاتورة مسبقاً'] as const;
export const PERIOD_TAKEN = ['An invoice already covers this period', 'توجد فاتورة تغطي هذه الفترة'] as const;
export const PERIOD_ENDED = ['The invoice period has already ended; issue an invoice for a current period', 'فترة هذه الفاتورة انتهت؛ أصدر فاتورة لفترة حالية'] as const;

// ---------- snapshots ----------
export function sellerSnapshot(b: BillingSettings): SellerSnapshot {
  return {
    name: b.sellerName, nameEn: b.sellerNameEn, vatNumber: (b.sellerVatNumber ?? '').trim(), crNumber: b.sellerCrNumber, address: b.sellerAddress,
    email: b.sellerEmail, phone: b.sellerPhone, bankName: b.bankName, iban: b.iban,
  };
}
export function buyerSnapshot(c: Company): BuyerSnapshot {
  return { nameAr: c.nameAr, nameEn: c.nameEn, vatNumber: c.vatNumber, crNumber: c.crNumber, address: null, city: c.city };
}
/** Phase-1 QR for a tax document (null when the seller was not VAT registered at issue). */
function qrFor(inv: Pick<Invoice, 'seller' | 'issuedAt' | 'total' | 'vat'>, isTax: boolean): string | null {
  return isTax ? zatcaTlv({ sellerName: inv.seller.name, vatNumber: inv.seller.vatNumber, timestamp: inv.issuedAt, total: inv.total, vat: inv.vat }) : null;
}

// ---------- views ----------
export function invoiceView(inv: Invoice, today = todayStr()) {
  const { updatedAt: _u, ...rest } = inv;
  return { ...rest, overdue: isOverdue(inv, today) };
}
export type InvoiceView = ReturnType<typeof invoiceView>;

/** Detail: the document (seller/buyer snapshots on the row) + the live company for links and contact. */
export function invoiceDetail(db: DB, inv: Invoice) {
  const c = db.companies.find((x) => x.id === inv.companyId);
  const owner = ownerOf(db, inv.companyId);
  return {
    ...invoiceView(inv),
    company: c
      ? { id: c.id, nameAr: c.nameAr, nameEn: c.nameEn, crNumber: c.crNumber, vatNumber: c.vatNumber, city: c.city, ownerName: owner?.name ?? null, ownerEmail: owner?.email ?? null, ownerPhone: owner?.phone ?? null }
      : { id: inv.companyId, nameAr: inv.companyName, nameEn: null, crNumber: null, vatNumber: null, city: null, ownerName: null, ownerEmail: null, ownerPhone: null },
  };
}

/** Newest first: issue instant, then number. */
export const byIssueDesc = (a: { issueDate: string; issuedAt?: string; number: string }, b: { issueDate: string; issuedAt?: string; number: string }) =>
  (b.issuedAt ?? b.issueDate).localeCompare(a.issuedAt ?? a.issueDate) || b.number.localeCompare(a.number);

// ---------- issue ----------
export interface IssueInput { periodStart?: string; employees?: number; unitPrice?: number; billingCycle?: Cycle; notes?: string | null; sendEmail?: boolean }

export function issueInvoice(svc: Services, c: Company, input: IssueInput, actor: Actor, at: { today?: string; createdAt?: string } = {}): Invoice {
  const db = svc.db;
  if (c.status === 'PENDING') throw badRequest('Cannot invoice a pending company', 'لا يمكن إصدار فاتورة لمنشأة بانتظار الموافقة');
  const unitPrice = input.unitPrice ?? effectivePrice(db, c);
  if (unitPrice === null || unitPrice === undefined) throw badRequest('Set a price per employee for this company first', 'حدد سعر الموظف لهذه المنشأة أولاً');
  const createdAt = at.createdAt ?? nowIso();
  const today = at.today ?? todayStr(new Date(createdAt));
  const own = db.invoices.filter((i) => i.companyId === c.id);
  if (input.periodStart !== undefined && !periodStartInWindow(input.periodStart, today)) {
    throw badRequest('periodStart must be between 60 days ago and 90 days ahead', 'بداية الفترة يجب أن تكون بين 60 يوماً مضت و90 يوماً قادمة');
  }
  const periodStart = input.periodStart ?? nextPeriodStart(own, today, { expired: c.status === 'EXPIRED' });
  const billingCycle = input.billingCycle ?? c.billingCycle;
  const billing = db.settings.billing;
  const employees = input.employees ?? defaultBilledEmployees(c.plan, activeEmployeeCount(db, c.id), billing.minBilledEmployees ?? 10);
  const gate = vatGate(billing);
  const amounts = computeInvoice({ employees, unitPrice, billingCycle, annualDiscount: db.settings.annualDiscount, vatRate: gate.vatRate });
  if (amounts.total > LIMITS.total) throw badRequest('Invoice total is too large', 'إجمالي الفاتورة يتجاوز الحد المسموح');
  const period = { periodStart, periodEnd: periodEnd(periodStart, amounts.months, periodAnchor(own, periodStart)) };
  if (own.some((i) => coversPeriod(i) && periodsOverlap(i, period))) throw conflict(...PERIOD_TAKEN);
  db.counters ??= {};
  const seller = sellerSnapshot(billing);
  const inv: Invoice = {
    id: nextId(db, 'inv'), number: takeDocNumber(db.counters, 'SH', Number(today.slice(0, 4))), documentType: gate.documentType, companyId: c.id, companyName: c.nameAr,
    status: 'ISSUED', plan: c.plan, billingCycle, ...period, employees, unitPrice, ...amounts,
    issueDate: today, issuedAt: createdAt, dueDate: addDays(today, billing.invoiceDueDays), paidAt: null, paymentMethod: null, paymentRef: null,
    notes: input.notes?.trim() || null, seller, buyer: buyerSnapshot(c),
    creditsInvoiceId: null, creditsNumber: null, creditedByNumber: null, reason: null, qr: null,
    createdByName: actor.name, createdAt, updatedAt: createdAt,
  };
  inv.qr = qrFor(inv, gate.documentType === 'TAX_INVOICE');
  db.invoices.push(inv);
  logEvent(svc, c, 'INVOICE_ISSUED', { from: c.status, to: c.status, actor, data: { invoiceId: inv.id, number: inv.number, total: inv.total }, createdAt });
  if (input.sendEmail !== false) sendEmail(svc, c, 'INVOICE_ISSUED', { invoice: inv }, { createdAt });
  svc.dirty = true;
  return inv;
}

// ---------- pay ----------
export function payInvoice(svc: Services, inv: Invoice, input: { paymentMethod: PaymentMethod; paymentRef?: string | null; paidAt?: string; extendSubscription?: boolean }, actor: Actor, createdAt = nowIso()): Invoice {
  const db = svc.db;
  if (inv.documentType === 'CREDIT_NOTE') throw badRequest('A credit note cannot be paid', 'لا يمكن تسجيل دفعة على إشعار دائن');
  if (inv.status !== 'ISSUED') throw conflict(...ALREADY_PROCESSED);
  const nowDay = todayStr(new Date(createdAt));
  const paidDay = input.paidAt ?? nowDay;
  if (paidDay > nowDay) throw badRequest('paidAt cannot be in the future', 'تاريخ الدفع لا يمكن أن يكون في المستقبل');
  if (paidDay < inv.issueDate) throw badRequest('paidAt cannot be before the issue date', 'تاريخ الدفع لا يمكن أن يسبق تاريخ إصدار الفاتورة');
  const c = db.companies.find((x) => x.id === inv.companyId);
  const extend = input.extendSubscription !== false && !!c;
  let newEnd: string | null = null;
  if (extend && c) {
    const end = endOfDay(inv.periodEnd);
    newEnd = !c.subscriptionEndsAt || c.subscriptionEndsAt < end ? end : c.subscriptionEndsAt;
    if ((c.status === 'TRIAL' || c.status === 'EXPIRED') && new Date(newEnd).getTime() <= new Date(createdAt).getTime()) throw badRequest(...PERIOD_ENDED);
  }
  Object.assign(inv, {
    status: 'PAID', paymentMethod: input.paymentMethod, paymentRef: input.paymentRef?.trim() || null,
    paidAt: input.paidAt ? riyadhDateTime(paidDay, '12:00').toISOString() : createdAt, updatedAt: createdAt,
  });
  if (!c) return inv;
  const from = c.status;
  if (extend && newEnd) {
    c.subscriptionEndsAt = newEnd;
    if (c.status === 'TRIAL' || c.status === 'EXPIRED') {
      c.status = 'ACTIVE';
      c.trialEndsAt = null;
      c.activatedAt = c.activatedAt ?? createdAt;
    }
    c.updatedAt = createdAt;
  }
  logEvent(svc, c, 'INVOICE_PAID', { from, to: c.status, actor, data: { invoiceId: inv.id, number: inv.number, total: inv.total, paymentMethod: inv.paymentMethod }, createdAt });
  sendEmail(svc, c, 'PAYMENT_RECEIVED', { invoice: inv, endDay: c.subscriptionEndsAt ? dayOf(c.subscriptionEndsAt) : null }, { createdAt });
  svc.dirty = true;
  return inv;
}

// ---------- credit note ----------
/**
 * Credits an ISSUED or PAID invoice: creates a credit note (SHC-<year>-<seq>) with the same snapshots, lines, period
 * and amounts, and marks the original CREDITED (with creditedByNumber and the same reason). The subscription is not changed and no email is sent.
 * Returns the credit note.
 */
export function creditInvoice(svc: Services, inv: Invoice, reason: string, actor: Actor, createdAt = nowIso()): Invoice {
  const db = svc.db;
  if (inv.documentType === 'CREDIT_NOTE') throw badRequest('A credit note cannot be credited', 'لا يمكن إصدار إشعار دائن لإشعار دائن');
  if ((inv.status !== 'ISSUED' && inv.status !== 'PAID') || inv.creditedByNumber) throw conflict(...ALREADY_PROCESSED);
  const today = todayStr(new Date(createdAt));
  db.counters ??= {};
  const cn: Invoice = {
    ...inv, id: nextId(db, 'inv'), number: takeDocNumber(db.counters, 'SHC', Number(today.slice(0, 4))), documentType: 'CREDIT_NOTE', status: 'ISSUED',
    issueDate: today, issuedAt: createdAt, dueDate: today, paidAt: null, paymentMethod: null, paymentRef: null, notes: null,
    creditsInvoiceId: inv.id, creditsNumber: inv.number, creditedByNumber: null, reason, qr: null,
    createdByName: actor.name, createdAt, updatedAt: createdAt,
  };
  cn.qr = qrFor(cn, inv.documentType === 'TAX_INVOICE');
  db.invoices.push(cn);
  Object.assign(inv, { status: 'CREDITED', creditedByNumber: cn.number, reason, updatedAt: createdAt });
  const c = db.companies.find((x) => x.id === inv.companyId);
  if (c) logEvent(svc, c, 'INVOICE_CREDITED', { from: c.status, to: c.status, actor, data: { invoiceId: inv.id, number: inv.number, creditNoteId: cn.id, creditNoteNumber: cn.number, total: inv.total, reason }, createdAt });
  svc.dirty = true;
  return cn;
}

// ---------- summary ----------
export function invoiceSummary(db: DB, today = todayStr()) {
  const agg = (rows: Invoice[]) => ({ count: rows.length, amount: Math.round(rows.reduce((s, i) => s + i.total, 0) * 100) / 100 });
  const open = db.invoices.filter(isOutstanding);
  const month = today.slice(0, 7);
  return {
    outstanding: agg(open),
    overdue: agg(open.filter((i) => isOverdue(i, today))),
    paidThisMonth: agg(db.invoices.filter((i) => i.status === 'PAID' && !!i.paidAt && todayStr(new Date(i.paidAt)).slice(0, 7) === month && todayStr(new Date(i.paidAt)) <= today)),
  };
}
/** Outstanding / overdue of one company (owner billing card). */
export function companyDue(db: DB, companyId: string, today = todayStr()) {
  const agg = (rows: Invoice[]) => ({ count: rows.length, amount: Math.round(rows.reduce((s, i) => s + i.total, 0) * 100) / 100 });
  const open = db.invoices.filter((i) => i.companyId === companyId && isOutstanding(i));
  return { outstanding: agg(open), overdue: agg(open.filter((i) => isOverdue(i, today))) };
}

// ---------- reminder job ----------
/** Runs the automatic reminders for today (deduped). Returns the number of emails logged. */
export function runReminders(svc: Services, now = new Date()): number {
  const db = svc.db;
  const today = todayStr(now);
  const companies = db.companies.map((c) => ({
    id: c.id, status: c.status, trialEndsAt: c.trialEndsAt ? dayOf(c.trialEndsAt) : null, subscriptionEndsAt: c.subscriptionEndsAt ? dayOf(c.subscriptionEndsAt) : null,
  }));
  let sent = 0;
  for (const r of selectReminders(companies, db.invoices, db.settings.reminders, today)) {
    const c = db.companies.find((x) => x.id === r.companyId);
    if (!c) continue;
    const inv = r.invoiceId ? db.invoices.find((i) => i.id === r.invoiceId) : undefined;
    const endDay = r.type === 'TRIAL_ENDING' ? companies.find((x) => x.id === c.id)!.trialEndsAt : r.type === 'SUBSCRIPTION_ENDING' ? companies.find((x) => x.id === c.id)!.subscriptionEndsAt : null;
    const log = sendEmail(svc, c, r.type, r.type === 'INVOICE_OVERDUE' ? { invoice: inv, daysOverdue: r.days } : { daysLeft: r.days, endDay }, { dedupeKey: r.dedupeKey, createdAt: now.toISOString() });
    if (!log) continue;
    sent++;
    const data = r.type === 'INVOICE_OVERDUE' ? { type: r.type, daysOverdue: r.days, invoiceId: inv?.id ?? r.invoiceId, number: inv?.number ?? null } : { type: r.type, daysLeft: r.days };
    logEvent(svc, c, 'REMINDER_SENT', { from: c.status, to: c.status, data, createdAt: now.toISOString() });
  }
  return sent;
}
/** Lazily runs the reminder job once per demo day (called when /admin/overview loads). */
export function runRemindersDaily(svc: Services, now = new Date()) {
  const today = todayStr(now);
  if (svc.db.remindersRunOn === today) return 0;
  svc.db.remindersRunOn = today;
  svc.dirty = true;
  return runReminders(svc, now);
}

/** Manual reminder (`MANUAL_REMINDER`) to the owner. */
export function manualReminder(svc: Services, c: Company, message: string | null, actor: Actor) {
  const left = daysLeft(c);
  const log = sendEmail(svc, c, 'MANUAL_REMINDER', { message, daysLeft: left ?? undefined });
  if (!log) throw notFound('Owner', 'لا يوجد مالك لهذه المنشأة');
  logEvent(svc, c, 'REMINDER_SENT', { from: c.status, to: c.status, actor, data: { type: 'MANUAL_REMINDER', daysLeft: left, emailId: log.id, status: log.status } });
  return log;
}
