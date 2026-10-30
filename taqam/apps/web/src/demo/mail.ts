/**
 * Demo outbox (docs/ADMIN_PORTAL.md v2 "Email"). Nothing ever leaves the browser: every message is stored with
 * status LOGGED, exactly like the API without SMTP_HOST. Bodies are Arabic first with an English paragraph.
 */
import { isolateLtrRuns, ltr } from '@/lib/bidi';
import { arDays } from '@/lib/format';
import { nextId, type Company, type DB, type EmailLog, type EmailType, type Invoice } from './db';
import { nowIso, type Services } from './services';

const PLAN_AR: Record<string, string> = { ESSENTIALS: 'الأساسية', GROWTH: 'النمو', ENTERPRISE: 'المؤسسات' };
const STATUS_AR: Record<string, string> = { PENDING: 'بانتظار الموافقة', TRIAL: 'تجريبي', ACTIVE: 'نشط', SUSPENDED: 'موقوف', EXPIRED: 'منتهي' };
const money = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;

export { arDays };
const enDays = (n: number) => (n <= 0 ? 'today' : n === 1 ? '1 day' : `${n} days`);

/** Recipient: the company's first active OWNER (fallback: first OWNER). */
export function ownerOf(db: DB, companyId: string) {
  const owners = db.users.filter((u) => u.companyId === companyId && u.role === 'OWNER').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return owners.find((u) => u.isActive) ?? owners[0] ?? null;
}

function contact(db: DB) {
  const b = db.settings.billing;
  return { ar: `للتواصل: ${ltr(b.sellerEmail)} — ${ltr(b.sellerPhone)}`, en: `Contact us: ${b.sellerEmail} — ${b.sellerPhone}` };
}

export interface MailVars { daysLeft?: number; daysOverdue?: number; endDay?: string | null; invoice?: Invoice; message?: string | null }

/**
 * Subject + plain-text body for one email type. ISO dates and document numbers inside the Arabic text are wrapped in
 * Unicode left-to-right isolates so they are not reordered by the bidi algorithm.
 */
