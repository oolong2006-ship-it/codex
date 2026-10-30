// Types + labels for the platform admin portal (docs/ADMIN_PORTAL.md).
import type { Tone } from '@/components/ui/Badge';
import type { BillingSettings, DocumentType, ReminderSettings } from '@/lib/billing';

export type { BillingSettings, DocumentType, ReminderSettings };

export type CompanyStatus = 'PENDING' | 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
export type Plan = 'ESSENTIALS' | 'GROWTH' | 'ENTERPRISE';
export type BillingCycle = 'MONTHLY' | 'ANNUAL';
export type CompanyEventType =
  | 'REGISTERED' | 'ACTIVATED' | 'SUSPENDED' | 'REACTIVATED' | 'PLAN_CHANGED' | 'EXTENDED' | 'NOTE' | 'IMPERSONATED' | 'EXPIRED' | 'DELETED'
  | 'INVOICE_ISSUED' | 'INVOICE_PAID' | 'INVOICE_VOIDED' | 'INVOICE_CREDITED' | 'REMINDER_SENT';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'CONVERTED' | 'LOST';
export type BroadcastTarget = 'ALL' | 'ACTIVE' | 'TRIAL';

export interface AdminCompany {
  id: string; nameAr: string; nameEn: string | null; sector: string | null; city: string | null; crNumber: string | null;
  status: CompanyStatus; plan: Plan; billingCycle: BillingCycle;
  maxEmployees: number | null; pricePerEmployee: number | null; effectivePrice: number | null;
  employeesCount: number; activeEmployees: number; usersCount: number; branchesCount: number; mrr: number;
  trialEndsAt: string | null; subscriptionEndsAt: string | null; daysLeft: number | null;
  activatedAt: string | null; suspendedAt: string | null; suspensionReason: string | null; adminNotes: string | null;
  ownerName: string | null; ownerEmail: string | null; ownerPhone: string | null;
  lastActivityAt: string | null; createdAt: string;
}

export interface CompanyEvent {
  id: string; companyId: string; type: CompanyEventType; fromStatus: CompanyStatus | null; toStatus: CompanyStatus | null;
  data: Record<string, unknown> | null; adminId: string | null; adminName: string | null; createdAt: string;
  /** Some API builds include the company name on the platform log. */
  companyName?: string | null; company?: { id: string; nameAr: string; nameEn?: string | null } | null;
}

export interface AdminCompanyUser { id: string; name: string; email: string; role: string; isActive: boolean; lastLoginAt: string | null }

export interface AdminCompanyDetail extends AdminCompany {
  owner: { id: string; name: string; email: string; phone?: string | null } | null;
  users: AdminCompanyUser[];
  usage: {
    employees: number; activeEmployees: number; branches: number; users: number; payrollRuns: number;
    lastPayrollPeriod: string | null; leaveRequests30d: number; checkIns30d: number;
  };
  events: CompanyEvent[];
  /** v2 billing: latest 20 of each. */
  invoices?: Invoice[];
  emails?: EmailLog[];
}

// ---------- billing (v2) ----------
export type InvoiceStatus = 'ISSUED' | 'PAID' | 'CREDITED';
export type PaymentMethod = 'BANK_TRANSFER' | 'CARD' | 'CASH' | 'OTHER';
/** v2.1 seller snapshot stored on the invoice at issue. */
export interface SellerSnapshot {
  name: string; nameEn: string | null; vatNumber: string | null; crNumber: string | null; address: string | null; email: string | null; phone: string | null;
  bankName: string | null; iban: string | null;
}
/** v2.1 buyer snapshot stored on the invoice at issue. */
export interface BuyerSnapshot { nameAr: string; nameEn: string | null; vatNumber: string | null; crNumber: string | null; address: string | null; city: string | null }
export interface Invoice {
  id: string; number: string; documentType: DocumentType; companyId: string; companyName: string; status: InvoiceStatus; overdue: boolean;
  plan: Plan; billingCycle: BillingCycle; periodStart: string; periodEnd: string; months: number; employees: number; unitPrice: number;
  subtotal: number; discountRate: number; discount: number; taxable: number; vatRate: number; vat: number; total: number;
  issueDate: string; issuedAt: string; dueDate: string; paidAt: string | null; paymentMethod: PaymentMethod | null; paymentRef: string | null;
  notes: string | null; createdByName: string | null; createdAt: string;
  /** Documents render only from these snapshots (v2.1). */
  seller: SellerSnapshot; buyer: BuyerSnapshot;
  creditsInvoiceId: string | null; creditsNumber: string | null; creditedByNumber: string | null; reason: string | null;
  /** ZATCA Phase-1 TLV (base64) — tax invoices and credit notes of tax invoices, else null. */
  qr: string | null;
}
export interface InvoiceDetail extends Invoice {
  /** Live company (links and contact only — the document uses `buyer`). */
  company: { id: string; nameAr: string; nameEn: string | null; crNumber: string | null; vatNumber: string | null; city: string | null; ownerName: string | null; ownerEmail: string | null; ownerPhone: string | null };
}
export interface InvoiceSummary { outstanding: { count: number; amount: number }; overdue: { count: number; amount: number }; paidThisMonth: { count: number; amount: number } }
export type EmailType = 'TRIAL_ENDING' | 'SUBSCRIPTION_ENDING' | 'EXPIRED' | 'INVOICE_ISSUED' | 'PAYMENT_RECEIVED' | 'INVOICE_OVERDUE' | 'MANUAL_REMINDER';
export type EmailStatus = 'SENT' | 'FAILED' | 'LOGGED';
export interface EmailLog {
  id: string; companyId: string | null; to: string; subject: string; body: string; type: EmailType; status: EmailStatus; error: string | null; createdAt: string;
  companyName?: string | null;
}
export interface BillingSubscription {
  status: CompanyStatus; plan: Plan; billingCycle: BillingCycle; effectivePrice: number | null; maxEmployees: number | null;
  activeEmployees: number; trialEndsAt: string | null; subscriptionEndsAt: string | null; daysLeft: number | null;
  /** Unpaid invoices of the whole account (may be missing on an API that doesn't send it — the page then computes it). */
  outstanding?: { count: number; amount: number };
  overdue?: { count: number; amount: number };
}

