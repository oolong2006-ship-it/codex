import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeZatcaTlv } from '@/lib/billing';
import { stripIsolates } from '@/lib/bidi';
import { demoFetch, resetDemoData } from './client';
import { addDays, todayStr } from './dates';

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = async (method: string, path: string, token: string | null, body?: unknown, query?: Record<string, unknown>) =>
  (await demoFetch(method, path, { token, body, query })) as { status: number; data: Body };
const login = async (email: string) => (await call('POST', '/auth/login', null, { email, password: 'Shuoon@2026' })).data.accessToken as string;
const all = async (admin: string, query: Record<string, unknown> = {}) => (await call('GET', '/admin/invoices', admin, undefined, { pageSize: 200, ...query })).data;

afterEach(() => vi.useRealTimers());

describe('demo mock mirrors ADMIN_PORTAL v2.1 (tax invoices, credit notes, integrity)', () => {
  it('seed: chronological numbers across companies, one credit note, nothing overdue before its period', async () => {
    resetDemoData();
    const admin = await login('admin@shuoon.demo');
    const rows = (await all(admin)).data as Body[];
    const invoices = rows.filter((i) => i.documentType !== 'CREDIT_NOTE').sort((a, b) => a.number.localeCompare(b.number));
    for (let k = 1; k < invoices.length; k++) expect(invoices[k].issuedAt >= invoices[k - 1].issuedAt).toBe(true);
    const cns = rows.filter((i) => i.documentType === 'CREDIT_NOTE');
    expect(cns).toHaveLength(1);
    const original = rows.find((i) => i.id === cns[0].creditsInvoiceId)!;
    expect(original).toMatchObject({ status: 'CREDITED', creditedByNumber: cns[0].number });
    expect(cns[0].number).toMatch(/^SHC-\d{4}-0001$/);
    // Overdue invoices have periods that already started.
    for (const i of rows.filter((x) => x.overdue)) expect(i.periodStart <= todayStr()).toBe(true);
    expect(rows.filter((i) => i.companyName === 'مجموعة الواحة للتجزئة' && i.status === 'ISSUED' && i.documentType !== 'CREDIT_NOTE')).toHaveLength(0);
  });

  it('tax invoice: VAT gate, seller/buyer snapshots, issuedAt, Phase-1 QR', async () => {
    resetDemoData();
    const admin = await login('admin@shuoon.demo');
    const inv = (await call('POST', '/admin/companies/co-01/invoices', admin, { sendEmail: false })).data;
    expect(inv).toMatchObject({ documentType: 'TAX_INVOICE', vatRate: 0.15, seller: { name: 'شؤون لتقنية المعلومات', vatNumber: '311987654300003' }, buyer: { nameAr: 'مطاعم ورد الشام' } });
    expect(inv.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(decodeZatcaTlv(inv.qr)).toEqual({ 1: 'شؤون لتقنية المعلومات', 2: '311987654300003', 3: inv.issuedAt, 4: inv.total.toFixed(2), 5: inv.vat.toFixed(2) });

    // Later settings / company edits never change the issued document.
    await call('PATCH', '/admin/settings', admin, { billing: { sellerName: 'اسم جديد', sellerAddress: 'جدة' } });
    await call('PATCH', '/admin/companies/co-01', admin, { nameAr: 'اسم منشأة جديد' });
    const detail = (await call('GET', `/admin/invoices/${inv.id}`, admin)).data;
    expect(detail.seller.name).toBe('شؤون لتقنية المعلومات');
    expect(detail.buyer.nameAr).toBe('مطاعم ورد الشام');
    expect(detail.company.nameAr).toBe('اسم منشأة جديد');

    // Invalid TRN rejected with the doc's message; empty TRN → plain invoice, VAT 0, no QR.
    const bad = await call('PATCH', '/admin/settings', admin, { billing: { sellerVatNumber: '123456789012345' } });
    expect(bad.status).toBe(400);
    expect(bad.data.messageAr).toBe('الرقم الضريبي يجب أن يكون 15 رقماً يبدأ وينتهي بالرقم 3');
    await call('PATCH', '/admin/settings', admin, { billing: { sellerVatNumber: '' } });
    const plain = (await call('POST', '/admin/companies/co-01/invoices', admin, { sendEmail: false })).data;
    expect(plain).toMatchObject({ documentType: 'INVOICE', vatRate: 0, vat: 0, qr: null });
    expect(plain.total).toBe(plain.taxable);
  });

  it('credit notes replace void: SHC series, original CREDITED, excluded from outstanding, filters, period re-invoiceable', async () => {
    resetDemoData();
    const admin = await login('admin@shuoon.demo');
    const before = (await all(admin)).summary;
    const inv = (await call('POST', '/admin/companies/co-01/invoices', admin, { sendEmail: false })).data;
    expect((await all(admin)).summary.outstanding.count).toBe(before.outstanding.count + 1);
    // Same period again → 409
    const dup = await call('POST', '/admin/companies/co-01/invoices', admin, { periodStart: inv.periodStart, sendEmail: false });
    expect(dup.status).toBe(409);
    expect(dup.data.messageAr).toBe('توجد فاتورة تغطي هذه الفترة');

    expect((await call('POST', `/admin/invoices/${inv.id}/credit`, admin, { reason: 'x'.repeat(1001) })).status).toBe(400);
    const cn = (await call('POST', `/admin/invoices/${inv.id}/credit`, admin, { reason: 'خطأ في عدد الموظفين' })).data;
    expect(cn).toMatchObject({ documentType: 'CREDIT_NOTE', status: 'ISSUED', creditsInvoiceId: inv.id, creditsNumber: inv.number, total: inv.total, reason: 'خطأ في عدد الموظفين', overdue: false });
    expect(cn.number).toMatch(/^SHC-\d{4}-\d{4}$/);
    expect(decodeZatcaTlv(cn.qr)[3]).toBe(cn.issuedAt);
    const orig = (await call('GET', `/admin/invoices/${inv.id}`, admin)).data;
    expect(orig).toMatchObject({ status: 'CREDITED', creditedByNumber: cn.number, reason: 'خطأ في عدد الموظفين' });
    const again = await call('POST', `/admin/invoices/${inv.id}/credit`, admin, { reason: 'مرة أخرى' });
    expect(again.status).toBe(409);
    expect(again.data.messageAr).toBe('تمت معالجة هذه الفاتورة مسبقاً');
    const payCn = await call('POST', `/admin/invoices/${cn.id}/pay`, admin, { paymentMethod: 'CASH' });
    expect(payCn.status).toBe(400);
    expect(payCn.data.messageAr).toBe('لا يمكن تسجيل دفعة على إشعار دائن');
    // status filters invoices only, unless type=CREDIT_NOTE
    expect((await all(admin, { status: 'ISSUED' })).data.some((i: Body) => i.documentType === 'CREDIT_NOTE')).toBe(false);
    expect((await all(admin, { status: 'ISSUED', type: 'CREDIT_NOTE' })).data.map((i: Body) => i.id)).toContain(cn.id);
    expect((await call('POST', `/admin/invoices/${cn.id}/credit`, admin, { reason: 'x' })).status).toBe(400);

    const s = (await all(admin)).summary;
    expect(s.outstanding).toEqual(before.outstanding);
    expect((await all(admin, { type: 'CREDIT_NOTE' })).data.every((i: Body) => i.documentType === 'CREDIT_NOTE')).toBe(true);
    expect((await all(admin, { type: 'INVOICE' })).data.every((i: Body) => i.documentType !== 'CREDIT_NOTE')).toBe(true);
    expect((await all(admin, { status: 'CREDITED' })).data.map((i: Body) => i.id)).toContain(inv.id);
    expect((await all(admin, { overdue: 'false' })).data.every((i: Body) => !i.overdue)).toBe(true);
    expect((await call('GET', '/admin/invoices', admin, undefined, { status: 'VOID' })).status).toBe(400);

    // The credited period can be invoiced again; numbers are never reused.
    const re = (await call('POST', '/admin/companies/co-01/invoices', admin, { periodStart: inv.periodStart, sendEmail: false })).data;
    expect(re.number > inv.number).toBe(true);
    expect(re.periodStart).toBe(inv.periodStart);
  });

  it('issue rules: minBilledEmployees default 10, period window, strict dates, limits', async () => {
    resetDemoData();
    const admin = await login('admin@shuoon.demo');
    expect((await call('GET', '/admin/settings', admin)).data.billing.minBilledEmployees).toBe(10);
    // Golden Sunbula (co-05, TRIAL GROWTH, 7 employees) → billed for 10
    const small = (await call('POST', '/admin/companies/co-05/invoices', admin, { sendEmail: false })).data;
    expect(small.employees).toBe(10);
    const today = todayStr();
    expect((await call('POST', '/admin/companies/co-05/invoices', admin, { periodStart: addDays(today, 91) })).status).toBe(400);
    expect((await call('POST', '/admin/companies/co-05/invoices', admin, { periodStart: addDays(today, -61) })).status).toBe(400);
    expect((await call('POST', '/admin/companies/co-05/invoices', admin, { periodStart: '2026-02-30' })).status).toBe(400);
    expect((await call('POST', '/admin/companies/co-05/invoices', admin, { periodStart: `${addDays(today, 40)}T00:00:00Z` })).status).toBe(400);
    expect((await call('POST', '/admin/companies/co-05/invoices', admin, { unitPrice: 19.999 })).status).toBe(400);
    expect((await call('POST', '/admin/companies/co-05/invoices', admin, { unitPrice: 100000000 })).status).toBe(400);
    expect((await call('POST', '/admin/companies/co-05/invoices', admin, { notes: 'x'.repeat(2001) })).status).toBe(400);
    expect((await call('POST', '/admin/companies/co-05/remind', admin, { message: 'x'.repeat(2001) })).status).toBe(400);
  });

  it('pay rules: paidAt not future / not before issue; no revive when the period already ended', async () => {
    resetDemoData();
    const admin = await login('admin@shuoon.demo');
    const today = todayStr();
    // Deira Coffee (co-07) is EXPIRED: an invoice for a period that already ended cannot revive it.
    const old = (await call('POST', '/admin/companies/co-07/invoices', admin, { periodStart: addDays(today, -50), sendEmail: false })).data;
    expect(old.periodEnd < today).toBe(true);
    const revive = await call('POST', `/admin/invoices/${old.id}/pay`, admin, { paymentMethod: 'CASH' });
    expect(revive.status).toBe(400);
    expect(revive.data.messageAr).toBe('فترة هذه الفاتورة انتهت؛ أصدر فاتورة لفترة حالية');
    expect((await call('POST', `/admin/invoices/${old.id}/pay`, admin, { paymentMethod: 'CASH', paidAt: addDays(today, 1), extendSubscription: false })).status).toBe(400);
    expect((await call('POST', `/admin/invoices/${old.id}/pay`, admin, { paymentMethod: 'CASH', paidAt: addDays(today, -1), extendSubscription: false })).status).toBe(400);
    expect((await call('POST', `/admin/invoices/${old.id}/pay`, admin, { paymentMethod: 'CASH', paymentRef: 'x'.repeat(201), extendSubscription: false })).status).toBe(400);
    const paid = await call('POST', `/admin/invoices/${old.id}/pay`, admin, { paymentMethod: 'CASH', extendSubscription: false });
    expect(paid.data.status).toBe('PAID');
    // EXPIRED default periodStart is today, and paying it revives the company.
    const fresh = (await call('POST', '/admin/companies/co-07/invoices', admin, { sendEmail: false })).data;
    expect(fresh.periodStart).toBe(today);
    expect((await call('POST', `/admin/invoices/${fresh.id}/pay`, admin, { paymentMethod: 'CASH' })).status).toBe(200);
    expect((await call('GET', '/admin/companies/co-07', admin)).data.status).toBe('ACTIVE');
  });

  it.each(['2026-01-31T09:00:00Z', '2026-03-30T09:00:00Z', '2026-03-31T09:00:00Z', '2028-02-29T09:00:00Z'])('seed builds consistently on month-end dates (%s)', async (at) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(at));
    resetDemoData();
    const admin = await login('admin@shuoon.demo');
    const rows = (await all(admin)).data as Body[];
    expect(rows.filter((i) => i.companyId === 'co-01' && i.documentType !== 'CREDIT_NOTE')).toHaveLength(4);
    expect(rows.filter((i) => i.companyName === 'شركة مسار السريع للنقل')).toHaveLength(5);
    expect(rows.filter((i) => i.documentType === 'CREDIT_NOTE')).toHaveLength(1);
  });

  it('company delete is blocked when invoices exist', async () => {
    resetDemoData();
    const admin = await login('admin@shuoon.demo');
    const r = await call('DELETE', '/admin/companies/co-06', admin, { confirmName: 'شركة مسار السريع للنقل' });
    expect(r.status).toBe(409);
    expect(r.data.messageAr).toBe('لا يمكن حذف منشأة لها فواتير صادرة؛ أوقف الحساب بدلاً من ذلك');
    expect((await call('DELETE', '/admin/companies/co-02', admin, { confirmName: 'مؤسسة أركان المدى للمقاولات' })).status).toBe(200);
  });

  it('emails: bidi isolates in Arabic, notification with /app/billing for every logged email; owner sees whole-account dues', async () => {
    resetDemoData();
    const admin = await login('admin@shuoon.demo');
    const inv = (await call('POST', '/admin/companies/co-01/invoices', admin, {})).data;
    const mail = (await call('GET', '/admin/emails', admin, undefined, { type: 'INVOICE_ISSUED', companyId: 'co-01' })).data.data[0];
    expect(mail.body).toContain(`⁦${inv.dueDate}⁩`);
    expect(mail.body).toContain(`⁦${inv.number}⁩`);
    expect(stripIsolates(mail.body)).toContain(`Invoice ${inv.number}`);
    expect(mail.body.split('\n\n').find((p: string) => p.startsWith('Invoice'))).not.toMatch(/[⁦-⁩]/);

    const owner = await login('owner@shuoon.demo');
    const notes = (await call('GET', '/notifications', owner)).data;
    const list = (Array.isArray(notes) ? notes : notes.data) as Body[];
    expect(list.some((n) => n.link === '/app/billing' && stripIsolates(n.title).includes(inv.number))).toBe(true);
    const sub = (await call('GET', '/billing/subscription', owner)).data;
    expect(sub.outstanding.count).toBe(2);
    expect(sub.outstanding.amount).toBe(Math.round((inv.total + 1334) * 100) / 100);
    expect(sub.overdue).toEqual({ count: 0, amount: 0 });
  });
});
