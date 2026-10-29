/** Demo API — platform admin portal (docs/ADMIN_PORTAL.md). Every route is SUPER_ADMIN only. */
import { addMonths, r2, todayStr } from './dates';
import { nextId, type Company, type CompanyStatus, type DB, type PlatformAdmin, type Role } from './db';
import { badRequest, conflict, notFound } from './errors';
import {
  BILLING_CYCLES, EVENT_TYPES, LEAD_STATUSES, PLANS, adminCompanyView, companyOwner, eventView, extendFrom, isPast, logEvent,
  parseEndDate, applyExpiry, type Actor, type AdminCompanyView,
} from './lifecycle';
import { route, v, paginate, byCreatedAsc, byCreatedDesc, ok, type Query, type Route } from './router';
import { authResponse } from './routes-core';
import { byIssueDesc, invoiceView, runRemindersDaily } from './billing';
import { emailView } from './mail';
import { billingSettingsError, normalizeDays, remindersSettingsError, type ReminderSettings } from '@/lib/billing';
import { nowIso, type AuthUser, type Services } from './services';

const SA: Role[] = ['SUPER_ADMIN'];
const actor = (u: AuthUser): Actor => ({ id: u.id, name: u.name });

function findCompany(db: DB, id: string): Company {
  const c = db.companies.find((x) => x.id === id);
  if (!c) throw notFound('Company', 'المنشأة غير موجودة');
  return c;
}
/** undefined = absent, null = explicitly cleared, number otherwise. */
function nullableNum(b: Record<string, unknown>, k: string, min = 0): number | null | undefined {
  if (b[k] === undefined) return undefined;
  if (b[k] === null || b[k] === '') return null;
  return v.num(b, k, { min });
}
function int(b: Record<string, unknown>, k: string, min: number, max: number, optional = false): number | undefined {
  const n = v.num(b, k, { min, max, optional });
  if (n !== undefined && !Number.isInteger(n)) throw badRequest(`${k} must be an integer number`);
  return n;
}
function adminView(a: PlatformAdmin) {
  return { id: a.id, name: a.name, email: a.email, isActive: a.isActive, lastLoginAt: a.lastLoginAt, createdAt: a.createdAt };
}
const sum = (rows: AdminCompanyView[]) => r2(rows.reduce((s, c) => s + c.mrr, 0));
function companyUsers(svc: Services, companyId: string, roles: Role[]) {
  return svc.db.users.filter((u) => u.companyId === companyId && u.isActive && roles.includes(u.role)).map((u) => u.id);
}

