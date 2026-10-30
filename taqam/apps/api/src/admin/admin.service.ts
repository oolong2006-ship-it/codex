import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { round2 } from '@taqam/core';
import { Company, CompanyEvent, CompanyStatus, Plan, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotifyService } from '../shared/notifications.service';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../shared/audit.service';
import { BillingService } from '../billing/billing.service';
import { isValidTrn, normalizeDays } from '../billing/billing.math';
import { DAY_MS, extendFrom, parseEndDate, PLANS, PlatformService, PlatformSettingsView } from '../platform/platform.service';
import { PlatformUser } from '../common/types';
import { badRequest, conflict, notFound } from '../common/errors';
import { pageParams, Paginated } from '../common/pagination';
import { addMonths, periodOf, todayStr } from '../common/dates';
import {
  ActivateDto,
  BroadcastDto,
  CompaniesQuery,
  CreateAdminDto,
  DeleteCompanyDto,
  EventsQuery,
  ExtendDto,
  LeadsQuery,
  SuspendDto,
  UpdateAdminDto,
  UpdateCompanyAdminDto,
  UpdateLeadDto,
  UpdateSettingsDto,
} from './admin.dto';

export interface AdminCompany {
  id: string;
  nameAr: string;
  nameEn: string | null;
  sector: string | null;
  city: string | null;
  crNumber: string | null;
  status: CompanyStatus;
  plan: Plan;
  billingCycle: string;
  maxEmployees: number | null;
  pricePerEmployee: number | null;
  effectivePrice: number | null;
  employeesCount: number;
  activeEmployees: number;
  usersCount: number;
  branchesCount: number;
  mrr: number;
  trialEndsAt: Date | null;
  subscriptionEndsAt: Date | null;
  daysLeft: number | null;
  activatedAt: Date | null;
  suspendedAt: Date | null;
  suspensionReason: string | null;
  adminNotes: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  lastActivityAt: Date | null;
  createdAt: Date;
}

const companyNotFound = () => notFound('Company', 'المنشأة غير موجودة');
const adminSelect = { id: true, name: true, email: true, isActive: true, lastLoginAt: true, createdAt: true } as const;
const leadSelect = {
  id: true, name: true, company: true, email: true, phone: true, employeesCount: true, sector: true, message: true, status: true, notes: true, createdAt: true,
} as const;
const actor = (a: PlatformUser) => ({ id: a.id, name: a.name });
/** Drops undefined keys (partial settings PATCH). */
const defined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
function mergeReminderPatch(current: PlatformSettingsView['reminders'], patch: Partial<PlatformSettingsView['reminders']>) {
  const out = { ...current, ...defined(patch) };
  for (const k of ['trialDays', 'subscriptionDays', 'overdueInvoiceDays'] as const) out[k] = normalizeDays(out[k]);
  return out;
}

