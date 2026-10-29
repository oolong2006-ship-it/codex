/**
 * Platform company lifecycle (docs/ADMIN_PORTAL.md): status gate, lazy expiry, seat limit, pricing/MRR,
 * CompanyEvent log and the AdminCompany view shared by the /admin handlers.
 */
import { COMPANY_IDS } from './ids';
import { addDays, r2, riyadhDateTime, todayStr } from './dates';
import { nextId, type Company, type CompanyEvent, type CompanyEventType, type CompanyStatus, type DB, type Plan, type BillingCycle, type LeadStatus } from './db';
import { badRequest, forbiddenCode, unauthorized } from './errors';
import { nowIso, type Services } from './services';
import { expiredDedupeKey } from '@/lib/billing';
import { sendEmail } from './mail';

export const COMPANY_STATUSES: CompanyStatus[] = ['PENDING', 'TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED'];
export const PLANS: Plan[] = ['ESSENTIALS', 'GROWTH', 'ENTERPRISE'];
export const BILLING_CYCLES: BillingCycle[] = ['MONTHLY', 'ANNUAL'];
export const EVENT_TYPES: CompanyEventType[] = [
  'REGISTERED', 'ACTIVATED', 'SUSPENDED', 'REACTIVATED', 'PLAN_CHANGED', 'EXTENDED', 'NOTE', 'IMPERSONATED', 'EXPIRED', 'DELETED',
  'INVOICE_ISSUED', 'INVOICE_PAID', 'INVOICE_VOIDED', 'REMINDER_SENT',
];
export const LEAD_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'CONVERTED', 'LOST'];

const BLOCKED: Partial<Record<CompanyStatus, [code: string, message: string, messageAr: string]>> = {
  PENDING: ['COMPANY_PENDING', 'Company account is pending approval', 'حساب منشأتك قيد المراجعة، وسيتم تفعيله قريباً'],
  SUSPENDED: ['COMPANY_SUSPENDED', 'Company account is suspended', 'تم إيقاف حساب منشأتك. تواصل مع الدعم'],
  EXPIRED: ['COMPANY_EXPIRED', 'Company subscription has expired', 'انتهى اشتراك منشأتك. تواصل معنا للتجديد'],
};

/** Who performed a lifecycle change (null id/name = the system: registration, expiry). */
export interface Actor { id: string | null; name: string | null }
export const SYSTEM: Actor = { id: null, name: null };

const DAY_MS = 86400000;
const ACTIVITY_THROTTLE_MS = 5 * 60000;

// ---------- dates ----------
/** End of a Riyadh calendar day as an ISO datetime (subscriptions/trials run through their last day). */
export const endOfDay = (d: string) => new Date(riyadhDateTime(d, '23:59').getTime() + 59999).toISOString();
/** Riyadh calendar day of an ISO datetime. */
export const dayOf = (iso: string) => todayStr(new Date(iso));
/** Normalizes an incoming date: 'YYYY-MM-DD' → end of that day; ISO datetime → as given. Throws 400 if invalid. */
export function parseEndDate(value: unknown, field: string): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw badRequest(`${field} must be a valid ISO 8601 date string`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return endOfDay(value);
  const d = new Date(value);
  if (isNaN(d.getTime())) throw badRequest(`${field} must be a valid ISO 8601 date string`);
  return d.toISOString();
}
export const isPast = (iso: string | null, now = new Date()) => !!iso && new Date(iso).getTime() < now.getTime();
/** `days` calendar days after max(end, today), as end-of-day ISO. */
export function extendFrom(iso: string | null, days: number, now = new Date()) {
  const today = todayStr(now);
  const base = iso && dayOf(iso) > today ? dayOf(iso) : today;
  return endOfDay(addDays(base, days));
}

