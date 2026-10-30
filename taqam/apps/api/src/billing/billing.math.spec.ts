import {
  addMonthsClamped,
  computeInvoice,
  daysBetween,
  dedupeKey,
  DEFAULT_BILLING,
  DEFAULT_REMINDERS,
  mergeBilling,
  mergeReminders,
  periodEndOf,
  selectReminders,
  addDaysStr,
  anchorDayFor,
  isValidTrn,
  zatcaQr,
  MAX_INVOICE_TOTAL,
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
  it('addMonthsClamped clamps to the shorter month', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
  });
  it('v2.1: a clamped month ends on its last day (Jan 31 → Feb 28), then the anchor day is kept', () => {
    expect(periodEndOf('2026-01-31', 1)).toBe('2026-02-28');
    // continuing with anchor 31: Mar 1 → Mar 30, Mar 31 → Apr 30, May 1 → May 30
    expect(periodEndOf('2026-03-01', 1, 31)).toBe('2026-03-30');
    expect(periodEndOf('2026-03-31', 1, 31)).toBe('2026-04-30');
    expect(periodEndOf('2026-05-01', 1, 31)).toBe('2026-05-30');
    expect(periodEndOf('2026-03-31', 1)).toBe('2026-04-30');
    expect(periodEndOf('2026-01-30', 1)).toBe('2026-02-28');
    expect(periodEndOf('2026-03-01', 1, 30)).toBe('2026-03-29');
  });
  it('v2.1: no drift — 12 consecutive monthly periods from Jan 31 start on the 31st or the 1st after a short month', () => {
    let start = '2026-01-31';
    const starts: string[] = [];
    for (let k = 0; k < 12; k++) {
      starts.push(start);
      start = addDaysStr(periodEndOf(start, 1, 31), 1);
    }
    expect(starts).toEqual([
      '2026-01-31', '2026-03-01', '2026-03-31', '2026-05-01', '2026-05-31', '2026-07-01',
      '2026-07-31', '2026-08-31', '2026-10-01', '2026-10-31', '2026-12-01', '2026-12-31',
    ]);
  });
  it('anchorDayFor carries the anchor across contiguous periods, else uses the start day', () => {
    expect(anchorDayFor('2026-03-01', { periodEnd: '2026-02-28', anchorDay: 31 })).toBe(31);
    expect(anchorDayFor('2026-03-01', { periodEnd: '2026-02-28', anchorDay: null })).toBe(1);
    expect(anchorDayFor('2026-03-05', { periodEnd: '2026-02-28', anchorDay: 31 })).toBe(5);
    expect(anchorDayFor('2026-03-05', null)).toBe(5);
  });
  it('annual = 12 months − 1 day; a leap day clamps to the end of February', () => {
    expect(periodEndOf('2026-01-01', 12)).toBe('2026-12-31');
    expect(periodEndOf('2026-03-15', 12)).toBe('2027-03-14');
    expect(periodEndOf('2028-02-29', 12)).toBe('2029-02-28');
  });
});

