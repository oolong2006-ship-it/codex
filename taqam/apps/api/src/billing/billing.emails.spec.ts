import { DEFAULT_BILLING } from './billing.math';
import { expiredEmail, invoiceIssuedEmail, subscriptionEndingEmail, trialEndingEmail } from './billing.emails';

const LRI = '⁦';
const PDI = '⁩';
const iso = (s: string) => `${LRI}${s}${PDI}`;

describe('billing emails (v2.1 bidi isolates)', () => {
  it('wraps ISO dates inside Arabic sentences in LRI … PDI', () => {
    const t = trialEndingEmail({ companyName: 'منشأة', ownerName: null, daysLeft: 3, endDay: '2026-11-01' });
    expect(t.body).toContain(`(${iso('2026-11-01')})`);
    const s = subscriptionEndingEmail({ companyName: 'منشأة', ownerName: null, daysLeft: 7, endDay: '2026-11-05', plan: 'GROWTH' });
    expect(s.body).toContain(`بتاريخ ${iso('2026-11-05')}`);
    expect(expiredEmail({ companyName: 'منشأة', ownerName: null, endDay: '2026-10-01', wasTrial: true }).body).toContain(iso('2026-10-01'));
    // the English paragraph stays plain
    expect(t.body).toContain('ends in 3 days (2026-11-01)');
  });

  it('isolates invoice numbers, amounts and periods; non-tax invoices do not claim VAT', () => {
    const invoice = { number: 'SH-2026-0007', periodStart: '2026-11-01', periodEnd: '2026-11-30', total: 1334, dueDate: '2026-11-08', employees: 40, plan: 'GROWTH' as const, documentType: 'TAX_INVOICE' as const };
    const e = invoiceIssuedEmail({ companyName: 'منشأة', ownerName: 'سارة', invoice, billing: DEFAULT_BILLING });
    expect(e.body).toContain(`رقم الفاتورة: ${iso('SH-2026-0007')}`);
    expect(e.body).toContain(`من ${iso('2026-11-01')} إلى ${iso('2026-11-30')}`);
    expect(e.body).toContain(iso('1,334.00 ر.س'));
    expect(e.body).toContain('شامل ضريبة القيمة المضافة');
    const plain = invoiceIssuedEmail({ companyName: 'منشأة', ownerName: null, invoice: { ...invoice, documentType: 'INVOICE' }, billing: DEFAULT_BILLING });
    expect(plain.body).not.toContain('ضريبة القيمة المضافة:');
    expect(plain.body).not.toContain('شامل ضريبة');
    expect(plain.body).not.toContain('incl. VAT');
  });
});
