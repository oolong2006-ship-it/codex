import { describe, expect, it } from 'vitest';
import { demoFetch, resetDemoData } from './client';
import { addDays, todayStr } from './dates';

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = async (method: string, path: string, token: string | null, body?: unknown, query?: Record<string, unknown>) =>
  (await demoFetch(method, path, { token, body, query })) as { status: number; data: Body };
const login = async (email: string) => (await call('POST', '/auth/login', null, { email, password: 'Shuoon@2026' })).data.accessToken as string;

describe('demo mock — billing & reminders (ADMIN_PORTAL v2)', () => {
  it('seeds invoices, issues / pays / credits with the contract rules and dedupes reminders', async () => {
    resetDemoData();
    const admin = await login('admin@shuoon.demo');
    const today = todayStr();

    const list = await call('GET', '/admin/invoices', admin, undefined, { pageSize: 100 });
    expect(list.status).toBe(200);
    const demoInv = list.data.data.filter((i: Body) => i.companyId === 'co-01' && i.documentType !== 'CREDIT_NOTE');
    expect(demoInv.filter((i: Body) => i.status === 'PAID')).toHaveLength(3);
    expect(demoInv.filter((i: Body) => i.status === 'ISSUED')).toHaveLength(1);
    expect(list.data.summary.overdue.count).toBeGreaterThanOrEqual(1);
    expect(list.data.data.every((i: Body) => /^SHC?-\d{4}-\d{4}$/.test(i.number))).toBe(true);
    const overdueOnly = await call('GET', '/admin/invoices', admin, undefined, { overdue: 'true' });
    expect(overdueOnly.data.data.every((i: Body) => i.overdue && i.status === 'ISSUED')).toBe(true);

    // Overview runs the reminder job once per day; a manual run right after sends nothing new (dedupe).
    expect((await call('GET', '/admin/overview', admin)).status).toBe(200);
    expect((await call('POST', '/admin/reminders/run', admin)).data).toEqual({ sent: 0 });
    const trial = await call('GET', '/admin/emails', admin, undefined, { type: 'TRIAL_ENDING', companyId: 'co-04' });
    expect(trial.data.data.map((e: Body) => e.subject)).toEqual([expect.stringContaining('3 أيام'), expect.stringContaining('7 أيام')]);

    // Issue for the demo company: defaults follow the latest invoice and the company's price.
    const issued = await call('POST', '/admin/companies/co-01/invoices', admin, { notes: 'اختبار' });
    expect(issued.status).toBe(201);
    const latest = demoInv.sort((a: Body, b: Body) => b.periodEnd.localeCompare(a.periodEnd))[0];
    expect(issued.data).toMatchObject({ status: 'ISSUED', unitPrice: 29, months: 1, periodStart: addDays(latest.periodEnd, 1), issueDate: today, dueDate: addDays(today, 7), overdue: false });
    expect(issued.data.total).toBe(Math.round((issued.data.taxable + issued.data.vat) * 100) / 100);

    const pay = await call('POST', `/admin/invoices/${issued.data.id}/pay`, admin, { paymentMethod: 'BANK_TRANSFER', paymentRef: 'TRX-1' });
    expect(pay.status).toBe(200);
    expect(pay.data).toMatchObject({ status: 'PAID', paymentMethod: 'BANK_TRANSFER', paymentRef: 'TRX-1' });
    const again = await call('POST', `/admin/invoices/${issued.data.id}/pay`, admin, { paymentMethod: 'CASH' });
    expect(again.status).toBe(409);
    expect(again.data.messageAr).toBe('تمت معالجة هذه الفاتورة مسبقاً');
    const detail = await call('GET', '/admin/companies/co-01', admin);
    expect(detail.data.subscriptionEndsAt >= `${issued.data.periodEnd}`).toBe(true);
    expect(detail.data.invoices[0].id).toBeDefined();
    expect(detail.data.emails.some((e: Body) => e.type === 'PAYMENT_RECEIVED' && e.status === 'LOGGED')).toBe(true);

    // A credit note needs a reason (void is gone); a pending company cannot be invoiced.
    const second = await call('POST', '/admin/companies/co-01/invoices', admin, { sendEmail: false, billingCycle: 'ANNUAL' });
    expect(second.data).toMatchObject({ months: 12, discountRate: 0.15 });
    expect((await call('POST', `/admin/invoices/${second.data.id}/void`, admin, { reason: 'x' })).status).toBe(404);
    expect((await call('POST', `/admin/invoices/${second.data.id}/credit`, admin, {})).status).toBe(400);
    const cn = await call('POST', `/admin/invoices/${second.data.id}/credit`, admin, { reason: 'خطأ في الدورة' });
    expect(cn.data).toMatchObject({ documentType: 'CREDIT_NOTE', creditsNumber: second.data.number, status: 'ISSUED' });
    const pending = await call('POST', '/admin/companies/co-02/invoices', admin, {});
    expect(pending.status).toBe(400);
    expect(pending.data.messageAr).toBe('لا يمكن إصدار فاتورة لمنشأة بانتظار الموافقة');

    // Manual reminder + outbox
    const remind = await call('POST', '/admin/companies/co-04/remind', admin, { message: 'نذكركم بقرب انتهاء التجربة' });
    expect(remind.status).toBe(201);
    expect(remind.data).toMatchObject({ type: 'MANUAL_REMINDER', status: 'LOGGED', companyName: 'متاجر لمسة أناقة' });
    const emails = await call('GET', '/admin/emails', admin, undefined, { type: 'MANUAL_REMINDER' });
    expect(emails.data.data[0].id).toBe(remind.data.id);

    // Settings: partial merge + validation
    const s = await call('PATCH', '/admin/settings', admin, { billing: { invoiceDueDays: 10 }, reminders: { trialDays: [1, 3] } });
    expect(s.data.billing).toMatchObject({ invoiceDueDays: 10, vatRate: 0.15 });
    expect(s.data.reminders).toMatchObject({ trialDays: [3, 1], subscriptionDays: [14, 7, 1] });
    expect((await call('PATCH', '/admin/settings', admin, { billing: { vatRate: 2 } })).status).toBe(400);

    // Owner endpoints: own company only
    const owner = await login('owner@shuoon.demo');
    const sub = await call('GET', '/billing/subscription', owner);
    expect(sub.data).toMatchObject({ status: 'ACTIVE', plan: 'GROWTH', effectivePrice: 29 });
    const mine = await call('GET', '/billing/invoices', owner);
    expect(mine.data.data.every((i: Body) => i.companyId === 'co-01')).toBe(true);
    expect((await call('GET', `/billing/invoices/${mine.data.data[0].id}`, owner)).data.seller.name).toBe('شؤون لتقنية المعلومات');
    const foreign = list.data.data.find((i: Body) => i.companyId !== 'co-01');
    expect((await call('GET', `/billing/invoices/${foreign.id}`, owner)).status).toBe(404);
    expect((await call('GET', '/admin/invoices', owner)).status).toBe(403);
  }, 60000);
});