describe('v2.1 VAT registration / QR / limits', () => {
  it('isValidTrn: 15 digits starting and ending with 3', () => {
    expect(isValidTrn('300000000000003')).toBe(true);
    expect(isValidTrn('310122393500003')).toBe(true);
    expect(isValidTrn('')).toBe(false);
    expect(isValidTrn('30000000000003')).toBe(false);
    expect(isValidTrn('200000000000003')).toBe(false);
    expect(isValidTrn('300000000000002')).toBe(false);
    expect(isValidTrn('3000000000000a3')).toBe(false);
  });
  it('zatcaQr: base64 TLV of tags 1..5 (UTF-8 lengths)', () => {
    const qr = zatcaQr({ sellerName: 'شؤون', vatNumber: '300000000000003', timestamp: new Date('2026-10-29T10:15:30.123Z'), total: 1334, vat: 174 });
    const buf = Buffer.from(qr, 'base64');
    const tags: Record<number, string> = {};
    for (let i = 0; i < buf.length; ) {
      const t = buf[i];
      const l = buf[i + 1];
      tags[t] = buf.subarray(i + 2, i + 2 + l).toString('utf8');
      i += 2 + l;
    }
    expect(tags).toEqual({ 1: 'شؤون', 2: '300000000000003', 3: '2026-10-29T10:15:30Z', 4: '1334.00', 5: '174.00' });
    expect(buf[1]).toBe(Buffer.byteLength('شؤون', 'utf8'));
  });
  it('MAX_INVOICE_TOTAL is the Decimal(12,2) ceiling', () => {
    expect(MAX_INVOICE_TOTAL).toBe(9999999999.99);
  });
  it('mergeBilling adds minBilledEmployees (default 10)', () => {
    expect(mergeBilling({}).minBilledEmployees).toBe(10);
    expect(mergeBilling({ minBilledEmployees: 3 }).minBilledEmployees).toBe(3);
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

  it('picks TRIAL / ACTIVE companies by the smallest configured threshold ≥ daysLeft (catch-up), and overdue invoices', () => {
    const companies = [
      { id: 't7', status: 'TRIAL' as const, trialEndsAt: endIn(7), subscriptionEndsAt: null },
      { id: 't3', status: 'TRIAL' as const, trialEndsAt: endIn(3), subscriptionEndsAt: null },
      { id: 't5', status: 'TRIAL' as const, trialEndsAt: endIn(5), subscriptionEndsAt: null }, // missed the 7-day run → 7 now
      { id: 't9', status: 'TRIAL' as const, trialEndsAt: endIn(9), subscriptionEndsAt: null }, // above every threshold
      { id: 'a14', status: 'ACTIVE' as const, trialEndsAt: null, subscriptionEndsAt: endIn(14) },
      { id: 'a1', status: 'ACTIVE' as const, trialEndsAt: endIn(1), subscriptionEndsAt: endIn(1) },
      { id: 'a3', status: 'ACTIVE' as const, trialEndsAt: null, subscriptionEndsAt: endIn(3) }, // → 7-day threshold
      { id: 'a0', status: 'ACTIVE' as const, trialEndsAt: null, subscriptionEndsAt: new Date(now.getTime() + 3600000) }, // ends today → 1
      { id: 'open', status: 'ACTIVE' as const, trialEndsAt: null, subscriptionEndsAt: null },
      { id: 's7', status: 'SUSPENDED' as const, trialEndsAt: null, subscriptionEndsAt: endIn(7) },
      { id: 'tPast', status: 'TRIAL' as const, trialEndsAt: endIn(-1), subscriptionEndsAt: null },
    ];
    const invoices = [
      { id: 'i1', companyId: 'a14', dueDate: '2026-10-24' }, // 1 day overdue
      { id: 'i7', companyId: 'a14', dueDate: '2026-10-18' }, // 7 days
      { id: 'i3', companyId: 'a14', dueDate: '2026-10-22' }, // 3 days → largest threshold ≤ 3 = 1
      { id: 'i0', companyId: 'a14', dueDate: '2026-10-25' }, // due today: not overdue
    ];
    const r = selectReminders({ companies, invoices, settings, now });
    expect(r).toEqual([
      { type: 'TRIAL_ENDING', companyId: 't7', daysLeft: 7, threshold: 7, endDay: '2026-11-01', dedupeKey: 'TRIAL_ENDING:t7:2026-11-01:7' },
      { type: 'TRIAL_ENDING', companyId: 't3', daysLeft: 3, threshold: 3, endDay: '2026-10-28', dedupeKey: 'TRIAL_ENDING:t3:2026-10-28:3' },
      { type: 'TRIAL_ENDING', companyId: 't5', daysLeft: 5, threshold: 7, endDay: '2026-10-30', dedupeKey: 'TRIAL_ENDING:t5:2026-10-30:7' },
      { type: 'SUBSCRIPTION_ENDING', companyId: 'a14', daysLeft: 14, threshold: 14, endDay: '2026-11-08', dedupeKey: 'SUBSCRIPTION_ENDING:a14:2026-11-08:14' },
      { type: 'SUBSCRIPTION_ENDING', companyId: 'a1', daysLeft: 1, threshold: 1, endDay: '2026-10-26', dedupeKey: 'SUBSCRIPTION_ENDING:a1:2026-10-26:1' },
      { type: 'SUBSCRIPTION_ENDING', companyId: 'a3', daysLeft: 3, threshold: 7, endDay: '2026-10-28', dedupeKey: 'SUBSCRIPTION_ENDING:a3:2026-10-28:7' },
      { type: 'SUBSCRIPTION_ENDING', companyId: 'a0', daysLeft: 0, threshold: 1, endDay: '2026-10-25', dedupeKey: 'SUBSCRIPTION_ENDING:a0:2026-10-25:1' },
      { type: 'INVOICE_OVERDUE', companyId: 'a14', invoiceId: 'i1', daysOverdue: 1, threshold: 1, dedupeKey: 'INVOICE_OVERDUE:i1:1' },
      { type: 'INVOICE_OVERDUE', companyId: 'a14', invoiceId: 'i7', daysOverdue: 7, threshold: 7, dedupeKey: 'INVOICE_OVERDUE:i7:7' },
      { type: 'INVOICE_OVERDUE', companyId: 'a14', invoiceId: 'i3', daysOverdue: 3, threshold: 1, dedupeKey: 'INVOICE_OVERDUE:i3:1' },
    ]);
  });

  it('respects custom day lists and the master switch', () => {
    const companies = [{ id: 't5', status: 'TRIAL' as const, trialEndsAt: endIn(5), subscriptionEndsAt: null }];
    expect(selectReminders({ companies, invoices: [], settings: { ...settings, trialDays: [5] }, now })).toHaveLength(1);
    expect(selectReminders({ companies, invoices: [], settings: { ...settings, trialDays: [4] }, now })).toHaveLength(0);
    expect(selectReminders({ companies, invoices: [], settings: { ...settings, trialDays: [5], enabled: false }, now })).toEqual([]);
  });
});
