import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BILLING, DEFAULT_REMINDERS, billingSettingsError, computeInvoice, cycleMonths, daysBetween, formatInvoiceNumber,
  isOverdue, money2, nextInvoiceNumber, nextPeriodStart, periodEnd, remindersSettingsError, selectReminders,
} from './billing';

describe('invoice numbers', () => {
  it('formats SH-<year>-<4-digit sequence>', () => {
    expect(formatInvoiceNumber(2026, 7)).toBe('SH-2026-0007');
    expect(formatInvoiceNumber(2027, 1234)).toBe('SH-2027-1234');
  });
  it('continues the per-year sequence and restarts each year', () => {
    const existing = ['SH-2026-0001', 'SH-2026-0003', 'SH-2025-0042'];
    expect(nextInvoiceNumber(existing, 2026)).toBe('SH-2026-0004');
    expect(nextInvoiceNumber(existing, 2025)).toBe('SH-2025-0043');
    expect(nextInvoiceNumber(existing, 2027)).toBe('SH-2027-0001');
    expect(nextInvoiceNumber([], 2026)).toBe('SH-2026-0001');
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
  it('clamps month-end starts instead of overflowing', () => {
    expect(periodEnd('2026-01-31', 1)).toBe('2026-02-27');
  });
  it('counts calendar days between two days', () => {
    expect(daysBetween('2026-10-20', '2026-10-25')).toBe(5);
    expect(daysBetween('2026-10-25', '2026-10-20')).toBe(-5);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
  it('next period starts the day after the latest non-void invoice, else today', () => {
    const invoices = [
      { status: 'PAID' as const, periodEnd: '2026-08-31' },
      { status: 'ISSUED' as const, periodEnd: '2026-09-30' },
      { status: 'VOID' as const, periodEnd: '2026-12-31' },
    ];
    expect(nextPeriodStart(invoices, '2026-10-25')).toBe('2026-10-01');
    expect(nextPeriodStart([{ status: 'VOID', periodEnd: '2026-12-31' }], '2026-10-25')).toBe('2026-10-25');
    expect(nextPeriodStart([], '2026-10-25')).toBe('2026-10-25');
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
    expect(isOverdue({ status: 'VOID', dueDate: '2026-10-01' }, '2026-10-25')).toBe(false);
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
    { id: 'c2', status: 'TRIAL' as const, trialEndsAt: '2026-10-30', subscriptionEndsAt: null },      // 5 days → nothing
    { id: 'c3', status: 'ACTIVE' as const, trialEndsAt: null, subscriptionEndsAt: '2026-11-08' },     // 14 days → SUBSCRIPTION_ENDING
    { id: 'c4', status: 'ACTIVE' as const, trialEndsAt: null, subscriptionEndsAt: null },             // open-ended → nothing
    { id: 'c5', status: 'SUSPENDED' as const, trialEndsAt: '2026-10-26', subscriptionEndsAt: null },  // not TRIAL → nothing
  ];
  const invoices = [
    { id: 'i1', companyId: 'c3', status: 'ISSUED' as const, dueDate: '2026-10-18' }, // 7 days overdue
    { id: 'i2', companyId: 'c3', status: 'ISSUED' as const, dueDate: '2026-10-24' }, // 1 day
    { id: 'i3', companyId: 'c3', status: 'ISSUED' as const, dueDate: '2026-10-22' }, // 3 days → nothing
    { id: 'i4', companyId: 'c3', status: 'PAID' as const, dueDate: '2026-10-24' },
  ];
  it('picks trials, subscriptions and overdue invoices on the configured days with dedupe keys', () => {
    expect(selectReminders(companies, invoices, DEFAULT_REMINDERS, today)).toEqual([
      { type: 'TRIAL_ENDING', companyId: 'c1', invoiceId: null, days: 3, dedupeKey: 'TRIAL_ENDING:c1:2026-10-28:3' },
      { type: 'SUBSCRIPTION_ENDING', companyId: 'c3', invoiceId: null, days: 14, dedupeKey: 'SUBSCRIPTION_ENDING:c3:2026-11-08:14' },
      { type: 'INVOICE_OVERDUE', companyId: 'c3', invoiceId: 'i1', days: 7, dedupeKey: 'INVOICE_OVERDUE:i1:7' },
      { type: 'INVOICE_OVERDUE', companyId: 'c3', invoiceId: 'i2', days: 1, dedupeKey: 'INVOICE_OVERDUE:i2:1' },
    ]);
  });
  it('returns nothing when reminders are disabled', () => {
    expect(selectReminders(companies, invoices, { ...DEFAULT_REMINDERS, enabled: false }, today)).toEqual([]);
  });
});