export function compose(db: DB, c: Company, type: EmailType, v: MailVars = {}): { subject: string; body: string } {
  const m = composeRaw(db, c, type, v);
  const [ar, ...rest] = m.body.split('\n\n');
  // Greeting + Arabic paragraph(s) come before the English one; isolate Latin runs in the Arabic part only.
  const enAt = rest.findIndex((p) => /^[A-Za-z]/.test(p.trim()));
  const arParts = enAt === -1 ? rest : rest.slice(0, enAt);
  const tail = enAt === -1 ? [] : rest.slice(enAt);
  return { subject: isolateLtrRuns(m.subject), body: [ar, ...arParts.map(isolateLtrRuns), ...tail].join('\n\n') };
}
function composeRaw(db: DB, c: Company, type: EmailType, v: MailVars = {}): { subject: string; body: string } {
  const owner = ownerOf(db, c.id);
  const hi = `مرحباً ${owner?.name ?? ''}،`.replace(' ،', '،');
  const k = contact(db);
  const name = c.nameAr; const nameEn = c.nameEn || c.nameAr;
  const inv = v.invoice;
  const sign = '\n\nفريق شؤون\nShuoon team';
  const d = v.daysLeft ?? 0;
  switch (type) {
    case 'TRIAL_ENDING':
      return {
        subject: d <= 0 ? `تنتهي الفترة التجريبية لـ ${name} اليوم` : `تنتهي الفترة التجريبية لـ ${name} خلال ${arDays(d)}`,
        body: `${hi}\n\nتنتهي الفترة التجريبية لمنشأتك «${name}» في شؤون ${d <= 0 ? 'اليوم' : `خلال ${arDays(d)}`}${v.endDay ? ` (${v.endDay})` : ''}. فعّل اشتراكك الآن لتستمر في إدارة الحضور والرواتب دون انقطاع.\n${k.ar}\n\nThe free trial of “${nameEn}” on Shuoon ends ${d <= 0 ? 'today' : `in ${enDays(d)}`}. Subscribe now to keep attendance and payroll running without interruption.\n${k.en}${sign}`,
      };
    case 'SUBSCRIPTION_ENDING':
      return {
        subject: d <= 0 ? `ينتهي اشتراك ${name} في شؤون اليوم` : `ينتهي اشتراك ${name} في شؤون خلال ${arDays(d)}`,
        body: `${hi}\n\nينتهي اشتراك منشأتك «${name}» (باقة ${PLAN_AR[c.plan] ?? c.plan}) ${d <= 0 ? 'اليوم' : `خلال ${arDays(d)}`}${v.endDay ? ` (${v.endDay})` : ''}. جدّد اشتراكك لتجنّب إيقاف الخدمة.\n${k.ar}\n\nThe Shuoon subscription of “${nameEn}” ends ${d <= 0 ? 'today' : `in ${enDays(d)}`}. Renew to avoid any interruption.\n${k.en}${sign}`,
      };
    case 'EXPIRED':
      return {
        subject: `انتهى اشتراك ${name} في شؤون`,
        body: `${hi}\n\nانتهى اشتراك منشأتك «${name}» في شؤون${v.endDay ? ` بتاريخ ${v.endDay}` : ''}، وتوقف دخول المستخدمين. بياناتك محفوظة بأمان — تواصل معنا للتجديد وستعود الخدمة فوراً.\n${k.ar}\n\nThe Shuoon subscription of “${nameEn}” has ended and sign-in is paused. Your data is safe — contact us to renew and access is restored immediately.\n${k.en}${sign}`,
      };
    case 'INVOICE_ISSUED':
      return {
        subject: `فاتورة جديدة ${inv?.number ?? ''} من شؤون`,
        body: `${hi}\n\nصدرت فاتورة اشتراك منشأتك «${name}» رقم ${inv?.number} عن الفترة ${inv?.periodStart} إلى ${inv?.periodEnd} بمبلغ ${money(inv?.total ?? 0)}${inv?.vat ? ' شاملة ضريبة القيمة المضافة' : ''}، وتستحق في ${inv?.dueDate}.\n${bankLine(db)}${k.ar}\n\nInvoice ${inv?.number} for “${nameEn}” (${inv?.periodStart} – ${inv?.periodEnd}) is SAR ${(inv?.total ?? 0).toFixed(2)}${inv?.vat ? ' incl. VAT' : ''}, due on ${inv?.dueDate}.\n${k.en}${sign}`,
      };
    case 'PAYMENT_RECEIVED':
      return {
        subject: `تم استلام دفعتك — فاتورة ${inv?.number ?? ''}`,
        body: `${hi}\n\nشكراً لك! استلمنا مبلغ ${money(inv?.total ?? 0)} عن الفاتورة ${inv?.number}، واشتراك «${name}» ساري حتى ${v.endDay ?? inv?.periodEnd}.\n${k.ar}\n\nThank you! We received SAR ${(inv?.total ?? 0).toFixed(2)} for invoice ${inv?.number}. Your subscription is active until ${v.endDay ?? inv?.periodEnd}.\n${k.en}${sign}`,
      };
    case 'INVOICE_OVERDUE': {
      const o = v.daysOverdue ?? 0;
      return {
        subject: `تذكير: الفاتورة ${inv?.number ?? ''} متأخرة السداد`,
        body: `${hi}\n\nنذكّرك بأن الفاتورة ${inv?.number} بمبلغ ${money(inv?.total ?? 0)} كانت مستحقة في ${inv?.dueDate} (متأخرة ${arDays(o)}). نرجو السداد لتجنّب إيقاف الخدمة، وتجاهل هذه الرسالة إن تم السداد.\n${bankLine(db)}${k.ar}\n\nReminder: invoice ${inv?.number} (SAR ${(inv?.total ?? 0).toFixed(2)}) was due on ${inv?.dueDate} — ${enDays(o)} overdue. Please settle it to avoid a service interruption.\n${k.en}${sign}`,
      };
    }
    case 'MANUAL_REMINDER':
    default: {
      const left = v.daysLeft;
      const status = `الحالة: ${STATUS_AR[c.status] ?? c.status} · الباقة: ${PLAN_AR[c.plan] ?? c.plan}${left !== undefined && left !== null ? ` · المتبقي: ${arDays(left)}` : ''}`;
      const statusEn = `Status: ${c.status} · Plan: ${c.plan}${left !== undefined && left !== null ? ` · Days left: ${left}` : ''}`;
      return {
        subject: `تذكير بخصوص اشتراك ${name} في شؤون`,
        body: `${hi}\n\n${v.message?.trim() || 'نود تذكيرك بحالة اشتراك منشأتك في شؤون.'}\n\n${status}\n${k.ar}\n\nA reminder about the Shuoon subscription of “${nameEn}”.\n${statusEn}\n${k.en}${sign}`,
      };
    }
  }
}
function bankLine(db: DB) {
  const b = db.settings.billing;
  return b.iban ? `التحويل إلى: ${b.bankName ? `${b.bankName} — ` : ''}${ltr(b.iban)}\n` : '';
}

/**
 * Logs one email to the company owner. Returns null (nothing stored) when the company has no owner or the
 * dedupe key was already used. Every email that did not fail (the demo only logs, so all of them) also creates an
 * in-app notification for the owner linking to /app/billing, unless `notify: false` (seeded history).
 */
export function sendEmail(svc: Services, c: Company, type: EmailType, vars: MailVars = {}, opts: { dedupeKey?: string | null; createdAt?: string; notify?: boolean } = {}): EmailLog | null {
  const db = svc.db;
  const owner = ownerOf(db, c.id);
  if (!owner) return null;
  if (opts.dedupeKey && db.emails.some((e) => e.dedupeKey === opts.dedupeKey)) return null;
  const { subject, body } = compose(db, c, type, vars);
  const at = opts.createdAt ?? nowIso();
  const log: EmailLog = { id: nextId(db, 'mail'), companyId: c.id, to: owner.email, subject, body, type, status: 'LOGGED', error: null, dedupeKey: opts.dedupeKey ?? null, createdAt: at };
  db.emails.push(log);
  if ((opts.notify ?? true) && log.status !== 'FAILED') {
    svc.notifyUsers(c.id, [owner.id], subject, body.split('\n\n')[1] ?? null, '/app/billing', { createdAt: at });
  }
  svc.dirty = true;
  return log;
}
export function emailView(db: DB, e: EmailLog) {
  const { dedupeKey: _k, ...rest } = e;
  const c = e.companyId ? db.companies.find((x) => x.id === e.companyId) : null;
  return { ...rest, companyName: c?.nameAr ?? null };
}