/** Temporary password: readable, meets the 8+ chars rule. */
function tempPassword() {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  let s = 'Tq-';
  for (let i = 0; i < 6; i++) s += alpha[randomInt(alpha.length)];
  for (let i = 0; i < 3; i++) s += digits[randomInt(digits.length)];
  return s;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platform: PlatformService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
    private readonly billing: BillingService,
  ) {}

  /** CompanyEvent & { companyName, company } for the activity log. */
  private async eventViews(events: CompanyEvent[]) {
    const ids = [...new Set(events.map((e) => e.companyId))];
    const companies = ids.length ? await this.prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, nameAr: true, nameEn: true } }) : [];
    const byId = new Map(companies.map((c) => [c.id, c]));
    return events.map((e) => {
      const c = byId.get(e.companyId) ?? null;
      return { ...e, companyName: c?.nameAr ?? e.companyName, company: c };
    });
  }

  // ================= companies =================

  /** Builds AdminCompany views for the given rows (batched counts). */
  async views(companies: Company[], settings?: PlatformSettingsView): Promise<AdminCompany[]> {
    if (!companies.length) return [];
    const s = settings ?? (await this.platform.getSettings());
    const ids = companies.map((c) => c.id);
    const [emp, users, branches, owners] = await Promise.all([
      this.prisma.employee.groupBy({ by: ['companyId', 'status'], where: { companyId: { in: ids } }, _count: { _all: true } }),
      this.prisma.user.groupBy({ by: ['companyId'], where: { companyId: { in: ids } }, _count: { _all: true } }),
      this.prisma.branch.groupBy({ by: ['companyId'], where: { companyId: { in: ids } }, _count: { _all: true } }),
      this.prisma.user.findMany({
        where: { companyId: { in: ids }, role: 'OWNER' },
        orderBy: { createdAt: 'asc' },
        select: { companyId: true, name: true, email: true, phone: true },
      }),
    ]);
    const empTotal = new Map<string, number>();
    const empActive = new Map<string, number>();
    for (const g of emp) {
      empTotal.set(g.companyId, (empTotal.get(g.companyId) ?? 0) + g._count._all);
      // "active" = still employed (ACTIVE or ON_LEAVE) — the billable seat count.
      if (g.status !== 'TERMINATED') empActive.set(g.companyId, (empActive.get(g.companyId) ?? 0) + g._count._all);
    }
    const userCount = new Map(users.map((g) => [g.companyId as string, g._count._all]));
    const branchCount = new Map(branches.map((g) => [g.companyId, g._count._all]));
    const ownerOf = new Map<string, { name: string; email: string; phone: string | null }>();
    for (const o of owners) if (o.companyId && !ownerOf.has(o.companyId)) ownerOf.set(o.companyId, o);
    const now = new Date();
    return companies.map((c) => {
      const activeEmployees = empActive.get(c.id) ?? 0;
      const owner = ownerOf.get(c.id);
      return {
        id: c.id,
        nameAr: c.nameAr,
        nameEn: c.nameEn,
        sector: c.sector,
        city: c.city,
        crNumber: c.crNumber,
        status: c.status,
        plan: c.plan,
        billingCycle: c.billingCycle,
        maxEmployees: c.maxEmployees,
        pricePerEmployee: c.pricePerEmployee === null ? null : Number(c.pricePerEmployee.toString()),
        effectivePrice: this.platform.effectivePrice(c, s),
        employeesCount: empTotal.get(c.id) ?? 0,
        activeEmployees,
        usersCount: userCount.get(c.id) ?? 0,
        branchesCount: branchCount.get(c.id) ?? 0,
        mrr: this.platform.mrr(c, activeEmployees, s),
        trialEndsAt: c.trialEndsAt,
        subscriptionEndsAt: c.subscriptionEndsAt,
        daysLeft: this.platform.daysLeft(c, now),
        activatedAt: c.activatedAt,
        suspendedAt: c.suspendedAt,
        suspensionReason: c.suspensionReason,
        adminNotes: c.adminNotes,
        ownerName: owner?.name ?? null,
        ownerEmail: owner?.email ?? null,
        ownerPhone: owner?.phone ?? null,
        lastActivityAt: c.lastActivityAt,
        createdAt: c.createdAt,
      };
    });
  }

  async view(id: string): Promise<AdminCompany> {
    const c = await this.prisma.company.findUnique({ where: { id } });
    if (!c) throw companyNotFound();
    return (await this.views([c]))[0];
  }

  private async company(id: string): Promise<Company> {
    const c = await this.prisma.company.findUnique({ where: { id } });
    if (!c) throw companyNotFound();
    if (this.platform.isDue(c)) {
      await this.platform.expire(c);
      return this.prisma.company.findUniqueOrThrow({ where: { id } });
    }
    return c;
  }

  async overview() {
    await this.platform.expireDue();
    const s = await this.platform.getSettings();
    const thisPeriod = periodOf(todayStr());
    const firstPeriod = addMonths(thisPeriod, -11);
    const [companies, employees, users, newLeads] = await Promise.all([
      this.prisma.company.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.employee.count({ where: { status: { not: 'TERMINATED' } } }),
      this.prisma.user.count({ where: { companyId: { not: null } } }),
      this.prisma.lead.count({ where: { status: 'NEW' } }),
    ]);
    const views = await this.views(companies, s);
    const counts = { total: views.length, pending: 0, trial: 0, active: 0, suspended: 0, expired: 0 };
    for (const v of views) counts[v.status.toLowerCase() as 'pending'] += 1;
    const mrr = round2(views.reduce((a, v) => a + v.mrr, 0));

    const signups = new Map<string, number>();
    for (let i = 0; i < 12; i++) signups.set(addMonths(firstPeriod, i), 0);
    for (const c of companies) {
      const p = todayStr(c.createdAt).slice(0, 7);
      if (signups.has(p)) signups.set(p, signups.get(p)! + 1);
    }
    const mrrByPlan = PLANS.map((plan) => {
      const active = views.filter((v) => v.status === 'ACTIVE' && v.plan === plan);
      return { plan, mrr: round2(active.reduce((a, v) => a + v.mrr, 0)), companies: active.length };
    });
    const expiringSoon = views
      .filter((v) => (v.status === 'TRIAL' || v.status === 'ACTIVE') && v.daysLeft !== null && v.daysLeft <= 14)
      .sort((a, b) => a.daysLeft! - b.daysLeft!);

    return {
      companies: counts,
      employees,
      users,
      mrr,
      arr: round2(mrr * 12),
      signupsByMonth: [...signups.entries()].map(([period, count]) => ({ period, count })),
      mrrByPlan,
      expiringSoon,
      recentSignups: views.slice(0, 5),
      newLeads,
    };
  }

  /**
   * Company list. Read-only: expiry is persisted by the daily job and lazily on access, not here.
   * Filters and (for column sorts) ordering + pagination run in the database; only `name`
   * (Arabic collation) and `employees` (aggregate) are sorted in memory.
   */
  async list(q: CompaniesQuery): Promise<Paginated<AdminCompany>> {
    const { page, pageSize, skip, take } = pageParams(q);
    const where: Prisma.CompanyWhereInput = {};
    if (q.status) where.status = { in: q.status.split(',') as CompanyStatus[] };
    if (q.plan) where.plan = q.plan;
    const search = q.search?.trim();
    if (search) {
      const has = { contains: search, mode: 'insensitive' as const };
      where.OR = [
        { nameAr: has },
        { nameEn: has },
        { crNumber: has },
        { city: has },
        { users: { some: { role: 'OWNER', OR: [{ email: has }, { name: has }, { phone: has }] } } },
      ];
    }
    const raw = q.sort ?? 'createdAt';
    const key = raw.replace(/^-/, '');
    const sorts: Record<string, { cmp: (a: AdminCompany, b: AdminCompany) => number; dir: 1 | -1; db?: (d: Prisma.SortOrder) => Prisma.CompanyOrderByWithRelationInput }> = {
      createdAt: { cmp: (a, b) => a.createdAt.getTime() - b.createdAt.getTime(), dir: -1, db: (d) => ({ createdAt: d }) },
      name: { cmp: (a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'), dir: 1 },
      employees: { cmp: (a, b) => a.activeEmployees - b.activeEmployees || a.employeesCount - b.employeesCount, dir: -1 },
      lastActivityAt: {
        cmp: (a, b) => (a.lastActivityAt?.getTime() ?? 0) - (b.lastActivityAt?.getTime() ?? 0),
        dir: -1,
        db: (d) => ({ lastActivityAt: { sort: d, nulls: d === 'asc' ? 'first' : 'last' } }),
      },
    };
    const sort = sorts[key] ?? sorts.createdAt;
    const dir = q.order === 'asc' ? 1 : q.order === 'desc' ? -1 : raw.startsWith('-') ? -1 : sort.dir;

    if (sort.db) {
      const [companies, total] = await Promise.all([
        this.prisma.company.findMany({ where, orderBy: [sort.db(dir === 1 ? 'asc' : 'desc'), { createdAt: 'desc' }], skip, take }),
        this.prisma.company.count({ where }),
      ]);
      return { data: await this.views(companies), total, page, pageSize };
    }
    const rows = await this.views(await this.prisma.company.findMany({ where, orderBy: { createdAt: 'desc' } }));
    rows.sort((a, b) => dir * sort.cmp(a, b) || b.createdAt.getTime() - a.createdAt.getTime());
    return { data: rows.slice(skip, skip + take), total: rows.length, page, pageSize };
  }

  async detail(id: string) {
    const c = await this.company(id);
    const since = new Date(Date.now() - 30 * DAY_MS);
    const [base] = await this.views([c]);
    const [users, payrollRuns, lastRun, leaveRequests30d, checkIns30d, events, invoices, emails] = await Promise.all([
      this.prisma.user.findMany({
        where: { companyId: id },
        orderBy: [{ createdAt: 'asc' }],
        select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, lastLoginAt: true },
      }),
      this.prisma.payrollRun.count({ where: { companyId: id } }),
      this.prisma.payrollRun.findFirst({ where: { companyId: id }, orderBy: { period: 'desc' }, select: { period: true } }),
      this.prisma.leaveRequest.count({ where: { companyId: id, createdAt: { gte: since } } }),
      this.prisma.attendanceRecord.count({ where: { companyId: id, checkIn: { gte: since } } }),
      this.prisma.companyEvent.findMany({ where: { companyId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.billing.companyInvoices(id, 20),
      this.billing.companyEmails(id, 20),
    ]);
    const owners = users.filter((u) => u.role === 'OWNER');
    const owner = owners.find((u) => u.isActive) ?? owners[0] ?? null;
    return {
      ...base,
      owner: owner ? { id: owner.id, name: owner.name, email: owner.email, phone: owner.phone } : null,
      users: users.map(({ phone: _p, ...u }) => u),
      usage: {
        employees: base.employeesCount,
        activeEmployees: base.activeEmployees,
        branches: base.branchesCount,
        users: base.usersCount,
        payrollRuns,
        lastPayrollPeriod: lastRun?.period ?? null,
        leaveRequests30d,
        checkIns30d,
      },
      events: await this.eventViews(events),
      invoices,
      emails,
    };
  }

  async activate(admin: PlatformUser, id: string, dto: ActivateDto) {
    const c = await this.company(id);
    if (c.status === 'ACTIVE') throw badRequest('Company is already active', 'المنشأة مفعّلة بالفعل');
    const s = await this.platform.getSettings();
    const now = new Date();
    const trial = dto.mode === 'TRIAL';
    const trialDays = dto.trialDays ?? s.trialDays ?? 14;
    const toStatus: CompanyStatus = trial ? 'TRIAL' : 'ACTIVE';
    const plan = dto.plan ?? c.plan;
    const billingCycle = dto.billingCycle ?? c.billingCycle;
    const trialEndsAt = trial ? extendFrom(null, trialDays, now) : null;
    const subscriptionEndsAt = dto.subscriptionEndsAt === undefined ? (trial ? c.subscriptionEndsAt : null) : parseEndDate(dto.subscriptionEndsAt);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id },
        data: {
          status: toStatus,
          plan,
          billingCycle,
          ...(dto.maxEmployees !== undefined ? { maxEmployees: dto.maxEmployees } : {}),
          ...(dto.pricePerEmployee !== undefined ? { pricePerEmployee: dto.pricePerEmployee } : {}),
          trialEndsAt,
          subscriptionEndsAt,
          activatedAt: now,
          suspendedAt: null,
          suspensionReason: null,
        },
      });
      await this.platform.logEvent(
        {
          companyId: id,
          companyName: c.nameAr,
          type: 'ACTIVATED',
          fromStatus: c.status,
          toStatus,
          data: {
            mode: dto.mode,
            plan,
            billingCycle,
            maxEmployees: updated.maxEmployees,
            pricePerEmployee: updated.pricePerEmployee,
            trialEndsAt,
            subscriptionEndsAt,
          },
          admin: actor(admin),
        },
        tx,
      );
    });
    const owners = await this.prisma.user.findMany({ where: { companyId: id, role: 'OWNER', isActive: true }, select: { id: true } });
    await this.notify.toUsers(
      id,
      owners.map((o) => o.id),
      'تم تفعيل حساب منشأتك في شؤون',
      trial ? 'بدأت الفترة التجريبية — مرحباً بك' : 'اشتراكك فعّال الآن — مرحباً بك',
      '/app',
    );
    return this.view(id);
  }

  async suspend(admin: PlatformUser, id: string, dto: SuspendDto) {
    const c = await this.company(id);
    if (c.status === 'SUSPENDED') throw badRequest('Company is already suspended', 'المنشأة موقوفة بالفعل');
    const reason = dto.reason.trim();
    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id }, data: { status: 'SUSPENDED', suspendedAt: new Date(), suspensionReason: reason } });
      await this.platform.logEvent({ companyId: id, companyName: c.nameAr, type: 'SUSPENDED', fromStatus: c.status, toStatus: 'SUSPENDED', data: { reason }, admin: actor(admin) }, tx);
    });
    return this.view(id);
  }

  async reactivate(admin: PlatformUser, id: string) {
    const c = await this.company(id);
    if (c.status !== 'SUSPENDED' && c.status !== 'EXPIRED') {
      throw badRequest('Company is not suspended', 'المنشأة ليست موقوفة');
    }
    const now = new Date();
    // Back to TRIAL only while the trial is still running and the company was never ACTIVE (paid).
    const everActive =
      !!c.subscriptionEndsAt || (await this.prisma.companyEvent.count({ where: { companyId: id, toStatus: 'ACTIVE' } })) > 0;
    const toStatus: CompanyStatus = c.trialEndsAt && c.trialEndsAt > now && !everActive ? 'TRIAL' : 'ACTIVE';
    const data: Prisma.CompanyUpdateInput = { status: toStatus, suspendedAt: null, suspensionReason: null, activatedAt: c.activatedAt ?? now };
    // An ended subscription would immediately re-expire: reactivation makes it open-ended (use /extend to set a date).
    if (toStatus === 'ACTIVE' && c.subscriptionEndsAt && c.subscriptionEndsAt <= now) data.subscriptionEndsAt = null;
    if (toStatus === 'ACTIVE') data.trialEndsAt = null;
    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id }, data });
      await this.platform.logEvent({ companyId: id, companyName: c.nameAr, type: 'REACTIVATED', fromStatus: c.status, toStatus, admin: actor(admin) }, tx);
    });
    return this.view(id);
  }

  async update(admin: PlatformUser, id: string, dto: UpdateCompanyAdminDto) {
    const c = await this.company(id);
    const data: Prisma.CompanyUpdateInput = {};
    const planChanges: Record<string, { from: unknown; to: unknown }> = {};
    const dateChanges: Record<string, { from: unknown; to: unknown }> = {};
    const numEq = (a: Prisma.Decimal | null, b: number | null) => (a === null ? b === null : b !== null && Number(a.toString()) === b);

    if (dto.plan !== undefined && dto.plan !== c.plan) planChanges.plan = { from: c.plan, to: (data.plan = dto.plan) };
    if (dto.billingCycle !== undefined && dto.billingCycle !== c.billingCycle) planChanges.billingCycle = { from: c.billingCycle, to: (data.billingCycle = dto.billingCycle) };
    if (dto.maxEmployees !== undefined && dto.maxEmployees !== c.maxEmployees) planChanges.maxEmployees = { from: c.maxEmployees, to: (data.maxEmployees = dto.maxEmployees) };
    if (dto.pricePerEmployee !== undefined && !numEq(c.pricePerEmployee, dto.pricePerEmployee)) {
      planChanges.pricePerEmployee = { from: c.pricePerEmployee === null ? null : Number(c.pricePerEmployee.toString()), to: dto.pricePerEmployee };
      data.pricePerEmployee = dto.pricePerEmployee;
    }
    if (dto.trialEndsAt !== undefined) {
      const d = parseEndDate(dto.trialEndsAt);
      if ((d?.getTime() ?? null) !== (c.trialEndsAt?.getTime() ?? null)) dateChanges.trialEndsAt = { from: c.trialEndsAt, to: (data.trialEndsAt = d) };
    }
    if (dto.subscriptionEndsAt !== undefined) {
      const d = parseEndDate(dto.subscriptionEndsAt);
      if ((d?.getTime() ?? null) !== (c.subscriptionEndsAt?.getTime() ?? null)) dateChanges.subscriptionEndsAt = { from: c.subscriptionEndsAt, to: (data.subscriptionEndsAt = d) };
    }
    const noteChanged = dto.adminNotes !== undefined && (dto.adminNotes ?? null) !== c.adminNotes;
    if (noteChanged) data.adminNotes = dto.adminNotes ?? null;
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr.trim();
    if (dto.nameEn !== undefined) data.nameEn = dto.nameEn;

    // Moving an end date into the future revives an EXPIRED company in that phase.
    const now = new Date();
    if (c.status === 'EXPIRED') {
      const t = data.trialEndsAt as Date | null | undefined;
      const sub = data.subscriptionEndsAt as Date | null | undefined;
      if (sub && sub > now) data.status = 'ACTIVE';
      else if (t && t > now) data.status = 'TRIAL';
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id }, data });
      const base = { companyId: id, companyName: (data.nameAr as string) ?? c.nameAr, admin: actor(admin), fromStatus: c.status, toStatus: c.status };
      const newStatus = (data.status as CompanyStatus | undefined) ?? c.status;
      if (Object.keys(planChanges).length) await this.platform.logEvent({ ...base, type: 'PLAN_CHANGED', data: { changes: planChanges } }, tx);
      if (Object.keys(dateChanges).length) await this.platform.logEvent({ ...base, toStatus: newStatus, type: 'EXTENDED', data: { changes: dateChanges } }, tx);
      if (noteChanged) await this.platform.logEvent({ ...base, toStatus: newStatus, type: 'NOTE', data: { note: dto.adminNotes ?? null } }, tx);
    });
    // A date moved into the past expires lazily right away.
    await this.company(id);
    return this.view(id);
  }

  async extend(admin: PlatformUser, id: string, dto: ExtendDto) {
    const c = await this.company(id);
    const now = new Date();
    let field: 'trialEndsAt' | 'subscriptionEndsAt';
    let to: Date;
    let data: Prisma.CompanyUpdateInput;
    let toStatus: CompanyStatus = c.status;
    if (c.status === 'TRIAL') {
      field = 'trialEndsAt';
      data = { trialEndsAt: (to = extendFrom(c.trialEndsAt, dto.days, now)) };
    } else if (c.status === 'ACTIVE') {
      field = 'subscriptionEndsAt';
      data = { subscriptionEndsAt: (to = extendFrom(c.subscriptionEndsAt, dto.days, now)) };
    } else if (c.status === 'EXPIRED') {
      field = 'subscriptionEndsAt';
      toStatus = 'ACTIVE';
      data = { status: 'ACTIVE', subscriptionEndsAt: (to = extendFrom(null, dto.days, now)), activatedAt: c.activatedAt ?? now };
    } else {
      throw badRequest(`Cannot extend a ${c.status} company`, 'لا يمكن تمديد اشتراك منشأة بهذه الحالة');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id }, data });
      await this.platform.logEvent(
        { companyId: id, companyName: c.nameAr, type: 'EXTENDED', fromStatus: c.status, toStatus, data: { days: dto.days, field, from: c[field], to }, admin: actor(admin) },
        tx,
      );
    });
    return this.view(id);
  }

  async impersonate(admin: PlatformUser, id: string) {
    const c = await this.company(id);
    const owner =
      (await this.prisma.user.findFirst({ where: { companyId: id, role: 'OWNER', isActive: true }, orderBy: { createdAt: 'asc' }, include: { company: true, employee: true } })) ??
      (await this.prisma.user.findFirst({ where: { companyId: id, role: 'OWNER' }, orderBy: { createdAt: 'asc' }, include: { company: true, employee: true } }));
    if (!owner || !owner.isActive) throw notFound('Owner', 'لا يوجد مالك نشط لهذه المنشأة');
    await this.platform.logEvent({
      companyId: id,
      companyName: c.nameAr,
      type: 'IMPERSONATED',
      fromStatus: c.status,
      toStatus: c.status,
      data: { userId: owner.id, email: owner.email },
      admin: actor(admin),
    });
    await this.audit.log({ id: admin.id, name: `${admin.name} (بوابة المنصة)`, companyId: id }, 'IMPERSONATE', 'User', owner.id, { adminEmail: admin.email });
    return this.auth.response(owner, { impersonatedBy: admin.id, expiresIn: '1h' });
  }

  async resetPassword(admin: PlatformUser, id: string, userId: string) {
    await this.company(id);
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId: id } });
    if (!user) throw notFound('User', 'المستخدم غير موجود');
    const temporaryPassword = tempPassword();
    // tokenVersion bump revokes the user's existing sessions
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(temporaryPassword, 10), tokenVersion: { increment: 1 } } });
    await this.audit.log({ id: admin.id, name: `${admin.name} (بوابة المنصة)`, companyId: id }, 'RESET_PASSWORD', 'User', user.id, { email: user.email });
    return { temporaryPassword };
  }

  /** Hard delete of the company and every tenant row, in FK-safe order, in one transaction. */
  async remove(admin: PlatformUser, id: string, dto: DeleteCompanyDto, queryName?: string) {
    const c = await this.prisma.company.findUnique({ where: { id } });
    if (!c) throw companyNotFound();
    const confirmName = String(dto?.confirmName ?? queryName ?? '').trim();
    if (confirmName !== c.nameAr.trim()) {
      throw badRequest('confirmName does not match the company name', 'اسم المنشأة غير مطابق');
    }
    // v2.1 retention: issued invoices / credit notes are kept for tax purposes → suspend instead
    if (await this.prisma.invoice.count({ where: { companyId: id } })) {
      throw conflict('A company with issued invoices cannot be deleted; suspend it instead', 'لا يمكن حذف منشأة لها فواتير صادرة؛ أوقف الحساب بدلاً من ذلك');
    }
    const owner = await this.prisma.user.findFirst({ where: { companyId: id, role: 'OWNER' }, orderBy: { createdAt: 'asc' }, select: { email: true } });
    const w = { where: { companyId: id } };
    await this.prisma.$transaction(
      async (tx) => {
        await tx.notification.deleteMany(w);
        await tx.auditLog.deleteMany(w);
        // no invoices here (checked above; the FK is RESTRICT). EmailLog rows are kept (not FK-bound), like CompanyEvent
        await tx.performanceReview.deleteMany(w);
        await tx.reviewCycle.deleteMany(w);
        await tx.candidate.deleteMany(w);
        await tx.jobOpening.deleteMany(w);
        await tx.payslip.deleteMany(w);
        await tx.payrollRun.deleteMany(w);
        await tx.payrollAdjustment.deleteMany(w);
        await tx.loan.deleteMany(w);
        await tx.employeeRequest.deleteMany(w);
        await tx.leaveRequest.deleteMany(w);
        await tx.leaveType.deleteMany(w);
        await tx.attendanceRecord.deleteMany(w);
        await tx.shiftAssignment.deleteMany(w);
        await tx.shift.deleteMany(w);
        await tx.employeeDocument.deleteMany(w);
        await tx.announcement.deleteMany(w);
        await tx.publicHoliday.deleteMany(w);
        await tx.user.deleteMany(w);
        await tx.branch.updateMany({ ...w, data: { managerEmployeeId: null } });
        await tx.employee.updateMany({ ...w, data: { managerId: null } });
        await tx.employee.deleteMany(w);
        await tx.branch.deleteMany(w);
        await tx.department.updateMany({ ...w, data: { parentId: null } });
        await tx.department.deleteMany(w);
        await tx.company.delete({ where: { id } });
        await this.platform.logEvent(
          { companyId: id, companyName: c.nameAr, type: 'DELETED', fromStatus: c.status, data: { nameAr: c.nameAr, nameEn: c.nameEn, ownerEmail: owner?.email ?? null }, admin: actor(admin) },
          tx,
        );
      },
      { timeout: 120000, maxWait: 10000 },
    );
    return { ok: true };
  }

  // ================= leads =================
  async leads(q: LeadsQuery) {
    const { page, pageSize, skip, take } = pageParams(q);
    const where: Prisma.LeadWhereInput = {};
    if (q.status) where.status = q.status;
    const search = q.search?.trim();
    if (search) {
      where.OR = ['name', 'company', 'email', 'phone', 'sector', 'message'].map((f) => ({ [f]: { contains: search, mode: 'insensitive' } }));
    }
    const [total, data] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, select: leadSelect }),
    ]);
    return { data, total, page, pageSize };
  }

  async updateLead(id: string, dto: UpdateLeadDto) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw notFound('Lead', 'الطلب غير موجود');
    return this.prisma.lead.update({
      where: { id },
      data: { ...(dto.status !== undefined ? { status: dto.status } : {}), ...(dto.notes !== undefined ? { notes: dto.notes } : {}) },
      select: leadSelect,
    });
  }

  // ================= events =================
  async events(q: EventsQuery) {
    const { page, pageSize, skip, take } = pageParams(q);
    const where: Prisma.CompanyEventWhereInput = {};
    if (q.companyId) where.companyId = q.companyId;
    if (q.type) where.type = q.type;
    const [total, data] = await Promise.all([
      this.prisma.companyEvent.count({ where }),
      this.prisma.companyEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return { data: await this.eventViews(data), total, page, pageSize };
  }

  // ================= platform admins =================
  admins() {
    return this.prisma.user.findMany({ where: { role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' }, select: adminSelect });
  }

  async createAdmin(dto: CreateAdminDto) {
    if (await this.prisma.user.findUnique({ where: { email: dto.email } })) throw conflict('Email already in use', 'البريد الإلكتروني مستخدم مسبقاً');
    return this.prisma.user.create({
      data: { email: dto.email, name: dto.name.trim(), role: 'SUPER_ADMIN', companyId: null, passwordHash: await bcrypt.hash(dto.password, 10) },
      select: adminSelect,
    });
  }

  async updateAdmin(me: PlatformUser, id: string, dto: UpdateAdminDto) {
    const target = await this.prisma.user.findFirst({ where: { id, role: 'SUPER_ADMIN' } });
    if (!target) throw notFound('Admin', 'المستخدم غير موجود');
    if (target.id === me.id && dto.isActive === false) throw badRequest('You cannot deactivate yourself', 'لا يمكنك تعطيل حسابك');
    return this.prisma.user.update({
      where: { id },
      data: { ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}), ...(dto.name !== undefined ? { name: dto.name.trim() } : {}) },
      select: adminSelect,
    });
  }

  // ================= settings =================
  settings() {
    return this.platform.getSettings();
  }

  async updateSettings(dto: UpdateSettingsDto) {
    if (dto.billing?.sellerVatNumber !== undefined && dto.billing.sellerVatNumber !== '' && !isValidTrn(dto.billing.sellerVatNumber)) {
      throw badRequest('sellerVatNumber must be empty or 15 digits starting and ending with 3', 'الرقم الضريبي يجب أن يكون 15 رقماً يبدأ وينتهي بالرقم 3');
    }
    const current = await this.platform.getSettings();
    const prices = { ...current.prices };
    if (dto.prices) for (const p of PLANS) if (dto.prices[p] !== undefined) prices[p] = dto.prices[p] ?? null;
    const row = await this.prisma.platformSettings.update({
      where: { id: 1 },
      data: {
        ...(dto.requireApproval !== undefined ? { requireApproval: dto.requireApproval } : {}),
        ...(dto.trialDays !== undefined ? { trialDays: dto.trialDays } : {}),
        ...(dto.annualDiscount !== undefined ? { annualDiscount: dto.annualDiscount } : {}),
        prices,
        ...(dto.billing ? { billing: { ...current.billing, ...defined(dto.billing) } as Prisma.InputJsonValue } : {}),
        ...(dto.reminders ? { reminders: mergeReminderPatch(current.reminders, dto.reminders) as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    return this.platform.settingsView(row);
  }

  // ================= broadcast =================
  async broadcast(dto: BroadcastDto) {
    const companyWhere: Prisma.CompanyWhereInput = dto.target === 'ALL' ? {} : { status: dto.target };
    const users = await this.prisma.user.findMany({
      where: { company: companyWhere, companyId: { not: null }, role: { in: ['OWNER', 'HR_ADMIN'] }, isActive: true },
      select: { id: true, companyId: true },
    });
    if (!users.length) return { sent: 0 };
    const res = await this.prisma.notification.createMany({
      data: users.map((u) => ({ companyId: u.companyId!, userId: u.id, title: dto.title.trim(), body: dto.body.trim(), link: null })),
    });
    return { sent: res.count };
  }
}