/** ValidationPipe whitelist for nested settings objects. */
function pickKnown(o: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

const SORTS: Record<string, { cmp: (a: AdminCompanyView, b: AdminCompanyView) => number; dir: 1 | -1 }> = {
  createdAt: { cmp: (a, b) => a.createdAt.localeCompare(b.createdAt), dir: -1 },
  name: { cmp: (a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'), dir: 1 },
  employees: { cmp: (a, b) => a.activeEmployees - b.activeEmployees || a.employeesCount - b.employeesCount, dir: -1 },
  lastActivityAt: { cmp: (a, b) => (a.lastActivityAt ?? '').localeCompare(b.lastActivityAt ?? ''), dir: -1 },
};
function listCompanies(svc: Services, q: Query) {
  const s = (q.search ?? '').trim().toLowerCase();
  const statuses = q.status ? q.status.split(',') : null;
  let rows = svc.db.companies.map((c) => adminCompanyView(svc, c)).filter((c) =>
    (!statuses || statuses.includes(c.status)) && (!q.plan || c.plan === q.plan) &&
    (!s || [c.nameAr, c.nameEn, c.crNumber, c.ownerName, c.ownerEmail, c.ownerPhone, c.city].some((x) => (x ?? '').toLowerCase().includes(s))));
  const raw = q.sort ?? 'createdAt';
  const key = raw.replace(/^-/, '');
  const sort = SORTS[key] ?? SORTS.createdAt;
  const dir = q.order === 'asc' ? 1 : q.order === 'desc' ? -1 : raw.startsWith('-') ? -1 : sort.dir;
  rows = rows.sort((a, b) => dir * sort.cmp(a, b) || b.createdAt.localeCompare(a.createdAt));
  return paginate(rows, q);
}

function companyDetail(svc: Services, c: Company) {
  const db = svc.db;
  const view = adminCompanyView(svc, c);
  const owner = companyOwner(db, c.id);
  const today = todayStr();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const from = new Date(Date.now() - 29 * 86400000 + 3 * 3600000).toISOString().slice(0, 10);
  const runs = db.runs.filter((r) => r.companyId === c.id).sort((a, b) => b.period.localeCompare(a.period));
  return {
    ...view,
    owner: owner ? { id: owner.id, name: owner.name, email: owner.email, phone: owner.phone ?? null } : null,
    users: db.users.filter((u) => u.companyId === c.id).sort(byCreatedAsc).map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, lastLoginAt: u.lastLoginAt })),
    usage: {
      employees: view.employeesCount, activeEmployees: view.activeEmployees, branches: view.branchesCount, users: view.usersCount, payrollRuns: runs.length,
      lastPayrollPeriod: runs[0]?.period ?? null,
      leaveRequests30d: db.leaves.filter((l) => l.companyId === c.id && l.createdAt >= since).length,
      checkIns30d: db.attendance.filter((r) => r.companyId === c.id && !!r.checkIn && r.date >= from && r.date <= today).length,
    },
    events: db.companyEvents.filter((e) => e.companyId === c.id).sort(byCreatedDesc).slice(0, 50).map((e) => eventView(db, e)),
    invoices: db.invoices.filter((i) => i.companyId === c.id).sort(byIssueDesc).slice(0, 20).map((i) => invoiceView(i, today)),
    emails: db.emails.filter((e) => e.companyId === c.id).sort(byCreatedDesc).slice(0, 20).map((e) => emailView(db, e)),
  };
}

function setStatus(c: Company, status: CompanyStatus) {
  c.status = status;
  c.updatedAt = nowIso();
}

