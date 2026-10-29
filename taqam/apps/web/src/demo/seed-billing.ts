/**
 * Billing demo data (docs/ADMIN_PORTAL.md v2): invoices and an outbox history, built with the same service functions
 * the handlers use so numbers, events and emails are consistent. Deterministic and relative to "today".
 * - مطاعم ورد الشام (co-01): 3 paid monthly invoices + the current one (issued).
 * - مجموعة الواحة (ACTIVE, annual): last year's invoice paid, the renewal invoice overdue.
 * - مسار السريع (SUSPENDED): 3 paid + 2 overdue — the reason it was suspended.
 * - Trial / expiry reminders for لمسة أناقة and قهوة الديرة.
 */
import { addDays, addMonthsClamped, expiredDedupeKey } from '@/lib/billing';
import { riyadhDateTime, todayStr } from './dates';
import type { Company, DB } from './db';
import { issueInvoice, payInvoice } from './billing';
import { activeEmployeeCount, dayOf, logEvent, type Actor } from './lifecycle';
import { sendEmail } from './mail';
import { PLATFORM_ADMIN } from './seed-platform';
import type { Services } from './services';

const at = (d: string, hhmm = '10:00') => riyadhDateTime(d, hhmm).toISOString();

export function seedBilling(db: DB, svc: Services, now: Date) {
  const today = todayStr(now);
  const rel = (n: number) => addDays(today, n);
  const admin: Actor = { id: PLATFORM_ADMIN.id, name: PLATFORM_ADMIN.name };
  db.settings.billing = {
    ...db.settings.billing,
    sellerVatNumber: '311987654300003', sellerCrNumber: '1010876543', bankName: 'مصرف الراجحي', iban: 'SA4480000123608016123456',
  };
  const byEn = (en: string) => db.companies.find((c) => c.nameEn === en);

  /** Issue (and optionally pay) one invoice as if it happened on `issueDay`. */
  const invoice = (c: Company, periodStart: string, issueDay: string, opts: { employees?: number; paidAfter?: number; notes?: string } = {}) => {
    const inv = issueInvoice(svc, c, { periodStart, employees: opts.employees, notes: opts.notes }, admin, { today: issueDay, createdAt: at(issueDay, '09:30') });
    if (opts.paidAfter !== undefined) {
      const paid = addDays(issueDay, opts.paidAfter);
      payInvoice(svc, inv, { paymentMethod: 'BANK_TRANSFER', paymentRef: `TRX-${paid.replace(/-/g, '')}-${inv.number.slice(-4)}`, paidAt: paid, extendSubscription: false }, admin, at(paid, '13:15'));
    }
    return inv;
  };
  const reminder = (c: Company, type: 'TRIAL_ENDING' | 'SUBSCRIPTION_ENDING' | 'INVOICE_OVERDUE', onDay: string, days: number, key: string, extra: Parameters<typeof sendEmail>[3] = {}) => {
    const createdAt = at(onDay, '09:00');
    const log = sendEmail(svc, c, type, type === 'INVOICE_OVERDUE' ? { ...extra, daysOverdue: days } : { ...extra, daysLeft: days }, { dedupeKey: key, createdAt, notify: false });
    const data = type === 'INVOICE_OVERDUE' ? { type, daysOverdue: days, invoiceId: extra.invoice?.id, number: extra.invoice?.number } : { type, daysLeft: days };
    if (log) logEvent(svc, c, 'REMINDER_SENT', { from: c.status, to: c.status, data, createdAt });
  };

  // ---------- مطاعم ورد الشام ----------
  const demo = db.companies[0];
  const active = activeEmployeeCount(db, demo.id);
  const cur = rel(-2);
  [3, 2, 1].forEach((k, i) => {
    const start = addMonthsClamped(cur, -k);
    invoice(demo, start, start, { employees: Math.max(1, active - (2 - Math.min(i, 2))), paidAfter: [3, 2, 4][i] });
  });
  invoice(demo, cur, cur, { employees: active });

  // ---------- مجموعة الواحة للتجزئة (annual) ----------
  const waha = byEn('Al-Waha Retail Group');
  if (waha?.subscriptionEndsAt) {
    waha.vatNumber = '302771930500003';
    const endDay = dayOf(waha.subscriptionEndsAt);
    const start = addMonthsClamped(addDays(endDay, 1), -12);
    invoice(waha, start, start, { employees: 10, paidAfter: 5, notes: 'عقد سنوي — سعر خاص 22 ر.س للموظف' });
    const renewal = invoice(waha, addDays(endDay, 1), rel(-14), { notes: 'تجديد العقد السنوي للعام القادم' });
    reminder(waha, 'INVOICE_OVERDUE', addDays(renewal.dueDate, 1), 1, `INVOICE_OVERDUE:${renewal.id}:1`, { invoice: renewal });
  }

  // ---------- شركة مسار السريع للنقل (suspended for late payment) ----------
  const masar = byEn('Masar Express Logistics');
  if (masar) {
    const base = rel(-2);
    [5, 4, 3].forEach((k, i) => { const s = addMonthsClamped(base, -k); invoice(masar, s, s, { paidAfter: [6, 9, 12][i] }); });
    for (const k of [2, 1]) {
      const s = addMonthsClamped(base, -k);
      const inv = invoice(masar, s, s);
      for (const d of [1, 7]) if (addDays(inv.dueDate, d) < today) reminder(masar, 'INVOICE_OVERDUE', addDays(inv.dueDate, d), d, `INVOICE_OVERDUE:${inv.id}:${d}`, { invoice: inv });
    }
    const sent = sendEmail(svc, masar, 'MANUAL_REMINDER', { message: 'لديكم فاتورتان متأخرتان. نرجو السداد خلال أسبوع لتجنّب إيقاف الخدمة.' }, { createdAt: at(rel(-15), '11:20'), notify: false });
    if (sent) logEvent(svc, masar, 'REMINDER_SENT', { from: 'ACTIVE', to: 'ACTIVE', actor: { id: 'adm-02', name: 'سارة المطيري' }, data: { type: 'MANUAL_REMINDER', daysLeft: null, emailId: sent.id, status: sent.status }, createdAt: at(rel(-15), '11:20') });
  }

  // ---------- trial reminders ----------
  const lamsa = byEn('Lamsa Fashion Stores');
  if (lamsa?.trialEndsAt) {
    const end = dayOf(lamsa.trialEndsAt);
    reminder(lamsa, 'TRIAL_ENDING', addDays(end, -7), 7, `TRIAL_ENDING:${lamsa.id}:${end}:7`, { endDay: end });
  }
  const deira = byEn('Deira Coffee');
  if (deira?.trialEndsAt) {
    const end = dayOf(deira.trialEndsAt);
    for (const d of [7, 3, 1]) reminder(deira, 'TRIAL_ENDING', addDays(end, -d), d, `TRIAL_ENDING:${deira.id}:${end}:${d}`, { endDay: end });
    const exp = sendEmail(svc, deira, 'EXPIRED', { endDay: end }, { dedupeKey: expiredDedupeKey(deira.id, end), createdAt: at(addDays(end, 1), '00:05'), notify: false });
    if (exp) logEvent(svc, deira, 'REMINDER_SENT', { from: 'EXPIRED', to: 'EXPIRED', data: { type: 'EXPIRED', daysLeft: 0 }, createdAt: at(addDays(end, 1), '00:05') });
  }
  db.remindersRunOn = null;
}
