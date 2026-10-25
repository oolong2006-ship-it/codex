import {
  addMonthsClamped,
  computeInvoice,
  daysBetween,
  dedupeKey,
  DEFAULT_BILLING,
  DEFAULT_REMINDERS,
  mergeBilling,
  mergeReminders,
  nextInvoiceNumber,
  periodEndOf,
  selectReminders,
} from './billing.math';

describe('computeInvoice', () => {
  it('monthly: employees × unitPrice × 1, no discount, 15% VAT', () => {
    expect(computeInvoice({ employees: 40, unitPrice: 29, billingCycle: 'MONTHLY', annualDiscount: 0.15, vatRate: 0.15 })).toEqual({
      months: 1,
      subtotal: 1160,
      discountRate: 0,
      discount: 0,
      taxable: 1160,
      vat: 174,
      total: 1334,
    });
  });

  it('annual: × 12 months with the annual discount, VAT on the discounted amount', () => {
    // 10 × 19 × 12 = 2280; discount 342; taxable 1938; VAT 290.7; total 2228.7
    expect(computeInvoice({ employees: 10, unitPrice: 19, billingCycle: 'ANNUAL', annualDiscount: 0.15, vatRate: 0.15 })).toEqual({
      months: 12,
      subtotal: 2280,
      discountRate: 0.15,
      discount: 342,
      taxable: 1938,
      vat: 290.7,
      total: 2228.7,
    });
  });

  it('rounds discount, VAT and total to 2 decimals', () => {
    // 3 × 22.33 × 12 = 803.88; discount 120.582 → 120.58; taxable 683.3; VAT 102.495 → 102.5; total 785.8
    const r = computeInvoice({ employees: 3, unitPrice: 22.33, billingCycle: 'ANNUAL', annualDiscount: 0.15, vatRate: 0.15 });
    expect(r).toMatchObject({ subtotal: 803.88, discount: 120.58, taxable: 683.3, vat: 102.5, total: 785.8 });
    // 7 × 13.37 = 93.59; VAT 14.0385 → 14.04; total 107.63
    expect(computeInvoice({ employees: 7, unitPrice: 13.37, billingCycle: 'MONTHLY', annualDiscount: 0.15, vatRate: 0.15 })).toMatchObject({
      subtotal: 93.59,
      vat: 14.04,
      total: 107.63,
    });
  });

  it('honours a custom VAT rate (0 = no VAT)', () => {
    expect(computeInvoice({ employees: 2, unitPrice: 50, billingCycle: 'MONTHLY', annualDiscount: 0.15, vatRate: 0 })).toMatchObject({ vat: 0, total: 100 });
  });
});

describe('nextInvoiceNumber', () => {
  it('starts at 0001 per year', () => {
    expect(nextInvoiceNumber(2026, [])).toBe('SH-2026-0001');
  });
  it('continues after the highest number of the same year only', () => {
    expect(nextInvoiceNumber(2026, ['SH-2026-0001', 'SH-2026-0007', 'SH-2025-0042', 'SH-2026-0003'])).toBe('SH-2026-0008');
    expect(nextInvoiceNumber(2027, ['SH-2026-0007'])).toBe('SH-2027-0001');
  });
  it('keeps growing past 9999', () => {
    expect(nextInvoiceNumber(2026, ['SH-2026-9999'])).toBe('SH-2026-10000');
    expect(nextInvoiceNumber(2026, ['SH-2026-10000', 'SH-2026-9999'])).toBe('SH-2026-10001');
  });
});

describe('periodEndOf / addMonthsClamped', () => {
  it('monthly from the 1st ends on the last day of the month', () => {
    expect(periodEndOf('2026-01-01', 1)).toBe('2026-01-31');
    expect(periodEndOf('2026-02-01', 1)).toBe('2026-02-28');
    expect(periodEndOf('2028-02-01', 1)).toBe('2028-02-29');
  });
  it('mid-month periods end the day before the same day next month', () => {
    expect(periodEndOf('2026-03-15', 1)).toBe('2026-04-14');
    expect(periodEndOf('2026-12-20', 1)).toBe('2027-01-19');
  });
  it('month-end starts clamp to the shorter month', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(periodEndOf('2026-01-31', 1)).toBe('2026-02-27');
    expect(periodEndOf('2026-03-31', 1)).toBe('2026-04-29');
  });
  it('annual = 12 months − 1 day (leap day clamps)', () => {
    expect(periodEndOf('2026-01-01', 12)).toBe('2026-12-31');
    expect(periodEndOf('2026-03-15', 12)).toBe('2027-03-14');
    expect(periodEndOf('2028-02-29', 12)).toBe('2029-02-27');
  });
});

describe('settings defaults', () => {
  it('fills every billing / reminder default', () => {
    expect(mergeBilling({})).toEqual(DEFAULT_BILLING);
    expect(mergeBilling(null)).toEqual(DEFAULT_BILLING);
    expect(DEFAULT_BILLING).toMatchObject({ sellerName: 'شؤون لتقنية المعلومات', vatRate: 0.15, invoiceDueDays: 7, sellerPhone: '+966 55 042 1235' });
    expect(mergeReminders(undefined)).toEqual({ enabled: true, trialDays: [7, 3, 1], subscriptionDays: [14, 7, 1], notifyOnExpiry: true, overdueInvoiceDays: [1, 7] });
  });
  it('keeps stored overrides and ignores junk', () => {
    expect(mergeBilling({ vatRate: 0.05, iban: 'SA00', bogus: 1, invoiceDueDays: 'x' })).toEqual({ ...DEFAULT_BILLING, vatRate: 0.05, iban: 'SA00' });
    expect(mergeReminders({ enabled: false, trialDays: [2] })).toEqual({ ...DEFAULT_REMINDERS, enabled: false, trialDays: [2] });
  });
});

