// Types + labels for the platform admin portal (docs/ADMIN_PORTAL.md).
import type { Tone } from '@/components/ui/Badge';

export type CompanyStatus = 'PENDING' | 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
export type Plan = 'ESSENTIALS' | 'GROWTH' | 'ENTERPRISE';
export type BillingCycle = 'MONTHLY' | 'ANNUAL';
export type CompanyEventType =
  | 'REGISTERED' | 'ACTIVATED' | 'SUSPENDED' | 'REACTIVATED' | 'PLAN_CHANGED' | 'EXTENDED' | 'NOTE' | 'IMPERSONATED' | 'EXPIRED' | 'DELETED';
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
};
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
export const ADMIN_TOKEN_KEY = 'taqam.adminToken';
