/**
 * Demo billing service (docs/ADMIN_PORTAL.md v2): issue / pay / void invoices, invoice views and the reminder job.
 * All math comes from @/lib/billing so the demo matches the API's numbers exactly.
 */
import {
  addDays, computeInvoice, isOverdue, nextInvoiceNumber, nextPeriodStart, periodEnd, selectReminders, type Cycle,
} from '@/lib/billing';
import { riyadhDateTime, todayStr } from './dates';
import { nextId, type Company, type DB, type Invoice, type PaymentMethod } from './db';
import { badRequest, conflict, notFound } from './errors';
import { activeEmployeeCount, dayOf, daysLeft, effectivePrice, endOfDay, logEvent, type Actor } from './lifecycle';
import { ownerOf, sendEmail } from './mail';
import { nowIso, type Services } from './services';

export const PAYMENT_METHODS: PaymentMethod[] = ['BANK_TRANSFER', 'CARD', 'CASH', 'OTHER'];
export const ALREADY_PROCESSED = ['Invoice has already been processed', 'تمت معالجة هذه الفاتورة مسبقاً'] as const;

// ---------- views ----------
export function invoiceView(inv: Invoice, today = todayStr()) {
  const { updatedAt: _u, ...rest } = inv;
  return { ...rest, overdue: isOverdue(inv, today) };
}
export type InvoiceView = ReturnType<typeof invoiceView>;

export function invoiceDetail(db: DB, inv: Invoice) {
  const c = db.companies.find((x) => x.id === inv.companyId);
  const owner = ownerOf(db, inv.companyId);
  return {
    ...invoiceView(inv),
    company: c
      ? { id: c.id, nameAr: c.nameAr, nameEn: c.nameEn, crNumber: c.crNumber, vatNumber: c.vatNumber, city: c.city, ownerName: owner?.name ?? null, ownerEmail: owner?.email ?? null, ownerPhone: owner?.phone ?? null }
      : { id: inv.companyId, nameAr: inv.companyName, nameEn: null, crNumber: null, vatNumber: null, city: null, ownerName: null, ownerEmail: null, ownerPhone: null },
    seller: { ...db.settings.billing },
  };
}

/** Newest first: issue date, then number. */
export const byIssueDesc = (a: { issueDate: string; number: string }, b: { issueDate: string; number: string }) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number);

// ---------- issue ----------
export interface IssueInput { periodStart?: string; employees?: number; unitPrice?: number; billingCycle?: Cycle; notes?: string | null; sendEmail?: boolean }

export function issueInvoice(svc: Services, c: Company, input: IssueInput, actor: Actor, at: { today?: string; createdAt?: string } = {}): Invoice {
  const db = svc.db;
  if (c.status === 'PENDING') throw badRequest('Cannot invoice a pending company', 'لا يمكن إصدار فاتورة لمنشأة بانتظار الموافقة');
  const unitPrice = input.unitPrice ?? effectivePrice(db, c);
  if (unitPrice === null || unitPrice === undefined) throw badRequest('Set a price per employee for this company first', 'حدد سعر الموظف لهذه المنشأة أولاً');
  const today = at.today ?? todayStr();
  const own = db.invoices.filter((i) => i.companyId === c.id);
  const periodStart = input.periodStart ?? nextPeriodStart(own, today);
  const billingCycle = input.billingCycle ?? c.billingCycle;
  const employees = input.employees ?? Math.max(1, activeEmployeeCount(db, c.id));
  const amounts = computeInvoice({ employees, unitPrice, billingCycle, annualDiscount: db.settings.annualDiscount, vatRate: db.settings.billing.vatRate });
  const createdAt = at.createdAt ?? nowIso();
  const inv: Invoice = {
    id: nextId(db, 'inv'), number: nextInvoiceNumber(db.invoices.map((i) => i.number), Number(today.slice(0, 4))), companyId: c.id, companyName: c.nameAr,
    status: 'ISSUED', plan: c.plan, billingCycle, periodStart, periodEnd: periodEnd(periodStart, amounts.months), employees, unitPrice, ...amounts,
    issueDate: today, dueDate: addDays(today, db.settings.billing.invoiceDueDays), paidAt: null, paymentMethod: null, paymentRef: null,
    notes: input.notes?.trim() || null, voidReason: null, createdByName: actor.name, createdAt, updatedAt: createdAt,
  };
  db.invoices.push(inv);
  logEvent(svc, c, 'INVOICE_ISSUED', { from: c.status, to: c.status, actor, data: { invoiceId: inv.id, number: inv.number, total: inv.total }, createdAt });
  if (input.sendEmail !== false) sendEmail(svc, c, 'INVOICE_ISSUED', { invoice: inv }, { createdAt });
  svc.dirty = true;
  return inv;
}

// ---------- pay ----------
export function payInvoice(svc: Services, inv: Invoice, input: { paymentMethod: PaymentMethod; paymentRef?: string | null; paidAt?: string; extendSubscription?: boolean }, actor: Actor, createdAt = nowIso()): Invoice {
  const db = svc.db;
  if (inv.status !== 'ISSUED') throw conflict(...ALREADY_PROCESSED);
  const paidDay = input.paidAt ?? todayStr(new Date(createdAt));
  Object.assign(inv, {
    status: 'PAID', paymentMethod: input.paymentMethod, paymentRef: input.paymentRef?.trim() || null,
    paidAt: input.paidAt ? riyadhDateTime(paidDay, '12:00').toISOString() : createdAt, updatedAt: createdAt,
  });
  const c = db.companies.find((x) => x.id === inv.companyId);
  if (!c) return inv;
  const from = c.status;
  if (input.extendSubscription !== false) {
    const end = endOfDay(inv.periodEnd);
    if (!c.subscriptionEndsAt || c.subscriptionEndsAt < end) c.subscriptionEndsAt = end;
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

// ---------- void ----------
export function voidInvoice(svc: Services, inv: Invoice, reason: string, actor: Actor): Invoice {
  if (inv.status !== 'ISSUED') throw conflict(...ALREADY_PROCESSED);
  const now = nowIso();
  Object.assign(inv, { status: 'VOID', voidReason: reason, updatedAt: now });
  const c = svc.db.companies.find((x) => x.id === inv.companyId);
  if (c) logEvent(svc, c, 'INVOICE_VOIDED', { from: c.status, to: c.status, actor, data: { invoiceId: inv.id, number: inv.number, total: inv.total, reason } });
  svc.dirty = true;
  return inv;
}

// ---------- summary ----------
export function invoiceSummary(db: DB, today = todayStr()) {
  const agg = (rows: Invoice[]) => ({ count: rows.length, amount: Math.round(rows.reduce((s, i) => s + i.total, 0) * 100) / 100 });
  const issued = db.invoices.filter((i) => i.status === 'ISSUED');
  const month = today.slice(0, 7);
  return {
    outstanding: agg(issued),
    overdue: agg(issued.filter((i) => isOverdue(i, today))),
    paidThisMonth: agg(db.invoices.filter((i) => i.status === 'PAID' && !!i.paidAt && todayStr(new Date(i.paidAt)).slice(0, 7) === month)),
  };
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
