/**
 * Billing demo data (docs/ADMIN_PORTAL.md v2 + v2.1): invoices, a credit note and an outbox history, built with the same
 * service functions the handlers use so numbers, events and emails are consistent. Deterministic and relative to
 * "today". Every action is scheduled on its own day and replayed in chronological order, so document numbers
 * (SH-/SHC- counters) follow issue dates across companies.
 * - مطاعم ورد الشام (co-01): 3 paid monthly invoices + the current one (issued, not yet due).
 * - مجموعة الواحة (ACTIVE, annual, special price): the annual invoice was first issued at the wrong price, reversed with a
 *   credit note the next day and re-issued at 22 SAR — paid. Its renewal is months away, so nothing is outstanding.
 * - مسار السريع (SUSPENDED): 3 paid + 2 overdue — the reason it was suspended.
 * - Trial / expiry reminders for لمسة أناقة and قهوة الديرة.
 */
import { addDays, addMonthsClamped, expiredDedupeKey, periodEnd } from '@/lib/billing';
import { riyadhDateTime, todayStr } from './dates';
import type { Company, DB, Invoice } from './db';
import { creditInvoice, issueInvoice, payInvoice } from './billing';
import { activeEmployeeCount, dayOf, logEvent, type Actor } from './lifecycle';
import { sendEmail } from './mail';
import { PLATFORM_ADMIN } from './seed-platform';
import type { Services } from './services';

const at = (d: string, hhmm = '10:00') => riyadhDateTime(d, hhmm).toISOString();

interface Action { day: string; hhmm: string; seq: number; run: () => void }

