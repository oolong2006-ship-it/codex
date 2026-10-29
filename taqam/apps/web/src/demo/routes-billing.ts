/** Demo API — invoices, outbox and reminders (docs/ADMIN_PORTAL.md v2). Admin routes are SUPER_ADMIN only; /billing/* is OWNER only. */
import { DATE_RE, byCreatedDesc, paginate, route, v, type Route } from './router';
import type { Company, DB, EmailType, Role } from './db';
import { badRequest, notFound } from './errors';
import {
  PAYMENT_METHODS, byIssueDesc, invoiceDetail, invoiceSummary, invoiceView, issueInvoice, manualReminder, payInvoice, runReminders, voidInvoice,
} from './billing';
import { BILLING_CYCLES, activeEmployeeCount, adminCompanyView } from './lifecycle';
import { emailView } from './mail';
import type { AuthUser } from './services';
import { todayStr } from './dates';

const SA: Role[] = ['SUPER_ADMIN'];
const OWNER: Role[] = ['OWNER'];
const actor = (u: AuthUser) => ({ id: u.id, name: u.name });
export const EMAIL_TYPES: EmailType[] = ['TRIAL_ENDING', 'SUBSCRIPTION_ENDING', 'EXPIRED', 'INVOICE_ISSUED', 'PAYMENT_RECEIVED', 'INVOICE_OVERDUE', 'MANUAL_REMINDER'];
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function findCompany(db: DB, id: string): Company {
  const c = db.companies.find((x) => x.id === id);
  if (!c) throw notFound('Company', 'المنشأة غير موجودة');
  return c;
}
function findInvoice(db: DB, id: string, companyId?: string) {
  const inv = db.invoices.find((i) => i.id === id && (!companyId || i.companyId === companyId));
  if (!inv) throw notFound('Invoice', 'الفاتورة غير موجودة');
  return inv;
}
function bool(b: Record<string, unknown>, k: string): boolean | undefined {
  if (b[k] === undefined || b[k] === null) return undefined;
  if (typeof b[k] !== 'boolean') throw badRequest(`${k} must be a boolean value`);
  return b[k] as boolean;
}
function intIn(b: Record<string, unknown>, k: string, min: number, max: number): number | undefined {
  const n = v.num(b, k, { min, max, optional: true });
  if (n !== undefined && !Number.isInteger(n)) throw badRequest(`${k} must be an integer number`);
  return n;
}
function day(b: Record<string, unknown>, k: string): string | undefined {
  const s = v.match(b, k, DATE_RE, true);
  if (s === undefined) return undefined;
  if (!DAY_ONLY.test(s.slice(0, 10)) || isNaN(new Date(`${s.slice(0, 10)}T00:00:00Z`).getTime())) throw badRequest(`${k} must be a valid ISO 8601 date string`);
  return s.slice(0, 10);
}