export interface AdminOverview {
  companies: { total: number; pending: number; trial: number; active: number; suspended: number; expired: number };
  employees: number; users: number; mrr: number; arr: number;
  signupsByMonth: { period: string; count: number }[];
  mrrByPlan: { plan: Plan; mrr: number; companies: number }[];
  expiringSoon: AdminCompany[];
  recentSignups: AdminCompany[];
  newLeads: number;
}

export interface Lead {
  id: string; name: string; company: string | null; email: string | null; phone: string | null; employeesCount: number | null;
  sector: string | null; message: string | null; status: LeadStatus; notes: string | null; createdAt: string;
}

export interface PlatformAdmin { id: string; name: string; email: string; isActive: boolean; lastLoginAt: string | null; createdAt: string }

export interface PlatformSettings {
  requireApproval: boolean; trialDays: number;
  prices: { ESSENTIALS: number | null; GROWTH: number | null; ENTERPRISE: number | null };
  annualDiscount: number;
  /** v2 — may be missing on an older API. */
  billing?: BillingSettings;
  reminders?: ReminderSettings;
}

export interface ActivateBody {
  plan: Plan; billingCycle: BillingCycle; maxEmployees?: number | null; pricePerEmployee?: number | null;
  mode: 'TRIAL' | 'PAID'; trialDays?: number; subscriptionEndsAt?: string | null;
}

