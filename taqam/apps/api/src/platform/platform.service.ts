import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { round2 } from '@taqam/core';
import { BillingCycle, Company, CompanyEventType, CompanyStatus, Plan, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { forbidden } from '../common/errors';
import { serialize } from '../common/serialize';
import { addDays, dayStr, riyadhDateTime, todayStr } from '../common/dates';
import { BillingSettings, mergeBilling, mergeReminders, ReminderSettings } from '../billing/billing.math';

export const PLANS: Plan[] = ['ESSENTIALS', 'GROWTH', 'ENTERPRISE'];
export const DEFAULT_PRICES: Record<Plan, number | null> = { ESSENTIALS: 19, GROWTH: 29, ENTERPRISE: null };

export interface PlatformSettingsView {
  requireApproval: boolean;
  trialDays: number;
  prices: Record<Plan, number | null>;
  annualDiscount: number;
  billing: BillingSettings;
  reminders: ReminderSettings;
}

/** A company that has just been moved to EXPIRED (passed to expiry listeners). */
export type ExpiredCompany = LifecycleFields;
export type ExpiryListener = (c: ExpiredCompany) => Promise<unknown> | unknown;

/** 403 bodies for blocked company states (docs/ADMIN_PORTAL.md). */
export const COMPANY_BLOCKED: Partial<Record<CompanyStatus, { code: string; message: string; messageAr: string }>> = {
  PENDING: { code: 'COMPANY_PENDING', message: 'Company account is pending approval', messageAr: 'حساب منشأتك قيد المراجعة، وسيتم تفعيله قريباً' },
  SUSPENDED: { code: 'COMPANY_SUSPENDED', message: 'Company account is suspended', messageAr: 'تم إيقاف حساب منشأتك. تواصل مع الدعم' },
  EXPIRED: { code: 'COMPANY_EXPIRED', message: 'Company subscription has expired', messageAr: 'انتهى اشتراك منشأتك. تواصل معنا للتجديد' },
};

export const DAY_MS = 86400000;
const ACTIVITY_THROTTLE_MS = 5 * 60000;

type LifecycleFields = Pick<Company, 'id' | 'nameAr' | 'status' | 'trialEndsAt' | 'subscriptionEndsAt'>;
type PricingFields = Pick<Company, 'status' | 'plan' | 'billingCycle' | 'pricePerEmployee'>;

export interface EventInput {
  companyId: string;
  companyName?: string | null;
  type: CompanyEventType;
  fromStatus?: CompanyStatus | null;
  toStatus?: CompanyStatus | null;
  data?: unknown;
  admin?: { id: string; name: string } | null;
}

/** End of a Riyadh calendar day (trials/subscriptions run through their last day). */
export const endOfDay = (d: string | Date) => new Date(riyadhDateTime(dayStr(d)!, '23:59').getTime() + 59999);
/** Riyadh calendar day (YYYY-MM-DD) of an instant. */
export const dayOf = (d: Date) => todayStr(d);
/** End of the day `days` calendar days after max(end, today). */
export function extendFrom(end: Date | null, days: number, now = new Date()): Date {
  const today = todayStr(now);
  const base = end && dayOf(end) > today ? dayOf(end) : today;
  return endOfDay(addDays(base, days));
}
/** 'YYYY-MM-DD' → end of that Riyadh day; ISO datetime → as given; null/'' → null. */
export function parseEndDate(v: string | null | undefined): Date | null {
  if (v === null || v === undefined || v === '') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? endOfDay(v) : new Date(v);
}

/** Company lifecycle, pricing and platform settings — shared by auth, the guards and the admin portal. */
@Injectable()
export class PlatformService {
  private readonly logger = new Logger('Platform');
  private readonly expiryListeners: ExpiryListener[] = [];
  private readonly pendingListeners = new Set<Promise<void>>();
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register a callback run after a company is moved to EXPIRED (used by billing for the EXPIRED email —
   * keeps PlatformService free of a dependency on billing/mail). Listeners run fire-and-forget so a slow SMTP
   * server never blocks the request that noticed the expiry (e.g. a login); errors are logged, never thrown.
   */
  onExpired(fn: ExpiryListener) {
    this.expiryListeners.push(fn);
  }

  // ---------- settings ----------
  async getSettings(): Promise<PlatformSettingsView> {
    const row = await this.prisma.platformSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
    return this.settingsView(row);
  }

  settingsView(row: {
    requireApproval: boolean;
    trialDays: number;
    prices: Prisma.JsonValue;
    annualDiscount: number;
    billing?: Prisma.JsonValue;
    reminders?: Prisma.JsonValue;
  }): PlatformSettingsView {
    const raw = (row.prices && typeof row.prices === 'object' && !Array.isArray(row.prices) ? row.prices : {}) as Record<string, unknown>;
    const prices = {} as Record<Plan, number | null>;
    for (const p of PLANS) {
      const v = raw[p];
      prices[p] = v === undefined ? DEFAULT_PRICES[p] : typeof v === 'number' ? v : v === null ? null : Number(v);
    }
    return {
      requireApproval: row.requireApproval,
      trialDays: row.trialDays,
      prices,
      annualDiscount: row.annualDiscount,
      billing: mergeBilling(row.billing),
      reminders: mergeReminders(row.reminders),
    };
  }

  // ---------- pricing ----------
  effectivePrice(c: Pick<Company, 'plan' | 'pricePerEmployee'>, s: PlatformSettingsView): number | null {
    if (c.pricePerEmployee !== null && c.pricePerEmployee !== undefined) return Number(c.pricePerEmployee.toString());
    return s.prices[c.plan] ?? null;
  }

  /** Monthly recurring revenue of one company: ACTIVE only; annual cycle × (1 − annualDiscount). */
  mrr(c: PricingFields, activeEmployees: number, s: PlatformSettingsView): number {
    if (c.status !== 'ACTIVE') return 0;
    const price = this.effectivePrice(c, s);
    if (!price) return 0;
    const factor = c.billingCycle === ('ANNUAL' as BillingCycle) ? 1 - s.annualDiscount : 1;
    return round2(activeEmployees * price * factor);
  }

  /** Calendar days (Riyadh) until the trial (TRIAL) or subscription (ACTIVE) ends; null when not applicable / open-ended. */
  daysLeft(c: Pick<Company, 'status' | 'trialEndsAt' | 'subscriptionEndsAt'>, now = new Date()): number | null {
    const end = c.status === 'TRIAL' ? c.trialEndsAt : c.status === 'ACTIVE' ? c.subscriptionEndsAt : null;
    if (!end) return null;
    const diff = new Date(`${dayOf(end)}T00:00:00Z`).getTime() - new Date(`${todayStr(now)}T00:00:00Z`).getTime();
    return Math.max(0, Math.round(diff / DAY_MS));
  }

  // ---------- lifecycle ----------
  isDue(c: Pick<Company, 'status' | 'trialEndsAt' | 'subscriptionEndsAt'>, now = new Date()): boolean {
    if (c.status === 'TRIAL') return !!c.trialEndsAt && c.trialEndsAt <= now;
    if (c.status === 'ACTIVE') return !!c.subscriptionEndsAt && c.subscriptionEndsAt <= now;
    return false;
  }

  /**
   * Persist TRIAL/ACTIVE → EXPIRED (idempotent: only the first caller writes the event). The end date is
   * re-checked in the write so a trial/subscription extended after `c` was read is never expired.
   */
  async expire(c: LifecycleFields, now = new Date()): Promise<boolean> {
    if (c.status !== 'TRIAL' && c.status !== 'ACTIVE') return false;
    const stillDue: Prisma.CompanyWhereInput = c.status === 'TRIAL' ? { trialEndsAt: { lte: now } } : { subscriptionEndsAt: { lte: now } };
    const res = await this.prisma.company.updateMany({ where: { id: c.id, status: c.status, ...stillDue }, data: { status: 'EXPIRED' } });
    if (res.count) {
      await this.logEvent({
        companyId: c.id,
        companyName: c.nameAr,
        type: 'EXPIRED',
        fromStatus: c.status,
        toStatus: 'EXPIRED',
        data: { endedAt: c.status === 'TRIAL' ? c.trialEndsAt : c.subscriptionEndsAt },
      });
      for (const fn of this.expiryListeners) {
        const p: Promise<void> = Promise.resolve()
          .then(() => fn(c))
          .then(
            () => undefined,
            (e) => this.logger.error(`expiry listener failed for ${c.id}: ${(e as Error)?.message ?? e}`),
          )
          .finally(() => this.pendingListeners.delete(p));
        this.pendingListeners.add(p);
      }
    }
    return res.count > 0;
  }

  /** Wait for in-flight expiry listeners (reminder job / tests); never throws. */
  async settleListeners(): Promise<void> {
    while (this.pendingListeners.size) await Promise.allSettled([...this.pendingListeners]);
  }

  /** Expire every company whose trial/subscription has ended. */
  async expireDue(now = new Date()): Promise<number> {
    const due = await this.prisma.company.findMany({
      where: {
        OR: [
          { status: 'TRIAL', trialEndsAt: { lte: now } },
          { status: 'ACTIVE', subscriptionEndsAt: { lte: now } },
        ],
      },
      select: { id: true, nameAr: true, status: true, trialEndsAt: true, subscriptionEndsAt: true },
    });
    let n = 0;
    for (const c of due) if (await this.expire(c, now)) n++;
    return n;
  }

  @Cron('0 5 0 * * *', { name: 'expire-companies', timeZone: 'Asia/Riyadh' })
  async dailyExpiryJob() {
    try {
      const n = await this.expireDue();
      if (n) this.logger.log(`expired ${n} compan${n === 1 ? 'y' : 'ies'}`);
    } catch (e) {
      this.logger.error(`expiry job failed: ${(e as Error).message}`);
    }
  }

  /** The 403 to raise for a company in a blocked state (null = allowed). */
  blockedError(status: CompanyStatus) {
    const b = COMPANY_BLOCKED[status];
    return b ? forbidden(b.message, b.messageAr, { code: b.code }) : null;
  }

  /**
   * Central access check for any company login / request: lazily persists expiry, then throws the
   * contract 403 for PENDING / SUSPENDED / EXPIRED. Returns the effective status.
   */
  async assertCompanyAccess(c: LifecycleFields): Promise<CompanyStatus> {
    let status = c.status;
    if (this.isDue(c)) {
      // a concurrent extend may have won the race: trust the stored status then
      status = (await this.expire(c))
        ? 'EXPIRED'
        : ((await this.prisma.company.findUnique({ where: { id: c.id }, select: { status: true } }))?.status ?? 'EXPIRED');
    }
    const err = this.blockedError(status);
    if (err) throw err;
    return status;
  }

  /** Bump lastActivityAt at most once per 5 minutes per company. Never throws. */
  touchActivity(companyId: string, last: Date | null) {
    const now = new Date();
    if (last && now.getTime() - last.getTime() < ACTIVITY_THROTTLE_MS) return;
    this.prisma.company
      .updateMany({
        where: { id: companyId, OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: new Date(now.getTime() - ACTIVITY_THROTTLE_MS) } }] },
        data: { lastActivityAt: now },
      })
      .catch((e) => this.logger.warn(`activity update failed: ${(e as Error).message}`));
  }

  async logEvent(e: EventInput, db: Prisma.TransactionClient = this.prisma) {
    return db.companyEvent.create({
      data: {
        companyId: e.companyId,
        companyName: e.companyName ?? null,
        type: e.type,
        fromStatus: e.fromStatus ?? null,
        toStatus: e.toStatus ?? null,
        data: e.data === undefined || e.data === null ? Prisma.JsonNull : (serialize(e.data) as Prisma.InputJsonValue),
        adminId: e.admin?.id ?? null,
        adminName: e.admin?.name ?? null,
      },
    });
  }
}