export function seedBilling(db: DB, svc: Services, now: Date) {
  const today = todayStr(now);
  const rel = (n: number) => addDays(today, n);
  const admin: Actor = { id: PLATFORM_ADMIN.id, name: PLATFORM_ADMIN.name };
  db.settings.billing = {
    ...db.settings.billing,
    sellerVatNumber: '311987654300003', sellerCrNumber: '1010876543', bankName: 'مصرف الراجحي', iban: 'SA4480000123608016123456',
  };
  const byEn = (en: string) => db.companies.find((c) => c.nameEn === en);

  // ---------- schedule ----------
  const actions: Action[] = [];
  const at$ = (day: string, hhmm: string, run: () => void) => { if (day <= today) actions.push({ day, hhmm, seq: actions.length, run }); };

  /** Issue (and optionally pay) one invoice as if it happened on `issueDay`. Calls `then` with the invoice. */
  const invoice = (c: Company, periodStart: string, issueDay: string, opts: { employees?: number; unitPrice?: number; paidAfter?: number; notes?: string; hhmm?: string } = {}, then?: (inv: Invoice) => void) => {
    let inv: Invoice | null = null;
    const hhmm = opts.hhmm ?? '09:30';
    at$(issueDay, hhmm, () => {
      inv = issueInvoice(svc, c, { periodStart, employees: opts.employees, unitPrice: opts.unitPrice, notes: opts.notes }, admin, { today: issueDay, createdAt: at(issueDay, hhmm) });
      then?.(inv);
    });
    if (opts.paidAfter !== undefined) {
      const paid = addDays(issueDay, opts.paidAfter);
      at$(paid, '13:15', () => {
        if (!inv) return;
        payInvoice(svc, inv, { paymentMethod: 'BANK_TRANSFER', paymentRef: `TRX-${paid.replace(/-/g, '')}-${inv.number.slice(-4)}`, paidAt: paid, extendSubscription: false }, admin, at(paid, '13:15'));
      });
    }
  };
  const reminder = (c: Company, type: 'TRIAL_ENDING' | 'SUBSCRIPTION_ENDING' | 'INVOICE_OVERDUE', onDay: string, days: number, key: () => string, extra: () => Parameters<typeof sendEmail>[3] = () => ({})) => {
    at$(onDay, '09:00', () => {
      const createdAt = at(onDay, '09:00');
      const x = extra() ?? {};
      const log = sendEmail(svc, c, type, type === 'INVOICE_OVERDUE' ? { ...x, daysOverdue: days } : { ...x, daysLeft: days }, { dedupeKey: key(), createdAt, notify: false });
      const data = type === 'INVOICE_OVERDUE' ? { type, daysOverdue: days, invoiceId: x.invoice?.id, number: x.invoice?.number } : { type, daysLeft: days };
      if (log) logEvent(svc, c, 'REMINDER_SENT', { from: c.status, to: c.status, data, createdAt });
    });
  };

  /** n consecutive monthly period starts beginning at `first` (each = previous end + 1, anchor carried over). */
  const monthlyChain = (first: string, n: number) => {
    const out = [first];
    const D = Number(first.slice(8, 10));
    while (out.length < n) out.push(addDays(periodEnd(out[out.length - 1], 1, D), 1));
    return out;
  };

  // ---------- مطاعم ورد الشام ----------
  const demo = db.companies[0];
  const active = activeEmployeeCount(db, demo.id);
  const demoStarts = monthlyChain(addMonthsClamped(rel(-2), -3), 4).map((d) => (d > today ? today : d));
  demoStarts.forEach((start, i) => {
    if (i < 3) invoice(demo, start, start, { employees: Math.max(1, active - (2 - Math.min(i, 2))), paidAfter: [3, 2, 4][i] });
    else invoice(demo, start, start, { employees: active });
  });

  // ---------- مجموعة الواحة للتجزئة (annual, special price) ----------
  const waha = byEn('Al-Waha Retail Group');
  if (waha?.subscriptionEndsAt) {
    waha.vatNumber = '302771930500003';
    const endDay = dayOf(waha.subscriptionEndsAt);
    const start = addMonthsClamped(addDays(endDay, 1), -12);
    let wrong: Invoice | null = null;
    invoice(waha, start, start, { employees: 12, unitPrice: 25, notes: 'عقد سنوي' }, (inv) => { wrong = inv; });
    at$(addDays(start, 1), '10:00', () => { if (wrong) creditInvoice(svc, wrong, 'سعر خاطئ — العقد السنوي بسعر خاص 22 ر.س للموظف', admin, at(addDays(start, 1), '10:00')); });
    invoice(waha, start, addDays(start, 1), { employees: 12, paidAfter: 5, notes: 'عقد سنوي — سعر خاص 22 ر.س للموظف', hhmm: '10:30' });
  }

  // ---------- شركة مسار السريع للنقل (suspended for late payment) ----------
  const masar = byEn('Masar Express Logistics');
  if (masar) {
    const starts = monthlyChain(addMonthsClamped(rel(-2), -5), 5);
    starts.slice(0, 3).forEach((s, i) => invoice(masar, s, s, { paidAfter: [6, 9, 12][i] }));
    for (const s of starts.slice(3)) {
      let ref: Invoice | null = null;
      invoice(masar, s, s, {}, (inv) => { ref = inv; });
      const due = addDays(s, db.settings.billing.invoiceDueDays);
      for (const d of [1, 7]) if (addDays(due, d) < today) reminder(masar, 'INVOICE_OVERDUE', addDays(due, d), d, () => `INVOICE_OVERDUE:${ref?.id}:${d}`, () => ({ invoice: ref ?? undefined }));
    }
    at$(rel(-15), '11:20', () => {
      const sent = sendEmail(svc, masar, 'MANUAL_REMINDER', { message: 'لديكم فاتورتان متأخرتان. نرجو السداد خلال أسبوع لتجنّب إيقاف الخدمة.' }, { createdAt: at(rel(-15), '11:20'), notify: false });
      if (sent) logEvent(svc, masar, 'REMINDER_SENT', { from: 'ACTIVE', to: 'ACTIVE', actor: { id: 'adm-02', name: 'سارة المطيري' }, data: { type: 'MANUAL_REMINDER', daysLeft: null, emailId: sent.id, status: sent.status }, createdAt: at(rel(-15), '11:20') });
    });
  }

  // ---------- trial reminders ----------
  const lamsa = byEn('Lamsa Fashion Stores');
  if (lamsa?.trialEndsAt) {
    const end = dayOf(lamsa.trialEndsAt);
    reminder(lamsa, 'TRIAL_ENDING', addDays(end, -7), 7, () => `TRIAL_ENDING:${lamsa.id}:${end}:7`, () => ({ endDay: end }));
  }
  const deira = byEn('Deira Coffee');
  if (deira?.trialEndsAt) {
    const end = dayOf(deira.trialEndsAt);
    for (const d of [7, 3, 1]) reminder(deira, 'TRIAL_ENDING', addDays(end, -d), d, () => `TRIAL_ENDING:${deira.id}:${end}:${d}`, () => ({ endDay: end }));
    at$(addDays(end, 1), '00:05', () => {
      const exp = sendEmail(svc, deira, 'EXPIRED', { endDay: end }, { dedupeKey: expiredDedupeKey(deira.id, end), createdAt: at(addDays(end, 1), '00:05'), notify: false });
      if (exp) logEvent(svc, deira, 'REMINDER_SENT', { from: 'EXPIRED', to: 'EXPIRED', data: { type: 'EXPIRED', daysLeft: 0 }, createdAt: at(addDays(end, 1), '00:05') });
    });
  }

  // ---------- replay in chronological order ----------
  actions.sort(byWhen);
  for (const a of actions) a.run();

  // Billing notifications from the seeded history are already read, except the last few days.
  const recent = rel(-3);
  for (const n of db.notifications) if (n.link === '/app/billing' && !n.readAt && todayStr(new Date(n.createdAt)) < recent) n.readAt = n.createdAt;
  db.remindersRunOn = null;
}

function byWhen(a: Action, b: Action) {
  return a.day.localeCompare(b.day) || a.hhmm.localeCompare(b.hhmm) || a.seq - b.seq;
}
