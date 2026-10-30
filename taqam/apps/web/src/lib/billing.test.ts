import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BILLING, DEFAULT_REMINDERS, billingSettingsError, billingSettingsErrorAr, computeInvoice, cycleMonths, daysBetween, decodeZatcaTlv,
  defaultBilledEmployees, formatDocNumber, formatInvoiceNumber, hasAtMost2Decimals, isOutstanding, isOverdue, isStrictDay, isValidSaIban, isValidTrn,
  money2, nextPeriodStart, periodAnchor, periodEnd, periodStartInWindow, periodsOverlap, remindersSettingsError, selectReminders, takeDocNumber, vatGate, zatcaTlv,
} from './billing';

describe('invoice numbers', () => {
  it('formats SH-<year>-<4-digit sequence>', () => {
    expect(formatInvoiceNumber(2026, 7)).toBe('SH-2026-0007');
    expect(formatInvoiceNumber(2027, 1234)).toBe('SH-2027-1234');
  });
  it('takes numbers from a per-year, per-series counter that never goes back', () => {
    const counters: Record<string, number> = { 'SH-2026': 3, 'SH-2025': 42 };
    expect(takeDocNumber(counters, 'SH', 2026)).toBe('SH-2026-0004');
    expect(takeDocNumber(counters, 'SH', 2025)).toBe('SH-2025-0043');
    expect(takeDocNumber(counters, 'SH', 2027)).toBe('SH-2027-0001');
    expect(takeDocNumber(counters, 'SHC', 2026)).toBe('SHC-2026-0001');
    expect(takeDocNumber(counters, 'SH', 2026)).toBe('SH-2026-0005');
    expect(counters).toEqual({ 'SH-2026': 5, 'SH-2025': 43, 'SH-2027': 1, 'SHC-2026': 1 });
    expect(formatDocNumber('SHC', 2026, 12)).toBe('SHC-2026-0012');
  });
});