// ---------- events ----------
export function logEvent(
  svc: Services, c: Company, type: CompanyEventType,
  opts: { from?: CompanyStatus | null; to?: CompanyStatus | null; data?: Record<string, unknown> | null; actor?: Actor; createdAt?: string } = {},
): CompanyEvent {
  const actor = opts.actor ?? SYSTEM;
  const ev: CompanyEvent = {
    id: nextId(svc.db, 'cev'), companyId: c.id, companyName: c.nameAr, type, fromStatus: opts.from ?? null, toStatus: opts.to ?? null,
    data: opts.data === undefined || opts.data === null ? null : JSON.parse(JSON.stringify(opts.data)), adminId: actor.id, adminName: actor.name,
    createdAt: opts.createdAt ?? nowIso(),
  };
  svc.db.companyEvents.push(ev);
  svc.dirty = true;
  return ev;
}
export function eventView(db: DB, e: CompanyEvent) {
  const c = db.companies.find((x) => x.id === e.companyId);
  return { ...e, companyName: c?.nameAr ?? e.companyName, company: c ? { id: c.id, nameAr: c.nameAr, nameEn: c.nameEn } : null };
}

// ---------- status gate ----------
/** Lazy expiry: a TRIAL past trialEndsAt or an ACTIVE past subscriptionEndsAt becomes EXPIRED (and is logged). */
export function applyExpiry(svc: Services, c: Company, now = new Date()): boolean {
  const end = c.status === 'TRIAL' ? c.trialEndsAt : c.status === 'ACTIVE' ? c.subscriptionEndsAt : null;
  if (!isPast(end, now)) return false;
  const from = c.status;
  c.status = 'EXPIRED';
  c.updatedAt = now.toISOString();
  logEvent(svc, c, 'EXPIRED', { from, to: 'EXPIRED', data: { endedAt: end }, createdAt: now.toISOString() });
  const r = svc.db.settings.reminders;
  if (r?.enabled && r.notifyOnExpiry && end) {
    const endDay = dayOf(end);
    const log = sendEmail(svc, c, 'EXPIRED', { endDay }, { dedupeKey: expiredDedupeKey(c.id, endDay), createdAt: now.toISOString() });
    if (log) logEvent(svc, c, 'REMINDER_SENT', { from: 'EXPIRED', to: 'EXPIRED', data: { type: 'EXPIRED', daysLeft: 0 }, createdAt: now.toISOString() });
  }
  return true;
}
export function sweepExpiry(svc: Services, now = new Date()) {
  for (const c of svc.db.companies) applyExpiry(svc, c, now);
}
/** 403 with COMPANY_PENDING / COMPANY_SUSPENDED / COMPANY_EXPIRED unless the company is TRIAL or ACTIVE. */
export function assertCompanyAccess(svc: Services, companyId: string, now = new Date()): Company {
  const c = svc.db.companies.find((x) => x.id === companyId);
  if (!c) throw unauthorized('Invalid or expired token', 'انتهت الجلسة، سجّل الدخول مجدداً');
  applyExpiry(svc, c, now);
  const b = BLOCKED[c.status];
  if (b) throw forbiddenCode(b[0], b[1], b[2]);
  return c;
}
/** lastActivityAt, throttled to one write per 5 minutes. */
export function touchActivity(svc: Services, companyId: string, now = new Date()) {
  const c = svc.db.companies.find((x) => x.id === companyId);
  if (!c) return;
  if (c.lastActivityAt && now.getTime() - new Date(c.lastActivityAt).getTime() < ACTIVITY_THROTTLE_MS) return;
  c.lastActivityAt = now.toISOString();
  svc.dirty = true;
}