export const adminRoutes: Route[] = [
  // ---------- overview ----------
  route('GET', '/admin/overview', SA, ({ db, svc }) => {
    runRemindersDaily(svc); // the demo's stand-in for the daily 09:00 job
    const views = db.companies.map((c) => adminCompanyView(svc, c));
    const count = (s: CompanyStatus) => views.filter((c) => c.status === s).length;
    const ids = new Set(db.companies.map((c) => c.id));
    const mrr = sum(views);
    const thisPeriod = todayStr().slice(0, 7);
    const active = views.filter((c) => c.status === 'ACTIVE');
    return {
      companies: { total: views.length, pending: count('PENDING'), trial: count('TRIAL'), active: count('ACTIVE'), suspended: count('SUSPENDED'), expired: count('EXPIRED') },
      employees: db.employees.filter((e) => ids.has(e.companyId) && e.status !== 'TERMINATED').length,
      users: db.users.filter((u) => ids.has(u.companyId)).length,
      mrr, arr: r2(mrr * 12),
      signupsByMonth: Array.from({ length: 12 }, (_, i) => {
        const period = addMonths(thisPeriod, i - 11);
        return { period, count: views.filter((c) => todayStr(new Date(c.createdAt)).slice(0, 7) === period).length };
      }),
      mrrByPlan: PLANS.map((plan) => { const rows = active.filter((c) => c.plan === plan); return { plan, mrr: sum(rows), companies: rows.length }; }),
      expiringSoon: views.filter((c) => (c.status === 'TRIAL' || c.status === 'ACTIVE') && c.daysLeft !== null && c.daysLeft <= 14).sort((a, b) => a.daysLeft! - b.daysLeft!),
      recentSignups: views.slice().sort(byCreatedDesc).slice(0, 5),
      newLeads: db.leads.filter((l) => l.status === 'NEW').length,
    };
  }),

  // ---------- companies ----------
  route('GET', '/admin/companies', SA, ({ svc, query }) => listCompanies(svc, query)),
  route('GET', '/admin/companies/:id', SA, ({ db, svc, params }) => companyDetail(svc, findCompany(db, params.id))),
  route('POST', '/admin/companies/:id/activate', SA, ({ db, svc, user, params, body }) => {
    const c = findCompany(db, params.id);
    if (c.status === 'ACTIVE') throw badRequest('Company is already active', 'المنشأة مفعّلة بالفعل');
    const mode = v.oneOf(body, 'mode', ['TRIAL', 'PAID'] as const)!;
    const plan = v.oneOf(body, 'plan', PLANS, true) ?? c.plan;
    const billingCycle = v.oneOf(body, 'billingCycle', BILLING_CYCLES, true) ?? c.billingCycle;
    const maxEmployees = nullableNum(body, 'maxEmployees', 1);
    const pricePerEmployee = nullableNum(body, 'pricePerEmployee', 0);
    const trialDays = int(body, 'trialDays', 1, 365, true) ?? db.settings.trialDays;
    const subscriptionEndsAt = body.subscriptionEndsAt === undefined ? undefined : parseEndDate(body.subscriptionEndsAt, 'subscriptionEndsAt');
    const from = c.status;
    Object.assign(c, { plan, billingCycle, activatedAt: nowIso(), suspendedAt: null, suspensionReason: null });
    if (maxEmployees !== undefined) c.maxEmployees = maxEmployees;
    if (pricePerEmployee !== undefined) c.pricePerEmployee = pricePerEmployee;
    if (mode === 'TRIAL') {
      c.trialEndsAt = extendFrom(null, trialDays);
      if (subscriptionEndsAt !== undefined) c.subscriptionEndsAt = subscriptionEndsAt;
      setStatus(c, 'TRIAL');
    } else {
      c.subscriptionEndsAt = subscriptionEndsAt ?? null;
      setStatus(c, 'ACTIVE');
    }
    logEvent(svc, c, 'ACTIVATED', {
      from, to: c.status, actor: actor(user),
      data: { mode, plan, billingCycle, maxEmployees: c.maxEmployees, pricePerEmployee: c.pricePerEmployee, trialEndsAt: mode === 'TRIAL' ? c.trialEndsAt : null, subscriptionEndsAt: c.subscriptionEndsAt },
    });
    svc.notifyUsers(c.id, companyUsers(svc, c.id, ['OWNER']), 'تم تفعيل حساب منشأتك في شؤون', mode === 'TRIAL' ? 'بدأت الفترة التجريبية — مرحباً بك' : 'اشتراكك فعّال الآن — مرحباً بك', '/app');
    applyExpiry(svc, c);
    return adminCompanyView(svc, c);
  }),
  route('POST', '/admin/companies/:id/suspend', SA, ({ db, svc, user, params, body }) => {
    const c = findCompany(db, params.id);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) throw badRequest('reason should not be empty', 'سبب الإيقاف مطلوب');
    if (c.status === 'SUSPENDED') throw badRequest('Company is already suspended', 'المنشأة موقوفة بالفعل');
    const from = c.status;
    Object.assign(c, { suspendedAt: nowIso(), suspensionReason: reason });
    setStatus(c, 'SUSPENDED');
    logEvent(svc, c, 'SUSPENDED', { from, to: 'SUSPENDED', actor: actor(user), data: { reason } });
    return adminCompanyView(svc, c);
  }),
  route('POST', '/admin/companies/:id/reactivate', SA, ({ db, svc, user, params }) => {
    const c = findCompany(db, params.id);
    if (c.status !== 'SUSPENDED' && c.status !== 'EXPIRED') throw badRequest('Company is not suspended', 'المنشأة ليست موقوفة');
    const from = c.status;
    const before = from === 'SUSPENDED' ? db.companyEvents.filter((e) => e.companyId === c.id && e.type === 'SUSPENDED').sort(byCreatedDesc)[0]?.fromStatus ?? null : null;
    const trialRunning = !!c.trialEndsAt && !isPast(c.trialEndsAt) && !c.subscriptionEndsAt && before !== 'ACTIVE';
    const to: CompanyStatus = trialRunning ? 'TRIAL' : 'ACTIVE';
    if (to === 'ACTIVE' && isPast(c.subscriptionEndsAt)) c.subscriptionEndsAt = null;
    Object.assign(c, { suspendedAt: null, suspensionReason: null, activatedAt: c.activatedAt ?? nowIso() });
    setStatus(c, to);
    logEvent(svc, c, 'REACTIVATED', { from, to, actor: actor(user) });
    return adminCompanyView(svc, c);
  }),
  route('PATCH', '/admin/companies/:id', SA, ({ db, svc, user, params, body }) => {
    const c = findCompany(db, params.id);
    const next: Partial<Company> = {};
    const plan = v.oneOf(body, 'plan', PLANS, true); if (plan) next.plan = plan;
    const billingCycle = v.oneOf(body, 'billingCycle', BILLING_CYCLES, true); if (billingCycle) next.billingCycle = billingCycle;
    const maxEmployees = nullableNum(body, 'maxEmployees', 1); if (maxEmployees !== undefined) next.maxEmployees = maxEmployees;
    const price = nullableNum(body, 'pricePerEmployee', 0); if (price !== undefined) next.pricePerEmployee = price;
    if (body.trialEndsAt !== undefined) next.trialEndsAt = parseEndDate(body.trialEndsAt, 'trialEndsAt');
    if (body.subscriptionEndsAt !== undefined) next.subscriptionEndsAt = parseEndDate(body.subscriptionEndsAt, 'subscriptionEndsAt');
    if (body.adminNotes !== undefined) next.adminNotes = body.adminNotes === null || body.adminNotes === '' ? null : v.str(body, 'adminNotes')!;
    if (body.nameAr !== undefined) next.nameAr = v.str(body, 'nameAr', { min: 2 })!.trim();
    if (body.nameEn !== undefined) next.nameEn = body.nameEn === null || body.nameEn === '' ? null : v.str(body, 'nameEn')!.trim();
    const diff = (keys: (keyof Company)[]) => {
      const out: Record<string, { from: unknown; to: unknown }> = {};
      for (const k of keys) if (next[k] !== undefined && next[k] !== c[k]) out[k] = { from: c[k], to: next[k] };
      return out;
    };
    const planChanges = diff(['plan', 'billingCycle', 'maxEmployees', 'pricePerEmployee']);
    const dateChanges = diff(['trialEndsAt', 'subscriptionEndsAt']);
    const noteChanged = next.adminNotes !== undefined && next.adminNotes !== c.adminNotes;
    Object.assign(c, next, { updatedAt: nowIso() });
    const a = actor(user);
    if (Object.keys(planChanges).length) logEvent(svc, c, 'PLAN_CHANGED', { from: c.status, to: c.status, actor: a, data: { changes: planChanges } });
    if (Object.keys(dateChanges).length) {
      // A new end date in the future revives an EXPIRED company (subscription → ACTIVE, trial → TRIAL).
      const from = c.status;
      if (c.status === 'EXPIRED') {
        if (dateChanges.subscriptionEndsAt && c.subscriptionEndsAt && !isPast(c.subscriptionEndsAt)) setStatus(c, 'ACTIVE');
        else if (dateChanges.trialEndsAt && c.trialEndsAt && !isPast(c.trialEndsAt) && !c.subscriptionEndsAt) setStatus(c, 'TRIAL');
      }
      logEvent(svc, c, 'EXTENDED', { from, to: c.status, actor: a, data: { changes: dateChanges } });
    }
    if (noteChanged) logEvent(svc, c, 'NOTE', { from: c.status, to: c.status, actor: a, data: { note: c.adminNotes } });
    applyExpiry(svc, c);
    return adminCompanyView(svc, c);
  }),
  route('POST', '/admin/companies/:id/extend', SA, ({ db, svc, user, params, body }) => {
    const c = findCompany(db, params.id);
    const days = int(body, 'days', 1, 3650)!;
    const from = c.status;
    let field: 'trialEndsAt' | 'subscriptionEndsAt';
    const prev = { trialEndsAt: c.trialEndsAt, subscriptionEndsAt: c.subscriptionEndsAt };
    if (c.status === 'TRIAL') { field = 'trialEndsAt'; c.trialEndsAt = extendFrom(c.trialEndsAt, days); }
    else if (c.status === 'ACTIVE') { field = 'subscriptionEndsAt'; c.subscriptionEndsAt = extendFrom(c.subscriptionEndsAt, days); }
    else if (c.status === 'EXPIRED') { field = 'subscriptionEndsAt'; c.subscriptionEndsAt = extendFrom(null, days); setStatus(c, 'ACTIVE'); }
    else throw badRequest(`Cannot extend a ${c.status} company`, 'لا يمكن تمديد اشتراك منشأة بهذه الحالة');
    c.updatedAt = nowIso();
    logEvent(svc, c, 'EXTENDED', { from, to: c.status, actor: actor(user), data: { days, field, from: prev[field], to: c[field] } });
    return adminCompanyView(svc, c);
  }),
  route('POST', '/admin/companies/:id/impersonate', SA, ({ db, svc, user, params }) => {
    const c = findCompany(db, params.id);
    const owner = companyOwner(db, c.id);
    if (!owner || !owner.isActive) throw notFound('Owner', 'لا يوجد مالك نشط لهذه المنشأة');
    logEvent(svc, c, 'IMPERSONATED', { from: c.status, to: c.status, actor: actor(user), data: { userId: owner.id, email: owner.email } });
    return authResponse(svc, owner, user.id);
  }),
  route('POST', '/admin/companies/:id/users/:userId/reset-password', SA, ({ db, svc, user, params }) => {
    const c = findCompany(db, params.id);
    const target = db.users.find((u) => u.id === params.userId && u.companyId === c.id);
    if (!target) throw notFound('User', 'المستخدم غير موجود');
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const temporaryPassword = `Tq-${Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')}`;
    target.password = temporaryPassword;
    target.updatedAt = nowIso();
    svc.audit({ id: null, name: user.name, companyId: c.id }, 'RESET_PASSWORD', 'User', target.id, { email: target.email, by: 'PLATFORM_ADMIN' });
    return { temporaryPassword };
  }),
  route('DELETE', '/admin/companies/:id', SA, ({ db, svc, user, params, body, query }) => {
    const c = findCompany(db, params.id);
    const confirmName = String(body.confirmName ?? query.confirmName ?? '').trim();
    if (confirmName !== c.nameAr.trim()) throw badRequest('confirmName does not match the company name', 'اسم المنشأة غير مطابق');
    logEvent(svc, c, 'DELETED', { from: c.status, to: null, actor: actor(user), data: { nameAr: c.nameAr, nameEn: c.nameEn, ownerEmail: companyOwner(db, c.id)?.email ?? null } });
    const rec = db as unknown as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      const rows = rec[key];
      if (key === 'companyEvents' || key === 'companies' || key === 'emails' || !Array.isArray(rows)) continue;
      rec[key] = rows.filter((r) => !(r && typeof r === 'object' && (r as { companyId?: string }).companyId === c.id));
    }
    db.companies = db.companies.filter((x) => x.id !== c.id);
    return ok;
  }),

  // ---------- leads ----------
  route('GET', '/admin/leads', SA, ({ db, query: q }) => {
    const s = (q.search ?? '').trim().toLowerCase();
    const rows = db.leads.filter((l) => (!q.status || l.status === q.status) &&
      (!s || [l.name, l.company, l.email, l.phone, l.message].some((x) => (x ?? '').toLowerCase().includes(s)))).sort(byCreatedDesc);
    return paginate(rows, q);
  }),
  route('PATCH', '/admin/leads/:id', SA, ({ db, params, body }) => {
    const l = db.leads.find((x) => x.id === params.id);
    if (!l) throw notFound('Lead', 'الطلب غير موجود');
    const status = v.oneOf(body, 'status', LEAD_STATUSES, true);
    if (status) l.status = status;
    if (body.notes !== undefined) l.notes = body.notes === null || body.notes === '' ? null : v.str(body, 'notes')!;
    l.updatedAt = nowIso();
    return l;
  }),

  // ---------- platform activity ----------
  route('GET', '/admin/events', SA, ({ db, query: q }) => {
    if (q.type && !EVENT_TYPES.includes(q.type as never)) throw badRequest(`type must be one of ${EVENT_TYPES.join(', ')}`);
    const rows = db.companyEvents.filter((e) => (!q.companyId || e.companyId === q.companyId) && (!q.type || e.type === q.type)).sort(byCreatedDesc).map((e) => eventView(db, e));
    return paginate(rows, q);
  }),

  // ---------- platform admins ----------
  route('GET', '/admin/admins', SA, ({ db }) => db.admins.slice().sort(byCreatedAsc).map(adminView)),
  route('POST', '/admin/admins', SA, ({ db, body }) => {
    const name = v.str(body, 'name', { min: 2 })!.trim(); const email = v.email(body, 'email')!; const password = v.str(body, 'password', { min: 8 })!;
    if (db.admins.some((a) => a.email === email) || db.users.some((u) => u.email === email)) throw conflict('Email already in use', 'البريد الإلكتروني مستخدم مسبقاً');
    const now = nowIso();
    const a: PlatformAdmin = { id: nextId(db, 'adm'), email, password, name, isActive: true, lastLoginAt: null, createdAt: now, updatedAt: now };
    db.admins.push(a);
    return adminView(a);
  }),
  route('PATCH', '/admin/admins/:id', SA, ({ db, user, params, body }) => {
    const a = db.admins.find((x) => x.id === params.id);
    if (!a) throw notFound('Admin', 'المستخدم غير موجود');
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') throw badRequest('isActive must be a boolean value');
    if (body.isActive === false && a.id === user.id) throw badRequest('You cannot deactivate yourself', 'لا يمكنك تعطيل حسابك');
    if (body.name !== undefined) a.name = v.str(body, 'name', { min: 2 })!.trim();
    if (typeof body.isActive === 'boolean') a.isActive = body.isActive;
    a.updatedAt = nowIso();
    return adminView(a);
  }),

  // ---------- settings ----------
  route('GET', '/admin/settings', SA, ({ db }) => db.settings),
  route('PATCH', '/admin/settings', SA, ({ db, body }) => {
    const s = db.settings;
    if (body.requireApproval !== undefined) {
      if (typeof body.requireApproval !== 'boolean') throw badRequest('requireApproval must be a boolean value');
      s.requireApproval = body.requireApproval;
    }
    const trialDays = int(body, 'trialDays', 1, 365, true); if (trialDays !== undefined) s.trialDays = trialDays;
    const discount = v.num(body, 'annualDiscount', { min: 0, max: 0.9, optional: true }); if (discount !== undefined) s.annualDiscount = discount;
    if (body.prices !== undefined) {
      if (!body.prices || typeof body.prices !== 'object') throw badRequest('prices must be an object');
      const p = body.prices as Record<string, unknown>;
      for (const plan of PLANS) { const n = nullableNum(p, plan, 0); if (n !== undefined) s.prices[plan] = n; }
    }
    if (body.billing !== undefined) {
      if (!body.billing || typeof body.billing !== 'object' || Array.isArray(body.billing)) throw badRequest('billing must be an object');
      const b = pickKnown(body.billing as Record<string, unknown>, Object.keys(s.billing));
      const err = billingSettingsError(b); if (err) throw badRequest(err, 'قيمة غير صالحة في بيانات الفوترة');
      s.billing = { ...s.billing, ...b };
    }
    if (body.reminders !== undefined) {
      if (!body.reminders || typeof body.reminders !== 'object' || Array.isArray(body.reminders)) throw badRequest('reminders must be an object');
      const r = pickKnown(body.reminders as Record<string, unknown>, Object.keys(s.reminders));
      const err = remindersSettingsError(r); if (err) throw badRequest(err, 'قيمة غير صالحة في إعدادات التذكيرات');
      for (const k of ['trialDays', 'subscriptionDays', 'overdueInvoiceDays'] as const) if (r[k]) r[k] = normalizeDays(r[k] as number[]);
      s.reminders = { ...s.reminders, ...(r as Partial<ReminderSettings>) };
    }
    return s;
  }),

  // ---------- broadcast ----------
  route('POST', '/admin/broadcast', SA, ({ db, svc, body }) => {
    const title = v.str(body, 'title', { min: 1 })!.trim(); const text = v.str(body, 'body', { min: 1 })!.trim();
    const target = v.oneOf(body, 'target', ['ALL', 'ACTIVE', 'TRIAL'] as const)!;
    if (!title || !text) throw badRequest('title and body should not be empty', 'العنوان والنص مطلوبان');
    let sent = 0;
    for (const c of db.companies) {
      if (target !== 'ALL' && c.status !== target) continue;
      const ids = companyUsers(svc, c.id, ['OWNER', 'HR_ADMIN']);
      svc.notifyUsers(c.id, ids, title, text, null);
      sent += ids.length;
    }
    return { sent };
  }),
];