describe('dedupeKey', () => {
  it('uses the contract formats', () => {
    expect(dedupeKey({ type: 'TRIAL_ENDING', companyId: 'c1', endDay: '2026-11-01', daysLeft: 3 })).toBe('TRIAL_ENDING:c1:2026-11-01:3');
    expect(dedupeKey({ type: 'SUBSCRIPTION_ENDING', companyId: 'c1', endDay: '2026-11-01', daysLeft: 14 })).toBe('SUBSCRIPTION_ENDING:c1:2026-11-01:14');
    expect(dedupeKey({ type: 'EXPIRED', companyId: 'c1', endDay: '2026-11-01' })).toBe('EXPIRED:c1:2026-11-01');
    expect(dedupeKey({ type: 'INVOICE_OVERDUE', invoiceId: 'i9', daysOverdue: 7 })).toBe('INVOICE_OVERDUE:i9:7');
  });
});

describe('selectReminders', () => {
  const today = '2026-10-25';
  // end of a Riyadh day `n` days from today (20:59:59.999Z = 23:59:59.999 Riyadh)
  const endIn = (n: number) => new Date(new Date(`${today}T20:59:59.999Z`).getTime() + n * 86400000);
  const now = new Date(`${today}T06:00:00Z`); // 09:00 Riyadh
  const settings = DEFAULT_REMINDERS;

  it('daysBetween counts calendar days', () => {
    expect(daysBetween('2026-10-25', '2026-10-28')).toBe(3);
    expect(daysBetween('2026-10-28', '2026-10-25')).toBe(-3);
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
  });

  it('picks TRIAL / ACTIVE companies whose daysLeft is configured, and overdue invoices', () => {
    const companies = [
      { id: 't7', status: 'TRIAL' as const, trialEndsAt: endIn(7), subscriptionEndsAt: null },
      { id: 't3', status: 'TRIAL' as const, trialEndsAt: endIn(3), subscriptionEndsAt: null },
      { id: 't5', status: 'TRIAL' as const, trialEndsAt: endIn(5), subscriptionEndsAt: null },
      { id: 'a14', status: 'ACTIVE' as const, trialEndsAt: null, subscriptionEndsAt: endIn(14) },
      { id: 'a1', status: 'ACTIVE' as const, trialEndsAt: endIn(1), subscriptionEndsAt: endIn(1) },
      { id: 'a3', status: 'ACTIVE' as const, trialEndsAt: null, subscriptionEndsAt: endIn(3) }, // 3 ∉ subscriptionDays
      { id: 'open', status: 'ACTIVE' as const, trialEndsAt: null, subscriptionEndsAt: null },
      { id: 's7', status: 'SUSPENDED' as const, trialEndsAt: null, subscriptionEndsAt: endIn(7) },
      { id: 'tPast', status: 'TRIAL' as const, trialEndsAt: endIn(-1), subscriptionEndsAt: null },
    ];
    const invoices = [
      { id: 'i1', companyId: 'a14', dueDate: '2026-10-24' }, // 1 day overdue
      { id: 'i7', companyId: 'a14', dueDate: '2026-10-18' }, // 7 days
      { id: 'i3', companyId: 'a14', dueDate: '2026-10-22' }, // 3 days ∉ list
      { id: 'i0', companyId: 'a14', dueDate: '2026-10-25' }, // due today: not overdue
    ];
    const r = selectReminders({ companies, invoices, settings, now });
    expect(r).toEqual([
      { type: 'TRIAL_ENDING', companyId: 't7', daysLeft: 7, endDay: '2026-11-01', dedupeKey: 'TRIAL_ENDING:t7:2026-11-01:7' },
      { type: 'TRIAL_ENDING', companyId: 't3', daysLeft: 3, endDay: '2026-10-28', dedupeKey: 'TRIAL_ENDING:t3:2026-10-28:3' },
      { type: 'SUBSCRIPTION_ENDING', companyId: 'a14', daysLeft: 14, endDay: '2026-11-08', dedupeKey: 'SUBSCRIPTION_ENDING:a14:2026-11-08:14' },
      { type: 'SUBSCRIPTION_ENDING', companyId: 'a1', daysLeft: 1, endDay: '2026-10-26', dedupeKey: 'SUBSCRIPTION_ENDING:a1:2026-10-26:1' },
      { type: 'INVOICE_OVERDUE', companyId: 'a14', invoiceId: 'i1', daysOverdue: 1, dedupeKey: 'INVOICE_OVERDUE:i1:1' },
      { type: 'INVOICE_OVERDUE', companyId: 'a14', invoiceId: 'i7', daysOverdue: 7, dedupeKey: 'INVOICE_OVERDUE:i7:7' },
    ]);
  });

  it('respects custom day lists and the master switch', () => {
    const companies = [{ id: 't5', status: 'TRIAL' as const, trialEndsAt: endIn(5), subscriptionEndsAt: null }];
    expect(selectReminders({ companies, invoices: [], settings: { ...settings, trialDays: [5] }, now })).toHaveLength(1);
    expect(selectReminders({ companies, invoices: [], settings: { ...settings, trialDays: [5], enabled: false }, now })).toEqual([]);
  });
});
