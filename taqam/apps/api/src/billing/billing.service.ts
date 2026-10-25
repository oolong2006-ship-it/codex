import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { round2 } from '@taqam/core';
import { Company, EmailLog, EmailType, Invoice, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotifyService } from '../shared/notifications.service';
import { endOfDay, ExpiredCompany, PlatformService } from '../platform/platform.service';
import { PlatformUser } from '../common/types';
import { badRequest, conflict, notFound } from '../common/errors';
import { pageParams, Paginated } from '../common/pagination';
import { day, dayStr, riyadhDateTime, todayStr } from '../common/dates';
import { num } from '../common/money';
import { addDaysStr, computeInvoice, dedupeKey, nextInvoiceNumber, periodEndOf, selectReminders } from './billing.math';
import {
  EmailContent,
  expiredEmail,
  InvoiceCtx,
  invoiceIssuedEmail,
  invoiceOverdueEmail,
  manualReminderEmail,
  paymentReceivedEmail,
  subscriptionEndingEmail,
  trialEndingEmail,
} from './billing.emails';
import { CreateInvoiceDto, EmailsQuery, InvoicesQuery, PayInvoiceDto, RemindDto, VoidInvoiceDto } from './billing.dto';

export interface InvoiceView {
  id: string;
  number: string;
  companyId: string;
  companyName: string;
  status: Invoice['status'];
  overdue: boolean;
  plan: Invoice['plan'];
  billingCycle: Invoice['billingCycle'];
  periodStart: string;
  periodEnd: string;
  months: number;
  employees: number;
  unitPrice: number;
  subtotal: number;
  discountRate: number;
  discount: number;
  taxable: number;
  vatRate: number;
  vat: number;
  total: number;
  issueDate: string;
  dueDate: string;
  paidAt: Date | null;
  paymentMethod: Invoice['paymentMethod'];
  paymentRef: string | null;
  notes: string | null;
  voidReason: string | null;
  createdByName: string | null;
  createdAt: Date;
}

export type EmailLogView = Omit<EmailLog, 'dedupeKey'>;

const emailSelect = { id: true, companyId: true, to: true, subject: true, body: true, type: true, status: true, error: true, createdAt: true } as const;
const ALREADY_PROCESSED = () => conflict('Invoice was already processed', 'تمت معالجة هذه الفاتورة مسبقاً');
const invoiceNotFound = () => notFound('Invoice', 'الفاتورة غير موجودة');
const companyNotFound = () => notFound('Company', 'المنشأة غير موجودة');
const isRealDay = (s: string) => dayStr(new Date(`${s}T00:00:00.000Z`)) === s;
const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002';

const NOTIFY_TITLE: Record<EmailType, string> = {
  TRIAL_ENDING: 'تنتهي الفترة التجريبية لمنشأتك قريباً',
  SUBSCRIPTION_ENDING: 'ينتهي اشتراك منشأتك قريباً',
  EXPIRED: 'انتهى اشتراك منشأتك',
  INVOICE_ISSUED: 'فاتورة اشتراك جديدة',
  PAYMENT_RECEIVED: 'تم استلام دفعة الاشتراك',
  INVOICE_OVERDUE: 'فاتورة اشتراك متأخرة السداد',
  MANUAL_REMINDER: 'تذكير بخصوص اشتراك منشأتك',
};

/**
 * Subscription invoices, the email outbox and automatic reminders (docs/ADMIN_PORTAL.md v2).
 * Used by the admin portal (/admin/*) and the company owner (/billing/*).
 */
@Injectable()
export class BillingService implements OnModuleInit {
  private readonly logger = new Logger('Billing');

  constructor(
    private readonly prisma: PrismaService,
    private readonly platform: PlatformService,
    private readonly mail: MailService,
    private readonly notify: NotifyService,
  ) {}

  onModuleInit() {
    this.platform.onExpired((c) => this.sendExpired(c));
  }