export const billingRoutes: Route[] = [
  // ---------- invoices (platform) ----------
  route('GET', '/admin/invoices', SA, ({ db, query: q }) => {
    const today = todayStr();
    const s = (q.search ?? '').trim().toLowerCase();
    if (q.status && !['ISSUED', 'PAID', 'VOID'].includes(q.status)) throw badRequest('status must be one of ISSUED, PAID, VOID');
    const overdueOnly = q.overdue === 'true';
    const rows = db.invoices.filter((i) => (!q.status || i.status === q.status) && (!q.companyId || i.companyId === q.companyId) &&
      (!s || i.number.toLowerCase().includes(s) || i.companyName.toLowerCase().includes(s) || (db.companies.find((c) => c.id === i.companyId)?.nameEn ?? '').toLowerCase().includes(s)))
      .map((i) => invoiceView(i, today))
      .filter((i) => !overdueOnly || i.overdue);
    rows.sort(byIssueDesc);
    return { ...paginate(rows, q), summary: invoiceSummary(db, today) };
  }),
  route('GET', '/admin/invoices/:id', SA, ({ db, params }) => invoiceDetail(db, findInvoice(db, params.id))),
  route('POST', '/admin/companies/:id/invoices', SA, ({ db, svc, user, params, body }) => {
    const c = findCompany(db, params.id);
    const periodStart = day(body, 'periodStart');
    const employees = intIn(body, 'employees', 1, 100000);
    const unitPrice = v.num(body, 'unitPrice', { min: 0, optional: true });
    const billingCycle = v.oneOf(body, 'billingCycle', BILLING_CYCLES, true);
    const notes = body.notes === undefined || body.notes === null ? undefined : v.str(body, 'notes');
    const sendEmail = bool(body, 'sendEmail');
    return invoiceView(issueInvoice(svc, c, { periodStart, employees, unitPrice, billingCycle, notes, sendEmail }, actor(user)));
  }),
  route('POST', '/admin/invoices/:id/pay', SA, ({ db, svc, user, params, body }) => {
    const inv = findInvoice(db, params.id);
    const paymentMethod = v.oneOf(body, 'paymentMethod', PAYMENT_METHODS)!;
    const paymentRef = body.paymentRef === undefined || body.paymentRef === null ? undefined : v.str(body, 'paymentRef');
    const paidAt = day(body, 'paidAt');
    const extendSubscription = bool(body, 'extendSubscription');
    return invoiceView(payInvoice(svc, inv, { paymentMethod, paymentRef, paidAt, extendSubscription }, actor(user)));
  }),
  route('POST', '/admin/invoices/:id/void', SA, ({ db, svc, user, params, body }) => {
    const inv = findInvoice(db, params.id);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) throw badRequest('reason should not be empty', 'سبب الإلغاء مطلوب');
    return invoiceView(voidInvoice(svc, inv, reason, actor(user)));
  }),

  // ---------- outbox & reminders ----------
  route('GET', '/admin/emails', SA, ({ db, query: q }) => {
    if (q.type && !EMAIL_TYPES.includes(q.type as EmailType)) throw badRequest(`type must be one of ${EMAIL_TYPES.join(', ')}`);
    if (q.status && !['SENT', 'FAILED', 'LOGGED'].includes(q.status)) throw badRequest('status must be one of SENT, FAILED, LOGGED');
    const rows = db.emails.filter((e) => (!q.type || e.type === q.type) && (!q.status || e.status === q.status) && (!q.companyId || e.companyId === q.companyId))
      .sort(byCreatedDesc).map((e) => emailView(db, e));
    return paginate(rows, q);
  }),
  route('POST', '/admin/companies/:id/remind', SA, ({ db, svc, user, params, body }) => {
    const c = findCompany(db, params.id);
    const message = body.message === undefined || body.message === null ? null : v.str(body, 'message')!;
    return emailView(db, manualReminder(svc, c, message, actor(user)));
  }),
  route('POST', '/admin/reminders/run', SA, ({ svc }) => ({ sent: runReminders(svc) })),

  // ---------- company owner ----------
  route('GET', '/billing/subscription', OWNER, ({ db, svc, user }) => {
    const c = findCompany(db, user.companyId);
    const view = adminCompanyView(svc, c);
    return {
      status: c.status, plan: c.plan, billingCycle: c.billingCycle, effectivePrice: view.effectivePrice, maxEmployees: c.maxEmployees,
      activeEmployees: activeEmployeeCount(db, c.id), trialEndsAt: c.trialEndsAt, subscriptionEndsAt: c.subscriptionEndsAt, daysLeft: view.daysLeft,
    };
  }),
  route('GET', '/billing/invoices', OWNER, ({ db, user, query }) => {
    const today = todayStr();
    return paginate(db.invoices.filter((i) => i.companyId === user.companyId).sort(byIssueDesc).map((i) => invoiceView(i, today)), query);
  }),
  route('GET', '/billing/invoices/:id', OWNER, ({ db, user, params }) => invoiceDetail(db, findInvoice(db, params.id, user.companyId))),
];