// ---------- labels ----------
type L = Record<string, [ar: string, en: string]>;
export const COMPANY_STATUS: L = {
  PENDING: ['بانتظار الموافقة', 'Pending'], TRIAL: ['تجريبي', 'Trial'], ACTIVE: ['نشط', 'Active'],
  SUSPENDED: ['موقوف', 'Suspended'], EXPIRED: ['منتهي', 'Expired'],
};
export const PLAN: L = { ESSENTIALS: ['الأساسية', 'Essentials'], GROWTH: ['النمو', 'Growth'], ENTERPRISE: ['المؤسسات', 'Enterprise'] };
export const BILLING_CYCLE: L = { MONTHLY: ['شهري', 'Monthly'], ANNUAL: ['سنوي', 'Annual'] };
export const EVENT_TYPE: L = {
  REGISTERED: ['تسجيل منشأة', 'Registered'], ACTIVATED: ['تفعيل', 'Activated'], SUSPENDED: ['إيقاف', 'Suspended'],
  REACTIVATED: ['إعادة تفعيل', 'Reactivated'], PLAN_CHANGED: ['تغيير الباقة', 'Plan changed'], EXTENDED: ['تمديد', 'Extended'],
  NOTE: ['ملاحظة', 'Note'], IMPERSONATED: ['دخول كمالك المنشأة', 'Impersonated'], EXPIRED: ['انتهاء الاشتراك', 'Expired'], DELETED: ['حذف', 'Deleted'],
  INVOICE_ISSUED: ['إصدار فاتورة', 'Invoice issued'], INVOICE_PAID: ['سداد فاتورة', 'Invoice paid'], INVOICE_VOIDED: ['إلغاء فاتورة', 'Invoice voided'],
  INVOICE_CREDITED: ['إشعار دائن', 'Credit note issued'],
  REMINDER_SENT: ['إرسال تذكير', 'Reminder sent'],
};
export const INVOICE_STATUS: L = { ISSUED: ['مستحقة', 'Issued'], PAID: ['مدفوعة', 'Paid'], CREDITED: ['صدر لها إشعار دائن', 'Credited'] };
export const DOCUMENT_TYPE: L = { TAX_INVOICE: ['فاتورة ضريبية', 'Tax invoice'], INVOICE: ['فاتورة', 'Invoice'], CREDIT_NOTE: ['إشعار دائن', 'Credit note'] };
export const PAYMENT_METHOD: L = { BANK_TRANSFER: ['تحويل بنكي', 'Bank transfer'], CARD: ['بطاقة', 'Card'], CASH: ['نقداً', 'Cash'], OTHER: ['أخرى', 'Other'] };
export const EMAIL_TYPE: L = {
  TRIAL_ENDING: ['قرب انتهاء التجربة', 'Trial ending'], SUBSCRIPTION_ENDING: ['قرب انتهاء الاشتراك', 'Subscription ending'],
  EXPIRED: ['انتهاء الاشتراك', 'Expired'], INVOICE_ISSUED: ['فاتورة جديدة', 'Invoice issued'], PAYMENT_RECEIVED: ['استلام دفعة', 'Payment received'],
  INVOICE_OVERDUE: ['فاتورة متأخرة', 'Invoice overdue'], MANUAL_REMINDER: ['تذكير يدوي', 'Manual reminder'],
};
export const EMAIL_STATUS: L = { SENT: ['أُرسلت', 'Sent'], FAILED: ['فشل الإرسال', 'Failed'], LOGGED: ['محفوظة (لم تُرسل)', 'Logged (not sent)'] };
export const INVOICE_TONE: Record<InvoiceStatus, Tone> = { ISSUED: 'warning', PAID: 'success', CREDITED: 'neutral' };
export const EMAIL_STATUS_TONE: Record<EmailStatus, Tone> = { SENT: 'success', FAILED: 'danger', LOGGED: 'info' };
export const EMAIL_TYPE_TONE: Record<EmailType, Tone> = {
  TRIAL_ENDING: 'info', SUBSCRIPTION_ENDING: 'warning', EXPIRED: 'neutral', INVOICE_ISSUED: 'primary', PAYMENT_RECEIVED: 'success', INVOICE_OVERDUE: 'danger', MANUAL_REMINDER: 'accent',
};
export const INVOICE_STATUSES: InvoiceStatus[] = ['ISSUED', 'PAID', 'CREDITED'];
export const PAYMENT_METHODS: PaymentMethod[] = ['BANK_TRANSFER', 'CARD', 'CASH', 'OTHER'];
export const EMAIL_TYPES = Object.keys(EMAIL_TYPE) as EmailType[];
export const EMAIL_STATUSES: EmailStatus[] = ['SENT', 'FAILED', 'LOGGED'];
export const LEAD_STATUS: L = { NEW: ['جديد', 'New'], CONTACTED: ['تم التواصل', 'Contacted'], CONVERTED: ['تحوّل لعميل', 'Converted'], LOST: ['خسارة', 'Lost'] };
export const BROADCAST_TARGET: L = { ALL: ['جميع المنشآت', 'All companies'], ACTIVE: ['المنشآت النشطة', 'Active companies'], TRIAL: ['المنشآت التجريبية', 'Trial companies'] };

export const COMPANY_STATUSES: CompanyStatus[] = ['PENDING', 'TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED'];
export const PLANS: Plan[] = ['ESSENTIALS', 'GROWTH', 'ENTERPRISE'];
export const LEAD_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'CONVERTED', 'LOST'];
export const EVENT_TYPES = Object.keys(EVENT_TYPE) as CompanyEventType[];

export const STATUS_TONE: Record<CompanyStatus, Tone> = { PENDING: 'warning', TRIAL: 'info', ACTIVE: 'success', SUSPENDED: 'danger', EXPIRED: 'neutral' };
export const LEAD_TONE: Record<LeadStatus, Tone> = { NEW: 'accent', CONTACTED: 'info', CONVERTED: 'success', LOST: 'neutral' };
export const EVENT_TONE: Record<CompanyEventType, Tone> = {
  REGISTERED: 'primary', ACTIVATED: 'success', SUSPENDED: 'danger', REACTIVATED: 'success', PLAN_CHANGED: 'accent', EXTENDED: 'info',
  NOTE: 'neutral', IMPERSONATED: 'warning', EXPIRED: 'neutral', DELETED: 'danger',
  INVOICE_ISSUED: 'primary', INVOICE_PAID: 'success', INVOICE_VOIDED: 'neutral', INVOICE_CREDITED: 'neutral', REMINDER_SENT: 'info',
};
/** Chart colours per plan. */
export const PLAN_COLOR: Record<Plan, string> = { ESSENTIALS: '#7DD3FC', GROWTH: '#0E7490', ENTERPRISE: '#14D1C3' };
/** Default list prices if settings are unavailable. */
export const DEFAULT_PRICES: Record<Plan, number | null> = { ESSENTIALS: 19, GROWTH: 29, ENTERPRISE: null };

export function lbl(map: L, key: string | null | undefined, lang: 'ar' | 'en') {
  if (!key) return '—';
  const v = map[key];
  return v ? (lang === 'ar' ? v[0] : v[1]) : key;
}
export function companyName(c: { nameAr: string; nameEn?: string | null } | null | undefined, lang: 'ar' | 'en') {
  if (!c) return '—';
  return lang === 'en' ? c.nameEn || c.nameAr : c.nameAr;
}

/** localStorage key holding the platform admin's token while impersonating a company owner. */
export { ADMIN_TOKEN_KEY } from './api';