// ---------- seats & pricing ----------
export const activeEmployeeCount = (db: DB, companyId: string) => db.employees.filter((e) => e.companyId === companyId && e.status !== 'TERMINATED').length;
export function assertSeat(svc: Services, companyId: string) {
  const c = svc.db.companies.find((x) => x.id === companyId);
  if (!c || c.maxEmployees === null || c.maxEmployees === undefined) return;
  if (activeEmployeeCount(svc.db, companyId) >= c.maxEmployees) {
    throw forbiddenCode('SEAT_LIMIT', 'Employee limit for your plan reached', 'وصلت إلى الحد الأقصى لعدد الموظفين في باقتك');
  }
}
export const effectivePrice = (db: DB, c: Company): number | null => c.pricePerEmployee ?? db.settings.prices[c.plan] ?? null;
/** MRR of one company: ACTIVE only, activeEmployees × price, annual cycle × (1 − annualDiscount). */
export function companyMrr(db: DB, c: Company, active = activeEmployeeCount(db, c.id)) {
  if (c.status !== 'ACTIVE') return 0;
  const price = effectivePrice(db, c);
  if (price === null) return 0;
  return r2(active * price * (c.billingCycle === 'ANNUAL' ? 1 - db.settings.annualDiscount : 1));
}
/** Calendar days until the trial (TRIAL) or subscription (ACTIVE) ends; null otherwise or when open-ended. */
export function daysLeft(c: Company, now = new Date()): number | null {
  const end = c.status === 'TRIAL' ? c.trialEndsAt : c.status === 'ACTIVE' ? c.subscriptionEndsAt : null;
  if (!end) return null;
  return Math.max(0, Math.round((new Date(`${dayOf(end)}T00:00:00Z`).getTime() - new Date(`${todayStr(now)}T00:00:00Z`).getTime()) / DAY_MS));
}

// ---------- views ----------
export function companyOwner(db: DB, companyId: string) {
  const owners = db.users.filter((u) => u.companyId === companyId && u.role === 'OWNER').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return owners.find((u) => u.isActive) ?? owners[0] ?? null;
}
export function adminCompanyView(svc: Services, c: Company, now = new Date()) {
  const db = svc.db;
  const emps = db.employees.filter((e) => e.companyId === c.id);
  const active = emps.filter((e) => e.status !== 'TERMINATED').length;
  const owner = companyOwner(db, c.id);
  return {
    id: c.id, nameAr: c.nameAr, nameEn: c.nameEn, sector: c.sector, city: c.city, crNumber: c.crNumber, status: c.status, plan: c.plan,
    billingCycle: c.billingCycle, maxEmployees: c.maxEmployees, pricePerEmployee: c.pricePerEmployee, effectivePrice: effectivePrice(db, c),
    employeesCount: emps.length, activeEmployees: active, usersCount: db.users.filter((u) => u.companyId === c.id).length,
    branchesCount: db.branches.filter((b) => b.companyId === c.id).length, mrr: companyMrr(db, c, active), trialEndsAt: c.trialEndsAt,
    subscriptionEndsAt: c.subscriptionEndsAt, daysLeft: daysLeft(c, now), activatedAt: c.activatedAt, suspendedAt: c.suspendedAt,
    suspensionReason: c.suspensionReason, adminNotes: c.adminNotes, ownerName: owner?.name ?? null, ownerEmail: owner?.email ?? null,
    ownerPhone: owner?.phone ?? null, lastActivityAt: c.lastActivityAt, createdAt: c.createdAt,
  };
}
export type AdminCompanyView = ReturnType<typeof adminCompanyView>;
/** Company as the tenant sees it (GET/PATCH /company): internal admin notes stripped. */
export function tenantCompanyView(c: Company) {
  const { adminNotes: _n, ...rest } = c;
  return rest;
}

// ---------- ids ----------
/** Next free id from the pre-rendered pool (ids never reused, so the event log stays unambiguous). */
export function nextCompanyId(db: DB): string {
  const used = new Set([...db.companies.map((c) => c.id), ...db.companyEvents.map((e) => e.companyId)]);
  return COMPANY_IDS.find((id) => !used.has(id)) ?? nextId(db, 'co-x');
}

/** Lifecycle defaults for a freshly created company. */
export function lifecycleDefaults(): Pick<Company, 'status' | 'plan' | 'billingCycle' | 'maxEmployees' | 'pricePerEmployee' | 'trialEndsAt' | 'subscriptionEndsAt' | 'activatedAt' | 'suspendedAt' | 'suspensionReason' | 'adminNotes' | 'lastActivityAt'> {
  return {
    status: 'PENDING', plan: 'GROWTH', billingCycle: 'MONTHLY', maxEmployees: null, pricePerEmployee: null, trialEndsAt: null, subscriptionEndsAt: null,
    activatedAt: null, suspendedAt: null, suspensionReason: null, adminNotes: null, lastActivityAt: null,
  };
}