describe('periods', () => {
  it('maps the billing cycle to months', () => {
    expect(cycleMonths('MONTHLY')).toBe(1);
    expect(cycleMonths('ANNUAL')).toBe(12);
  });
  it('periodEnd = periodStart + months − 1 day', () => {
    expect(periodEnd('2026-10-01', 1)).toBe('2026-10-31');
    expect(periodEnd('2026-02-01', 1)).toBe('2026-02-28');
    expect(periodEnd('2026-10-15', 1)).toBe('2026-11-14');
    expect(periodEnd('2026-01-01', 12)).toBe('2026-12-31');
    expect(periodEnd('2026-03-10', 12)).toBe('2027-03-09');
  });
  it('anchors month-end starts: a clamped month ends on its last day; the anchor is carried over', () => {
    expect(periodEnd('2026-01-31', 1)).toBe('2026-02-28');
    expect(periodEnd('2026-03-01', 1, 31)).toBe('2026-03-30');
    expect(periodEnd('2026-03-31', 1, 31)).toBe('2026-04-30');
    expect(periodEnd('2026-03-01', 1)).toBe('2026-03-31');
    expect(periodEnd('2026-03-31', 1)).toBe('2026-04-30');
    const chain = [{ status: 'PAID' as const, periodStart: '2026-01-31', periodEnd: '2026-02-28' }, { status: 'PAID' as const, periodStart: '2026-03-01', periodEnd: '2026-03-30' }];
    expect(periodAnchor(chain, '2026-03-01')).toBe(31);
    expect(periodAnchor(chain, '2026-03-31')).toBe(31);
    expect(periodAnchor(chain, '2026-05-10')).toBe(10);
    expect(periodAnchor([{ status: 'CREDITED', periodStart: '2026-01-31', periodEnd: '2026-02-28' }], '2026-03-01')).toBe(1);
    expect(periodEnd('2028-01-30', 1)).toBe('2028-02-29');
    expect(periodEnd('2028-02-29', 12)).toBe('2029-02-28');
    expect(periodEnd('2026-01-31', 12)).toBe('2027-01-30');
  });
  it('counts calendar days between two days', () => {
    expect(daysBetween('2026-10-20', '2026-10-25')).toBe(5);
    expect(daysBetween('2026-10-25', '2026-10-20')).toBe(-5);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
  it('next period starts the day after the latest covering invoice (credited and credit notes ignored), else today', () => {
    const invoices = [
      { status: 'PAID' as const, periodEnd: '2026-08-31' },
      { status: 'ISSUED' as const, periodEnd: '2026-09-30' },
      { status: 'CREDITED' as const, periodEnd: '2026-12-31' },
      { status: 'ISSUED' as const, periodEnd: '2027-01-31', documentType: 'CREDIT_NOTE' as const },
    ];
    expect(nextPeriodStart(invoices, '2026-10-25')).toBe('2026-10-01');
    expect(nextPeriodStart([{ status: 'CREDITED', periodEnd: '2026-12-31' }], '2026-10-25')).toBe('2026-10-25');
    expect(nextPeriodStart([], '2026-10-25')).toBe('2026-10-25');
  });
  it('an EXPIRED company never defaults to a start in the past', () => {
    const invoices = [{ status: 'PAID' as const, periodEnd: '2026-06-30' }];
    expect(nextPeriodStart(invoices, '2026-10-25', { expired: true })).toBe('2026-10-25');
    expect(nextPeriodStart(invoices, '2026-10-25')).toBe('2026-07-01');
    expect(nextPeriodStart([{ status: 'PAID', periodEnd: '2026-11-30' }], '2026-10-25', { expired: true })).toBe('2026-12-01');
  });
  it('detects overlapping periods and the allowed start window', () => {
    expect(periodsOverlap({ periodStart: '2026-10-01', periodEnd: '2026-10-31' }, { periodStart: '2026-10-31', periodEnd: '2026-11-30' })).toBe(true);
    expect(periodsOverlap({ periodStart: '2026-10-01', periodEnd: '2026-10-31' }, { periodStart: '2026-11-01', periodEnd: '2026-11-30' })).toBe(false);
    expect(periodStartInWindow('2026-08-26', '2026-10-25')).toBe(true);
    expect(periodStartInWindow('2026-08-25', '2026-10-25')).toBe(false);
    expect(periodStartInWindow('2027-01-23', '2026-10-25')).toBe(true);
    expect(periodStartInWindow('2027-01-24', '2026-10-25')).toBe(false);
  });
});

describe('computeInvoice', () => {
  it('monthly: employees × price, no discount, VAT 15%', () => {
    expect(computeInvoice({ employees: 41, unitPrice: 29, billingCycle: 'MONTHLY', annualDiscount: 0.15, vatRate: 0.15 })).toEqual({
      months: 1, subtotal: 1189, discountRate: 0, discount: 0, taxable: 1189, vatRate: 0.15, vat: 178.35, total: 1367.35,
    });
  });
  it('annual: × 12 months with the annual discount', () => {
    const r = computeInvoice({ employees: 12, unitPrice: 22, billingCycle: 'ANNUAL', annualDiscount: 0.15, vatRate: 0.15 });
    expect(r).toEqual({ months: 12, subtotal: 3168, discountRate: 0.15, discount: 475.2, taxable: 2692.8, vatRate: 0.15, vat: 403.92, total: 3096.72 });
  });
  it('cleans float noise before rounding (683.3 × 0.15 → 102.5)', () => {
    expect(money2(683.3 * 0.15)).toBe(102.5);
    expect(computeInvoice({ employees: 1, unitPrice: 683.3, billingCycle: 'MONTHLY', annualDiscount: 0, vatRate: 0.15 }).vat).toBe(102.5);
  });
  it('rounds money to 2 decimals', () => {
    const r = computeInvoice({ employees: 3, unitPrice: 19.99, billingCycle: 'MONTHLY', annualDiscount: 0.15, vatRate: 0.15 });
    expect(r.subtotal).toBe(59.97);
    expect(r.vat).toBe(9);
    expect(r.total).toBe(68.97);
  });
});

describe('isOverdue', () => {
  it('is true only for ISSUED invoices whose due date has passed', () => {
    expect(isOverdue({ status: 'ISSUED', dueDate: '2026-10-24' }, '2026-10-25')).toBe(true);
    expect(isOverdue({ status: 'ISSUED', dueDate: '2026-10-25' }, '2026-10-25')).toBe(false);
    expect(isOverdue({ status: 'PAID', dueDate: '2026-10-01' }, '2026-10-25')).toBe(false);
    expect(isOverdue({ status: 'CREDITED', dueDate: '2026-10-01' }, '2026-10-25')).toBe(false);
    expect(isOverdue({ status: 'ISSUED', dueDate: '2026-10-01', documentType: 'CREDIT_NOTE' }, '2026-10-25')).toBe(false);
  });
  it('credit notes never count as outstanding', () => {
    expect(isOutstanding({ status: 'ISSUED', documentType: 'TAX_INVOICE' })).toBe(true);
    expect(isOutstanding({ status: 'ISSUED', documentType: 'CREDIT_NOTE' })).toBe(false);
    expect(isOutstanding({ status: 'CREDITED' })).toBe(false);
  });
});

describe('VAT registration, IBAN and input validators', () => {
  it('accepts only Saudi TRNs: 15 digits starting and ending with 3', () => {
    expect(isValidTrn('311987654300003')).toBe(true);
    expect(isValidTrn('300000000000003')).toBe(true);
    expect(isValidTrn('31198765430000')).toBe(false); // 14 digits
    expect(isValidTrn('211987654300003')).toBe(false);
    expect(isValidTrn('311987654300004')).toBe(false);
    expect(isValidTrn('3119876543000a3')).toBe(false);
    expect(isValidTrn('')).toBe(false);
  });
  it('gates VAT on registration: unregistered sellers issue a plain invoice with VAT 0', () => {
    expect(vatGate({ sellerVatNumber: '311987654300003', vatRate: 0.15 })).toEqual({ documentType: 'TAX_INVOICE', vatRate: 0.15 });
    expect(vatGate({ sellerVatNumber: '', vatRate: 0.15 })).toEqual({ documentType: 'INVOICE', vatRate: 0 });
  });
  it('validates Saudi IBANs (SA + 22 digits)', () => {
    expect(isValidSaIban('SA4480000123608016123456')).toBe(true);
    expect(isValidSaIban('sa44 8000 0123 6080 1612 3456')).toBe(true);
    expect(isValidSaIban('SA448000012360801612345')).toBe(false);
    expect(isValidSaIban('AE070331234567890123456')).toBe(false);
  });
  it('strict YYYY-MM-DD days only', () => {
    expect(isStrictDay('2026-10-29')).toBe(true);
    expect(isStrictDay('2026-02-30')).toBe(false);
    expect(isStrictDay('2026-10-29T10:00:00Z')).toBe(false);
    expect(isStrictDay('29/10/2026')).toBe(false);
    expect(isStrictDay(20261029)).toBe(false);
  });
  it('money inputs have at most 2 decimals', () => {
    expect(hasAtMost2Decimals(19.99)).toBe(true);
    expect(hasAtMost2Decimals(0.1 + 0.2)).toBe(true);
    expect(hasAtMost2Decimals(19.995)).toBe(false);
  });
  it('bills at least minBilledEmployees on ESSENTIALS/GROWTH, actual seats on ENTERPRISE', () => {
    expect(defaultBilledEmployees('GROWTH', 4)).toBe(10);
    expect(defaultBilledEmployees('ESSENTIALS', 41, 10)).toBe(41);
    expect(defaultBilledEmployees('ENTERPRISE', 4)).toBe(4);
    expect(defaultBilledEmployees('ENTERPRISE', 0)).toBe(1);
    expect(defaultBilledEmployees('GROWTH', 0, 0)).toBe(1);
  });
});

describe('ZATCA Phase-1 QR (TLV, base64)', () => {
  it('matches the published ZATCA sample vector', () => {
    expect(zatcaTlv({ sellerName: 'Bobs Records', vatNumber: '310122393500003', timestamp: '2022-04-25T15:30:00Z', total: 1000, vat: 150 }))
      .toBe('AQxCb2JzIFJlY29yZHMCDzMxMDEyMjM5MzUwMDAwMwMUMjAyMi0wNC0yNVQxNTozMDowMFoEBzEwMDAuMDAFBjE1MC4wMA==');
  });
  it('encodes Arabic seller names as UTF-8 byte lengths and amounts with 2 decimals', () => {
    const qr = zatcaTlv({ sellerName: 'شؤون لتقنية المعلومات', vatNumber: '311987654300003', timestamp: '2026-10-29T06:30:00.000Z', total: 1334, vat: 174 });
    expect(qr).toBe('ASjYtNik2YjZhiDZhNiq2YLZhtmK2Kkg2KfZhNmF2LnZhNmI2YXYp9iqAg8zMTE5ODc2NTQzMDAwMDMDGDIwMjYtMTAtMjlUMDY6MzA6MDAuMDAwWgQHMTMzNC4wMAUGMTc0LjAw');
    expect(decodeZatcaTlv(qr)).toEqual({ 1: 'شؤون لتقنية المعلومات', 2: '311987654300003', 3: '2026-10-29T06:30:00.000Z', 4: '1334.00', 5: '174.00' });
  });
});

describe('settings validation', () => {
  it('accepts the defaults and partial patches', () => {
    expect(billingSettingsError(DEFAULT_BILLING)).toBeNull();
    expect(billingSettingsError({ vatRate: 0, invoiceDueDays: 90 })).toBeNull();
    expect(remindersSettingsError(DEFAULT_REMINDERS)).toBeNull();
    expect(remindersSettingsError({ trialDays: [] })).toBeNull();
  });
  it('rejects out-of-range values', () => {
    expect(billingSettingsError({ vatRate: 1.5 })).toMatch(/vatRate/);
    expect(billingSettingsError({ invoiceDueDays: 91 })).toMatch(/invoiceDueDays/);
    expect(billingSettingsError({ invoiceDueDays: 2.5 })).toMatch(/invoiceDueDays/);
    expect(billingSettingsError({ sellerName: 5 })).toMatch(/sellerName/);
    expect(billingSettingsError({ minBilledEmployees: 0 })).toMatch(/minBilledEmployees/);
    expect(billingSettingsError({ minBilledEmployees: 10 })).toBeNull();
    const trn = billingSettingsError({ sellerVatNumber: '12345' });
    expect(trn).toMatch(/sellerVatNumber/);
    expect(billingSettingsErrorAr(trn!)).toBe('الرقم الضريبي يجب أن يكون 15 رقماً يبدأ وينتهي بالرقم 3');
    expect(billingSettingsError({ sellerVatNumber: '' })).toBeNull();
    expect(billingSettingsError({ sellerVatNumber: '311987654300003' })).toBeNull();
    expect(remindersSettingsError({ trialDays: [1, 2, 3, 4, 5, 6, 7] })).toMatch(/trialDays/);
    expect(remindersSettingsError({ subscriptionDays: [61] })).toMatch(/subscriptionDays/);
    expect(remindersSettingsError({ overdueInvoiceDays: [1.5] })).toMatch(/overdueInvoiceDays/);
    expect(remindersSettingsError({ enabled: 'yes' })).toMatch(/enabled/);
  });
});

describe('selectReminders', () => {
  const today = '2026-10-25';
  const companies = [
    { id: 'c1', status: 'TRIAL' as const, trialEndsAt: '2026-10-28', subscriptionEndsAt: null },      // 3 days → TRIAL_ENDING
    { id: 'c2', status: 'TRIAL' as const, trialEndsAt: '2026-10-30', subscriptionEndsAt: null },      // 5 days → catch-up of the 7-day point
    { id: 'c6', status: 'TRIAL' as const, trialEndsAt: '2026-11-25', subscriptionEndsAt: null },      // 31 days → nothing yet
    { id: 'c3', status: 'ACTIVE' as const, trialEndsAt: null, subscriptionEndsAt: '2026-11-08' },     // 14 days → SUBSCRIPTION_ENDING
    { id: 'c4', status: 'ACTIVE' as const, trialEndsAt: null, subscriptionEndsAt: null },             // open-ended → nothing
    { id: 'c5', status: 'SUSPENDED' as const, trialEndsAt: '2026-10-26', subscriptionEndsAt: null },  // not TRIAL → nothing
  ];
  const invoices = [
    { id: 'i1', companyId: 'c3', status: 'ISSUED' as const, dueDate: '2026-10-18' }, // 7 days overdue
    { id: 'i2', companyId: 'c3', status: 'ISSUED' as const, dueDate: '2026-10-24' }, // 1 day
    { id: 'i3', companyId: 'c3', status: 'ISSUED' as const, dueDate: '2026-10-22' }, // 3 days → catch-up of the 1-day point
    { id: 'i4', companyId: 'c3', status: 'PAID' as const, dueDate: '2026-10-24' },
    { id: 'i5', companyId: 'c3', status: 'ISSUED' as const, dueDate: '2026-10-01', documentType: 'CREDIT_NOTE' as const }, // never
  ];
  it('picks trials, subscriptions and overdue invoices with catch-up; the dedupe key uses the threshold', () => {
    expect(selectReminders(companies, invoices, DEFAULT_REMINDERS, today)).toEqual([
      { type: 'TRIAL_ENDING', companyId: 'c1', invoiceId: null, days: 3, threshold: 3, dedupeKey: 'TRIAL_ENDING:c1:2026-10-28:3' },
      { type: 'TRIAL_ENDING', companyId: 'c2', invoiceId: null, days: 5, threshold: 7, dedupeKey: 'TRIAL_ENDING:c2:2026-10-30:7' },
      { type: 'SUBSCRIPTION_ENDING', companyId: 'c3', invoiceId: null, days: 14, threshold: 14, dedupeKey: 'SUBSCRIPTION_ENDING:c3:2026-11-08:14' },
      { type: 'INVOICE_OVERDUE', companyId: 'c3', invoiceId: 'i1', days: 7, threshold: 7, dedupeKey: 'INVOICE_OVERDUE:i1:7' },
      { type: 'INVOICE_OVERDUE', companyId: 'c3', invoiceId: 'i2', days: 1, threshold: 1, dedupeKey: 'INVOICE_OVERDUE:i2:1' },
      { type: 'INVOICE_OVERDUE', companyId: 'c3', invoiceId: 'i3', days: 3, threshold: 1, dedupeKey: 'INVOICE_OVERDUE:i3:1' },
    ]);
  });
  it('returns nothing when reminders are disabled', () => {
    expect(selectReminders(companies, invoices, { ...DEFAULT_REMINDERS, enabled: false }, today)).toEqual([]);
  });
});