  // ================= views =================
  view(i: Invoice, today = todayStr()): InvoiceView {
    const dueDate = dayStr(i.dueDate)!;
    return {
      id: i.id,
      number: i.number,
      companyId: i.companyId,
      companyName: i.companyName,
      status: i.status,
      overdue: i.status === 'ISSUED' && dueDate < today,
      plan: i.plan,
      billingCycle: i.billingCycle,
      periodStart: dayStr(i.periodStart)!,
      periodEnd: dayStr(i.periodEnd)!,
      months: i.months,
      employees: i.employees,
      unitPrice: num(i.unitPrice),
      subtotal: num(i.subtotal),
      discountRate: i.discountRate,
      discount: num(i.discount),
      taxable: num(i.taxable),
      vatRate: i.vatRate,
      vat: num(i.vat),
      total: num(i.total),
      issueDate: dayStr(i.issueDate)!,
      dueDate,
      paidAt: i.paidAt,
      paymentMethod: i.paymentMethod,
      paymentRef: i.paymentRef,
      notes: i.notes,
      voidReason: i.voidReason,
      createdByName: i.createdByName,
      createdAt: i.createdAt,
    };
  }

  /** Invoice & { company (buyer), seller (billing settings) } — the printable tax invoice. */
  async detailView(i: Invoice) {
    const [company, owner, s] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: i.companyId }, select: { id: true, nameAr: true, nameEn: true, crNumber: true, vatNumber: true, city: true } }),
      this.ownerOf(i.companyId),
      this.platform.getSettings(),
    ]);
    return {
      ...this.view(i),
      company: {
        id: i.companyId,
        nameAr: company?.nameAr ?? i.companyName,
        nameEn: company?.nameEn ?? null,
        crNumber: company?.crNumber ?? null,
        vatNumber: company?.vatNumber ?? null,
        city: company?.city ?? null,
        ownerName: owner?.name ?? null,
        ownerEmail: owner?.email ?? null,
        ownerPhone: owner?.phone ?? null,
      },
      seller: s.billing,
    };
  }

  private invoiceCtx(i: InvoiceView): InvoiceCtx {
    return { number: i.number, periodStart: i.periodStart, periodEnd: i.periodEnd, total: i.total, dueDate: i.dueDate, employees: i.employees, plan: i.plan };
  }

  /** Email recipient: the company's first active OWNER (fallback: first OWNER). */
  async ownerOf(companyId: string) {
    const select = { id: true, name: true, email: true, phone: true } as const;
    return (
      (await this.prisma.user.findFirst({ where: { companyId, role: 'OWNER', isActive: true }, orderBy: { createdAt: 'asc' }, select })) ??
      (await this.prisma.user.findFirst({ where: { companyId, role: 'OWNER' }, orderBy: { createdAt: 'asc' }, select }))
    );
  }

  /** Email the owner + in-app notification. null = skipped (no owner, or dedupeKey already used). */
  private async deliver(companyId: string, type: EmailType, build: (ownerName: string | null) => EmailContent, opts: { dedupeKey?: string; owner?: { id: string; name: string; email: string } | null } = {}) {
    const owner = opts.owner === undefined ? await this.ownerOf(companyId) : opts.owner;
    if (!owner) return null;
    const content = build(owner.name);
    const log = await this.mail.send({ companyId, to: owner.email, subject: content.subject, body: content.body, type, dedupeKey: opts.dedupeKey ?? null });
    if (!log) return null;
    try {
      await this.notify.toUsers(companyId, [owner.id], NOTIFY_TITLE[type], content.subject.split(' | ')[0], '/app/billing');
    } catch (e) {
      this.logger.warn(`notification failed for ${companyId}: ${(e as Error).message}`);
    }
    return log;
  }

  private emailView(e: EmailLog): EmailLogView {
    const { dedupeKey: _k, ...rest } = e;
    return rest;
  }

  // ================= admin: invoices =================
  async list(q: InvoicesQuery) {
    const { page, pageSize, skip, take } = pageParams(q);
    const today = todayStr();
    const where: Prisma.InvoiceWhereInput = {};
    const and: Prisma.InvoiceWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.companyId) and.push({ companyId: q.companyId });
    if (q.overdue === true || q.overdue === 'true') and.push({ status: 'ISSUED', dueDate: { lt: day(today) } });
    if (q.overdue === false || q.overdue === 'false') and.push({ NOT: { status: 'ISSUED', dueDate: { lt: day(today) } } });
    const search = q.search?.trim();
    if (search) {
      const has = { contains: search, mode: 'insensitive' as const };
      and.push({ OR: [{ number: has }, { companyName: has }, { company: { nameAr: has } }, { company: { nameEn: has } }] });
    }
    if (and.length) where.AND = and;
    const [rows, total, summary] = await Promise.all([
      this.prisma.invoice.findMany({ where, orderBy: [{ createdAt: 'desc' }, { number: 'desc' }], skip, take }),
      this.prisma.invoice.count({ where }),
      this.summary(today),
    ]);
    return { data: rows.map((r) => this.view(r, today)), total, page, pageSize, summary };
  }

  /** Platform-wide tiles (ignore list filters). */
  async summary(today = todayStr()) {
    const monthStart = riyadhDateTime(`${today.slice(0, 7)}-01`, '00:00');
    const agg = (where: Prisma.InvoiceWhereInput) => this.prisma.invoice.aggregate({ where, _count: { _all: true }, _sum: { total: true } });
    const [outstanding, overdue, paid] = await Promise.all([
      agg({ status: 'ISSUED' }),
      agg({ status: 'ISSUED', dueDate: { lt: day(today) } }),
      agg({ status: 'PAID', paidAt: { gte: monthStart } }),
    ]);
    const tile = (a: Awaited<ReturnType<typeof agg>>) => ({ count: a._count._all, amount: round2(num(a._sum.total)) });
    return { outstanding: tile(outstanding), overdue: tile(overdue), paidThisMonth: tile(paid) };
  }

  async detail(id: string) {
    const i = await this.prisma.invoice.findUnique({ where: { id } });
    if (!i) throw invoiceNotFound();
    return this.detailView(i);
  }

  async companyInvoices(companyId: string, take = 20) {
    const rows = await this.prisma.invoice.findMany({ where: { companyId }, orderBy: [{ createdAt: 'desc' }, { number: 'desc' }], take });
    const today = todayStr();
    return rows.map((r) => this.view(r, today));
  }

  async companyEmails(companyId: string, take = 20) {
    return this.prisma.emailLog.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take, select: emailSelect });
  }

  async create(admin: PlatformUser, companyId: string, dto: CreateInvoiceDto): Promise<InvoiceView> {
    const c = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!c) throw companyNotFound();
    if (c.status === 'PENDING') throw badRequest('Cannot invoice a company pending approval', 'لا يمكن إصدار فاتورة لمنشأة بانتظار الموافقة');
    if (dto.periodStart && !isRealDay(dto.periodStart)) throw badRequest('periodStart is not a valid date', 'تاريخ بداية الفترة غير صحيح');
    const s = await this.platform.getSettings();
    const unitPrice = dto.unitPrice ?? this.platform.effectivePrice(c, s);
    if (unitPrice === null || unitPrice === undefined) throw badRequest('Set a price per employee for this company first', 'حدد سعر الموظف لهذه المنشأة أولاً');

    const today = todayStr();
    let periodStart = dto.periodStart;
    if (!periodStart) {
      const last = await this.prisma.invoice.findFirst({ where: { companyId, status: { not: 'VOID' } }, orderBy: { periodEnd: 'desc' }, select: { periodEnd: true } });
      periodStart = last ? addDaysStr(dayStr(last.periodEnd)!, 1) : today;
    }
    const employees = dto.employees ?? Math.max(1, await this.prisma.employee.count({ where: { companyId, status: { not: 'TERMINATED' } } }));
    const billingCycle = dto.billingCycle ?? c.billingCycle;
    const amounts = computeInvoice({ employees, unitPrice, billingCycle, annualDiscount: s.annualDiscount, vatRate: s.billing.vatRate });
    const periodEnd = periodEndOf(periodStart, amounts.months);
    const dueDate = addDaysStr(today, s.billing.invoiceDueDays);
    const year = Number(today.slice(0, 4));

    let created: Invoice | null = null;
    for (let attempt = 0; !created; attempt++) {
      const existing = await this.prisma.invoice.findMany({ where: { number: { startsWith: `SH-${year}-` } }, select: { number: true } });
      const number = nextInvoiceNumber(year, existing.map((e) => e.number));
      try {
        created = await this.prisma.$transaction(async (tx) => {
          const inv = await tx.invoice.create({
            data: {
              number,
              companyId,
              companyName: c.nameAr,
              plan: c.plan,
              billingCycle,
              periodStart: day(periodStart!),
              periodEnd: day(periodEnd),
              months: amounts.months,
              employees,
              unitPrice,
              subtotal: amounts.subtotal,
              discountRate: amounts.discountRate,
              discount: amounts.discount,
              taxable: amounts.taxable,
              vatRate: s.billing.vatRate,
              vat: amounts.vat,
              total: amounts.total,
              issueDate: day(today),
              dueDate: day(dueDate),
              notes: dto.notes?.trim() || null,
              createdById: admin.id,
              createdByName: admin.name,
            },
          });
          await this.platform.logEvent(
            {
              companyId,
              companyName: c.nameAr,
              type: 'INVOICE_ISSUED',
              fromStatus: c.status,
              toStatus: c.status,
              data: { invoiceId: inv.id, number, total: amounts.total, periodStart, periodEnd },
              admin: { id: admin.id, name: admin.name },
            },
            tx,
          );
          return inv;
        });
      } catch (e) {
        if (isUniqueViolation(e) && attempt < 5) continue; // number taken by a concurrent issue → next one
        throw e;
      }
    }
    const v = this.view(created, today);
    if (dto.sendEmail !== false) {
      await this.deliver(companyId, 'INVOICE_ISSUED', (ownerName) => invoiceIssuedEmail({ companyName: c.nameAr, ownerName, invoice: this.invoiceCtx(v), billing: s.billing }));
    }
    return v;
  }

  async pay(admin: PlatformUser, id: string, dto: PayInvoiceDto): Promise<InvoiceView> {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw invoiceNotFound();
    if (inv.status !== 'ISSUED') throw ALREADY_PROCESSED();
    if (dto.paidAt && !isRealDay(dto.paidAt)) throw badRequest('paidAt is not a valid date', 'تاريخ الدفع غير صحيح');
    const now = new Date();
    const today = todayStr(now);
    const paidAt = !dto.paidAt || dto.paidAt === today ? now : riyadhDateTime(dto.paidAt, '12:00');
    const extend = dto.extendSubscription !== false;

    let company: Company | null = null;
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.invoice.updateMany({
        where: { id, status: 'ISSUED' },
        data: { status: 'PAID', paidAt, paymentMethod: dto.paymentMethod, paymentRef: dto.paymentRef?.trim() || null },
      });
      if (!res.count) throw ALREADY_PROCESSED();
      const c = await tx.company.findUnique({ where: { id: inv.companyId } });
      if (!c) throw companyNotFound();
      const data: Prisma.CompanyUpdateInput = {};
      let toStatus = c.status;
      if (extend) {
        const end = endOfDay(dayStr(inv.periodEnd)!);
        if (!c.subscriptionEndsAt || c.subscriptionEndsAt < end) data.subscriptionEndsAt = end;
        if (c.status === 'TRIAL' || c.status === 'EXPIRED') {
          toStatus = 'ACTIVE';
          data.status = 'ACTIVE';
          data.trialEndsAt = null;
          if (!c.activatedAt) data.activatedAt = now;
        }
        if (Object.keys(data).length) company = await tx.company.update({ where: { id: c.id }, data });
      }
      company = company ?? c;
      await this.platform.logEvent(
        {
          companyId: c.id,
          companyName: c.nameAr,
          type: 'INVOICE_PAID',
          fromStatus: c.status,
          toStatus,
          data: { invoiceId: id, number: inv.number, total: num(inv.total), paymentMethod: dto.paymentMethod, paymentRef: dto.paymentRef ?? null, subscriptionEndsAt: company.subscriptionEndsAt },
          admin: { id: admin.id, name: admin.name },
        },
        tx,
      );
    });
    const v = this.view(await this.prisma.invoice.findUniqueOrThrow({ where: { id } }));
    const c = company as Company | null;
    await this.deliver(inv.companyId, 'PAYMENT_RECEIVED', (ownerName) =>
      paymentReceivedEmail({
        companyName: c?.nameAr ?? inv.companyName,
        ownerName,
        invoice: this.invoiceCtx(v),
        paymentMethod: dto.paymentMethod,
        subscriptionEndsAt: c?.subscriptionEndsAt && c.subscriptionEndsAt > now ? todayStr(c.subscriptionEndsAt) : null,
      }),
    );
    return v;
  }

  async void(admin: PlatformUser, id: string, dto: VoidInvoiceDto): Promise<InvoiceView> {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw invoiceNotFound();
    const reason = dto.reason.trim();
    if (!reason) throw badRequest('reason is required', 'سبب الإلغاء مطلوب');
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.invoice.updateMany({ where: { id, status: 'ISSUED' }, data: { status: 'VOID', voidReason: reason, voidedAt: new Date() } });
      if (!res.count) throw ALREADY_PROCESSED();
      const c = await tx.company.findUnique({ where: { id: inv.companyId }, select: { status: true, nameAr: true } });
      await this.platform.logEvent(
        {
          companyId: inv.companyId,
          companyName: c?.nameAr ?? inv.companyName,
          type: 'INVOICE_VOIDED',
          fromStatus: c?.status ?? null,
          toStatus: c?.status ?? null,
          data: { invoiceId: id, number: inv.number, total: num(inv.total), reason },
          admin: { id: admin.id, name: admin.name },
        },
        tx,
      );
    });
    return this.view(await this.prisma.invoice.findUniqueOrThrow({ where: { id } }));
  }

  // ================= admin: emails =================
  async emails(q: EmailsQuery): Promise<Paginated<EmailLogView & { companyName: string | null }>> {
    const { page, pageSize, skip, take } = pageParams(q);
    const where: Prisma.EmailLogWhereInput = {};
    if (q.type) where.type = q.type;
    if (q.status) where.status = q.status;
    if (q.companyId) where.companyId = q.companyId;
    const [total, rows] = await Promise.all([
      this.prisma.emailLog.count({ where }),
      this.prisma.emailLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take, select: emailSelect }),
    ]);
    const ids = [...new Set(rows.map((r) => r.companyId).filter((x): x is string => !!x))];
    const companies = ids.length ? await this.prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, nameAr: true } }) : [];
    const name = new Map(companies.map((c) => [c.id, c.nameAr]));
    return { data: rows.map((r) => ({ ...r, companyName: (r.companyId && name.get(r.companyId)) || null })), total, page, pageSize };
  }

  /** Manual reminder from the admin portal (no dedupe). */
  async remind(admin: PlatformUser, companyId: string, dto: RemindDto): Promise<EmailLogView> {
    const c = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!c) throw companyNotFound();
    const owner = await this.ownerOf(companyId);
    if (!owner) throw notFound('Owner', 'لا يوجد مالك لهذه المنشأة');
    const daysLeft = this.platform.daysLeft(c);
    const end = c.status === 'TRIAL' ? c.trialEndsAt : c.subscriptionEndsAt;
    const log = await this.deliver(
      companyId,
      'MANUAL_REMINDER',
      (ownerName) => manualReminderEmail({ companyName: c.nameAr, ownerName, plan: c.plan, status: c.status, daysLeft, endDay: end ? todayStr(end) : null, message: dto.message }),
      { owner },
    );
    if (!log) throw badRequest('Email could not be recorded', 'تعذّر حفظ الرسالة');
    await this.platform.logEvent({
      companyId,
      companyName: c.nameAr,
      type: 'REMINDER_SENT',
      fromStatus: c.status,
      toStatus: c.status,
      data: { type: 'MANUAL_REMINDER', daysLeft, emailId: log.id, status: log.status },
      admin: { id: admin.id, name: admin.name },
    });
    return this.emailView(log);
  }

  // ================= reminders =================
  private async reminderLogged(companyId: string, data: Record<string, unknown>) {
    const c = await this.prisma.company.findUnique({ where: { id: companyId }, select: { nameAr: true, status: true } });
    await this.platform.logEvent({ companyId, companyName: c?.nameAr ?? null, type: 'REMINDER_SENT', fromStatus: c?.status ?? null, toStatus: c?.status ?? null, data });
  }

  /**
   * The reminder job (daily 09:00 Riyadh + POST /admin/reminders/run): persists due expiries first (which send
   * EXPIRED emails via the expiry listener), then sends due TRIAL_ENDING / SUBSCRIPTION_ENDING / INVOICE_OVERDUE
   * reminders. Dedupe keys make re-runs no-ops. `sent` counts the reminders of this run that were sent or logged.
   */
  async runReminders(now = new Date()): Promise<{ sent: number }> {
    await this.platform.expireDue(now);
    const s = await this.platform.getSettings();
    if (!s.reminders.enabled) return { sent: 0 };
    const today = todayStr(now);
    const [companies, invoices] = await Promise.all([
      this.prisma.company.findMany({
        where: { OR: [{ status: 'TRIAL', trialEndsAt: { gt: now } }, { status: 'ACTIVE', subscriptionEndsAt: { gt: now } }] },
        select: { id: true, nameAr: true, status: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true },
      }),
      this.prisma.invoice.findMany({ where: { status: 'ISSUED', dueDate: { lt: day(today) } } }),
    ]);
    const due = selectReminders({
      companies,
      invoices: invoices.map((i) => ({ id: i.id, companyId: i.companyId, dueDate: dayStr(i.dueDate)! })),
      settings: s.reminders,
      now,
    });
    const byCompany = new Map(companies.map((c) => [c.id, c]));
    const byInvoice = new Map(invoices.map((i) => [i.id, i]));
    let sent = 0;
    for (const r of due) {
      try {
        let log: EmailLog | null = null;
        let data: Record<string, unknown>;
        if (r.type === 'INVOICE_OVERDUE') {
          const inv = byInvoice.get(r.invoiceId)!;
          const v = this.view(inv, today);
          const name = (await this.prisma.company.findUnique({ where: { id: inv.companyId }, select: { nameAr: true } }))?.nameAr ?? inv.companyName;
          log = await this.deliver(inv.companyId, 'INVOICE_OVERDUE', (ownerName) => invoiceOverdueEmail({ companyName: name, ownerName, invoice: this.invoiceCtx(v), daysOverdue: r.daysOverdue, billing: s.billing }), {
            dedupeKey: r.dedupeKey,
          });
          data = { type: r.type, daysOverdue: r.daysOverdue, invoiceId: inv.id, number: inv.number };
        } else {
          const c = byCompany.get(r.companyId)!;
          const build =
            r.type === 'TRIAL_ENDING'
              ? (ownerName: string | null) => trialEndingEmail({ companyName: c.nameAr, ownerName, daysLeft: r.daysLeft, endDay: r.endDay })
              : (ownerName: string | null) => subscriptionEndingEmail({ companyName: c.nameAr, ownerName, daysLeft: r.daysLeft, endDay: r.endDay, plan: c.plan });
          log = await this.deliver(c.id, r.type, build, { dedupeKey: r.dedupeKey });
          data = { type: r.type, daysLeft: r.daysLeft };
        }
        if (log && log.status !== 'FAILED') {
          sent++;
          await this.reminderLogged(r.companyId, data);
        }
      } catch (e) {
        this.logger.error(`reminder ${r.dedupeKey} failed: ${(e as Error).message}`);
      }
    }
    return { sent };
  }

  @Cron('0 0 9 * * *', { name: 'subscription-reminders', timeZone: 'Asia/Riyadh' })
  async dailyReminders() {
    try {
      const { sent } = await this.runReminders();
      if (sent) this.logger.log(`sent ${sent} subscription reminder${sent === 1 ? '' : 's'}`);
    } catch (e) {
      this.logger.error(`reminder job failed: ${(e as Error).message}`);
    }
  }

  /** Expiry listener: EXPIRED email once per (company, end day) when reminders.enabled && notifyOnExpiry. */
  async sendExpired(c: ExpiredCompany) {
    const s = await this.platform.getSettings();
    if (!s.reminders.enabled || !s.reminders.notifyOnExpiry) return;
    const wasTrial = c.status === 'TRIAL';
    const end = wasTrial ? c.trialEndsAt : c.subscriptionEndsAt;
    const endDay = end ? todayStr(end) : todayStr();
    const log = await this.deliver(c.id, 'EXPIRED', (ownerName) => expiredEmail({ companyName: c.nameAr, ownerName, endDay, wasTrial }), {
      dedupeKey: dedupeKey({ type: 'EXPIRED', companyId: c.id, endDay }),
    });
    if (log && log.status !== 'FAILED') await this.reminderLogged(c.id, { type: 'EXPIRED', daysLeft: 0 });
  }

  // ================= company owner =================
  async subscription(companyId: string) {
    const c = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!c) throw companyNotFound();
    const [s, activeEmployees] = await Promise.all([
      this.platform.getSettings(),
      this.prisma.employee.count({ where: { companyId, status: { not: 'TERMINATED' } } }),
    ]);
    return {
      status: c.status,
      plan: c.plan,
      billingCycle: c.billingCycle,
      effectivePrice: this.platform.effectivePrice(c, s),
      maxEmployees: c.maxEmployees,
      activeEmployees,
      trialEndsAt: c.trialEndsAt,
      subscriptionEndsAt: c.subscriptionEndsAt,
      daysLeft: this.platform.daysLeft(c),
    };
  }

  async ownerInvoices(companyId: string, q: { page?: number; pageSize?: number }): Promise<Paginated<InvoiceView>> {
    const { page, pageSize, skip, take } = pageParams(q);
    const where = { companyId };
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({ where, orderBy: [{ createdAt: 'desc' }, { number: 'desc' }], skip, take }),
      this.prisma.invoice.count({ where }),
    ]);
    const today = todayStr();
    return { data: rows.map((r) => this.view(r, today)), total, page, pageSize };
  }

  async ownerInvoice(companyId: string, id: string) {
    const i = await this.prisma.invoice.findFirst({ where: { id, companyId } });
    if (!i) throw invoiceNotFound();
    return this.detailView(i);
  }
}
