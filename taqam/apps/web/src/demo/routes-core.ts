/** Demo API — auth, public, dashboard, settings, organization, employees, attendance (ports of apps/api controllers). */
import {
  SAUDI_LEAVE_POLICIES, bankCodeFromIban, calculateEndOfService, calculateGosi, expiryStatus, nitaqatBand, saudizationRate, validateSaudiIban,
  type TerminationReason,
} from '@taqam/core';
import { newEmployeeId, NEW_EMPLOYEE_POOL } from './ids';
import { addDays, dayStr, eachDay, parseTime, r2, todayStr, weekday } from './dates';
import { nextId, type Company, type DB, type Employee, type PlatformAdmin, type Role, type User } from './db';
import { assertCompanyAccess, assertSeat, endOfDay, lifecycleDefaults, logEvent, nextCompanyId, tenantCompanyView } from './lifecycle';
import { badRequest, conflict, forbidden, notFound, unauthorized } from './errors';
import { route, v, pick, paginate, byCreatedAsc, byCreatedDesc, employeeView, ok, DATE_RE, EMAIL_RE, type Ctx, type Route } from './router';
import { ADMIN, ALL_ROLES, STAFF, Services, byNumber, fullName, nowIso, type AuthUser } from './services';

export const TERMINATION_REASONS: TerminationReason[] = ['EMPLOYER_TERMINATION', 'CONTRACT_END', 'RESIGNATION', 'ARTICLE_80', 'ARTICLE_81', 'FORCE_MAJEURE', 'FEMALE_MARRIAGE_CHILDBIRTH', 'RETIREMENT', 'DEATH'];
const ROLES: Role[] = ['OWNER', 'HR_ADMIN', 'PAYROLL', 'BRANCH_MANAGER', 'EMPLOYEE'];
const AVATAR_COLORS = ['#172C46', '#213A5A', '#0E776D', '#19C7B4', '#2F6F9F', '#1B7F53', '#C2412D', '#7A5C99'];
const MANAGERS: Role[] = ['OWNER', 'HR_ADMIN', 'BRANCH_MANAGER'];

// ---------- auth helpers ----------
/** Legacy demo token ("demo.<userId>") — still accepted so sessions saved before the admin portal keep working. */
export const TOKEN_PREFIX = 'demo.';
const AUTH_ROLES: Role[] = [...ALL_ROLES, 'SUPER_ADMIN'];
interface TokenPayload { sub: string; role: Role; companyId: string | null; employeeId: string | null; branchId: string | null; impersonatedBy?: string; iat: number; exp?: number }
const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
const TOKEN_HEADER = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
/** JWT-shaped (unsigned) demo token so the web app can decode the payload exactly like a real one. */
function signToken(p: Omit<TokenPayload, 'iat'>): string {
  return `${TOKEN_HEADER}.${b64url(JSON.stringify({ ...p, iat: Math.floor(Date.now() / 1000) }))}.demo`;
}
function readToken(token: string): TokenPayload | null {
  if (token.startsWith(TOKEN_PREFIX)) return { sub: token.slice(TOKEN_PREFIX.length), role: 'EMPLOYEE', companyId: null, employeeId: null, branchId: null, iat: 0 };
  const parts = token.split('.');
  if (parts.length !== 3 || parts[2] !== 'demo') return null;
  try { return JSON.parse(unb64url(parts[1])) as TokenPayload; } catch { return null; }
}
export function userView(svc: Services, u: User) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, companyId: u.companyId, employeeId: u.employeeId, branchId: svc.emp(u.employeeId)?.branchId ?? null };
}
function companyLite(svc: Services, id: string) {
  const c = svc.company(id);
  return { id: c.id, nameAr: c.nameAr, nameEn: c.nameEn, status: c.status };
}
/** AuthResponse for a company user (`impersonatedBy` → 1h support token issued by a platform admin). */
export function authResponse(svc: Services, u: User, impersonatedBy?: string) {
  const user = userView(svc, u);
  const accessToken = signToken({
    sub: u.id, role: u.role, companyId: u.companyId, employeeId: u.employeeId, branchId: user.branchId,
    ...(impersonatedBy ? { impersonatedBy, exp: Math.floor(Date.now() / 1000) + 3600 } : {}),
  });
  return { accessToken, user, company: companyLite(svc, u.companyId) };
}
function adminUserView(a: PlatformAdmin) {
  return { id: a.id, email: a.email, name: a.name, role: 'SUPER_ADMIN' as const, companyId: null, employeeId: null, branchId: null };
}
function adminAuthResponse(a: PlatformAdmin) {
  return { accessToken: signToken({ sub: a.id, role: 'SUPER_ADMIN', companyId: null, employeeId: null, branchId: null }), user: adminUserView(a), company: null };
}
/** JwtAuthGuard equivalent: resolves the bearer token to the request user (company user or platform admin). */
export function resolveUser(db: DB, svc: Services, token: string | null): AuthUser {
  if (!token) throw unauthorized('Missing bearer token', 'يجب تسجيل الدخول');
  const p = readToken(token);
  const expired = !p || (p.exp !== undefined && p.exp * 1000 < Date.now());
  const admin = !expired ? db.admins.find((x) => x.id === p!.sub) : undefined;
  if (admin) {
    if (!admin.isActive) throw unauthorized('User inactive', 'الحساب غير مفعّل');
    return { id: admin.id, email: admin.email, name: admin.name, role: 'SUPER_ADMIN', companyId: '', employeeId: null, branchId: null };
  }
  const u = !expired ? db.users.find((x) => x.id === p!.sub) : undefined;
  if (!u) throw unauthorized('Invalid or expired token', 'انتهت الجلسة، سجّل الدخول مجدداً');
  if (!u.isActive) throw unauthorized('User inactive', 'الحساب غير مفعّل');
  if (p!.impersonatedBy && !db.admins.some((a) => a.id === p!.impersonatedBy && a.isActive)) throw unauthorized('Invalid or expired token', 'انتهت الجلسة، سجّل الدخول مجدداً');
  return { ...userView(svc, u), impersonatedBy: p!.impersonatedBy ?? null };
}

// ---------- employees helpers ----------
const EMP_DATE_FIELDS = ['birthDate', 'idExpiry', 'passportExpiry', 'hireDate', 'contractEndDate', 'probationEndDate', 'terminationDate'] as const;
const EMP_FIELDS = [
  'employeeNumber', 'firstNameAr', 'lastNameAr', 'fullNameEn', 'nationality', 'gender', 'birthDate', 'maritalStatus', 'nationalId', 'idExpiry', 'passportNumber',
  'passportExpiry', 'phone', 'email', 'branchId', 'departmentId', 'managerId', 'jobTitle', 'hireDate', 'contractType', 'contractEndDate', 'probationEndDate', 'status',
  'basicSalary', 'housingAllowance', 'transportAllowance', 'otherAllowances', 'iban', 'bankCode', 'gosiRegistered', 'hoursPerDay', 'avatarColor', 'annualLeaveCarryOver',
] as const;
const EMPTY_TO_UNDEF = new Set(['birthDate', 'idExpiry', 'passportExpiry', 'email', 'branchId', 'departmentId', 'managerId', 'contractEndDate', 'probationEndDate', 'iban', 'terminationDate']);

function employeeDto(body: Record<string, unknown>, partial: boolean) {
  const dto = pick(body, partial ? [...EMP_FIELDS, 'terminationDate', 'terminationReason'] : EMP_FIELDS);
  for (const k of Object.keys(dto)) if (EMPTY_TO_UNDEF.has(k) && dto[k] === '') delete dto[k];
  if (typeof dto.nationality === 'string') dto.nationality = dto.nationality.trim().toUpperCase();
  const need = (k: string) => !partial || dto[k] !== undefined;
  if (need('firstNameAr')) v.str(dto, 'firstNameAr', { min: 1 });
  if (need('lastNameAr')) v.str(dto, 'lastNameAr', { min: 1 });
  if (need('nationality') && !(typeof dto.nationality === 'string' && dto.nationality.length === 2)) throw badRequest('nationality must be longer than or equal to 2 characters');
  if (need('gender')) v.oneOf(dto, 'gender', ['MALE', 'FEMALE'] as const);
  if (need('nationalId')) v.str(dto, 'nationalId', { min: 5 });
  if (need('hireDate')) v.match(dto, 'hireDate', DATE_RE);
  if (need('basicSalary')) dto.basicSalary = v.num(dto, 'basicSalary', { min: 0 });
  for (const k of ['housingAllowance', 'transportAllowance', 'otherAllowances', 'annualLeaveCarryOver'] as const) if (dto[k] !== undefined) dto[k] = v.num(dto, k, { min: 0 });
  if (dto.hoursPerDay !== undefined) dto.hoursPerDay = v.num(dto, 'hoursPerDay', { min: 1, max: 12 });
  if (dto.contractType !== undefined) v.oneOf(dto, 'contractType', ['UNLIMITED', 'FIXED'] as const);
  if (dto.status !== undefined) v.oneOf(dto, 'status', ['ACTIVE', 'ON_LEAVE', 'TERMINATED'] as const);
  for (const f of EMP_DATE_FIELDS) if (dto[f] !== undefined && dto[f] !== null) v.match(dto, f, DATE_RE);
  if (dto.email !== undefined && dto.email !== null) v.email(dto, 'email');
  return dto;
}
function employeeData(dto: Record<string, unknown>) {
  const data: Record<string, unknown> = { ...dto };
  for (const f of EMP_DATE_FIELDS) if (dto[f] !== undefined) data[f] = dto[f] ? String(dto[f]).slice(0, 10) : null;
  if (dto.nationality) data.isSaudi = dto.nationality === 'SA';
  if (dto.iban) {
    const iban = String(dto.iban).replace(/\s+/g, '').toUpperCase();
    if (!validateSaudiIban(iban)) throw badRequest('Invalid Saudi IBAN', 'رقم الآيبان غير صالح');
    data.iban = iban;
    data.bankCode = dto.bankCode || bankCodeFromIban(iban);
  }
  for (const k of ['branchId', 'departmentId', 'managerId']) if (data[k] === '') data[k] = null;
  return data as Partial<Employee>;
}
function validateEmployeeRefs(svc: Services, u: AuthUser, dto: Record<string, unknown>, selfId?: string) {
  if (dto.branchId && !svc.db.branches.some((b) => b.id === dto.branchId && b.companyId === u.companyId)) throw badRequest('Invalid branchId', 'الفرع غير موجود');
  if (dto.departmentId && !svc.db.departments.some((d) => d.id === dto.departmentId && d.companyId === u.companyId)) throw badRequest('Invalid departmentId', 'القسم غير موجود');
  if (dto.managerId) {
    if (dto.managerId === selfId) throw badRequest('Employee cannot manage themselves', 'لا يمكن أن يكون الموظف مديراً لنفسه');
    if (!svc.db.employees.some((e) => e.id === dto.managerId && e.companyId === u.companyId)) throw badRequest('Invalid managerId', 'المدير غير موجود');
  }
}
export function employeeDetail(svc: Services, u: AuthUser, id: string) {
  const e = svc.scopedEmployee(u, id);
  const today = todayStr();
  const docs = svc.db.documents.filter((d) => d.employeeId === id).sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999'));
  const user = svc.db.users.find((x) => x.employeeId === id);
  return {
    ...employeeView(svc, e),
    documents: docs.map((d) => ({ ...d, status: expiryStatus(d.expiryDate, today) })),
    leaveBalance: svc.annualBalance(e),
    user: user ? { id: user.id, email: user.email, role: user.role } : null,
  };
}
function eosb(svc: Services, u: AuthUser, id: string, endDate?: string, reason?: string) {
  const e = svc.scopedEmployee(u, id);
  const end = endDate || e.terminationDate || todayStr();
  const bal = svc.annualBalance(e, end);
  return calculateEndOfService({
    startDate: e.hireDate, endDate: end, reason: (reason || 'EMPLOYER_TERMINATION') as TerminationReason,
    wage: { basic: e.basicSalary, housing: e.housingAllowance, transport: e.transportAllowance, other: e.otherAllowances },
    unusedLeaveDays: Math.max(0, bal.balance),
  });
}

// ---------- attendance helpers ----------
export function upsertRecord(svc: Services, companyId: string, emp: Employee, date: string, checkInRaw: string | null | undefined, checkOutRaw: string | null | undefined, opts: { note?: string | null; source: string; status?: 'ABSENT' }) {
  const d = date.slice(0, 10);
  const shift = svc.shiftFor(emp, d);
  const checkIn = opts.status === 'ABSENT' ? null : parseTime(d, checkInRaw);
  let checkOut = opts.status === 'ABSENT' ? null : parseTime(d, checkOutRaw);
  if (checkIn && checkOut && checkOut <= checkIn && checkOutRaw && /^\d{1,2}:\d{2}$/.test(checkOutRaw)) checkOut = new Date(checkOut.getTime() + 86400000);
  if (!checkIn && opts.status !== 'ABSENT') throw badRequest('checkIn is required', 'وقت الحضور مطلوب');
  const m = svc.compute(shift, checkIn, checkOut);
  const data = {
    shiftId: shift?.id ?? null, checkIn: checkIn?.toISOString() ?? null, checkOut: checkOut?.toISOString() ?? null, workedMinutes: m.workedMinutes,
    lateMinutes: m.lateMinutes, earlyLeaveMinutes: m.earlyLeaveMinutes, overtimeMinutes: m.overtimeMinutes, status: opts.status ?? m.status,
    source: opts.source, note: opts.note ?? null, updatedAt: nowIso(),
  };
  let rec = svc.db.attendance.find((r) => r.employeeId === emp.id && r.date === d);
  if (rec) Object.assign(rec, data);
  else {
    rec = { id: nextId(svc.db, 'att'), companyId, employeeId: emp.id, date: d, checkInLat: null, checkInLng: null, checkOutLat: null, checkOutLng: null, createdAt: nowIso(), ...data };
    svc.db.attendance.push(rec);
  }
  return rec;
}
export function attendanceSummary(svc: Services, u: AuthUser, q: { from?: string; to?: string; branchId?: string; employeeId?: string }) {
  const to = q.to || todayStr();
  const from = q.from || addDays(to, -29);
  const b = svc.branchFilter(u, q.branchId);
  const where = svc.employeeWhere(u);
  const employees = svc.db.employees
    .filter((e) => where(e) && (!b || e.branchId === b) && (!q.employeeId || e.id === q.employeeId) && (e.status !== 'TERMINATED' || (!!e.terminationDate && e.terminationDate >= from)))
    .sort(byNumber);
  const ids = new Set(employees.map((e) => e.id));
  const records = svc.db.attendance.filter((r) => r.companyId === u.companyId && ids.has(r.employeeId) && r.date >= from && r.date <= to);
  return employees.map((e) => {
    const rs = records.filter((r) => r.employeeId === e.id);
    return {
      employeeId: e.id, employeeName: fullName(e), branchId: e.branchId, branchName: svc.branch(e.branchId)?.nameAr ?? null,
      presentDays: rs.filter((r) => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'INCOMPLETE').length,
      lateDays: rs.filter((r) => r.status === 'LATE').length,
      absentDays: rs.filter((r) => r.status === 'ABSENT').length,
      lateMinutes: rs.reduce((s, r) => s + r.lateMinutes, 0),
      overtimeMinutes: rs.reduce((s, r) => s + r.overtimeMinutes, 0),
      workedHours: Math.round((rs.reduce((s, r) => s + r.workedMinutes, 0) / 60) * 100) / 100,
    };
  });
}

function userSelect(svc: Services, u: User) {
  const e = svc.emp(u.employeeId);
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, isActive: u.isActive, employeeId: u.employeeId, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
    employee: e ? { id: e.id, firstNameAr: e.firstNameAr, lastNameAr: e.lastNameAr, branchId: e.branchId } : null,
  };
}
function branchesView(svc: Services, u: AuthUser) {
  const active = svc.db.employees.filter((e) => e.companyId === u.companyId && e.status !== 'TERMINATED');
  return svc.db.branches.filter((b) => b.companyId === u.companyId).sort(byCreatedAsc).map((b) => {
    const list = active.filter((e) => e.branchId === b.id);
    const saudis = list.filter((e) => e.isSaudi).length;
    const rate = saudizationRate(saudis, list.length);
    const m = svc.emp(b.managerEmployeeId);
    return { ...b, employeesCount: list.length, saudis, saudizationRate: rate, nitaqatBand: nitaqatBand(rate), managerName: m ? fullName(m) : null, manager: m ? { id: m.id, name: fullName(m) } : null };
  });
}
function companyDto(b: Record<string, unknown>) {
  const dto = pick(b, ['nameAr', 'nameEn', 'crNumber', 'establishmentId', 'gosiNumber', 'vatNumber', 'sector', 'city', 'iban', 'bankCode', 'weekendDays', 'payrollDay']);
  if (dto.payrollDay !== undefined) dto.payrollDay = v.num(dto, 'payrollDay', { min: 1, max: 28 });
  if (dto.weekendDays !== undefined && !(Array.isArray(dto.weekendDays) && dto.weekendDays.length <= 7 && dto.weekendDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) throw badRequest('weekendDays must be an array');
  return dto;
}
function shiftDto(b: Record<string, unknown>, partial: boolean) {
  const dto = pick(b, ['branchId', 'name', 'startTime', 'endTime', 'breakMinutes', 'graceMinutes', 'days', 'color']);
  const HHMM = /^([01]?\d|2[0-4]):[0-5]\d$/;
  if (!partial || dto.branchId !== undefined) v.str(dto, 'branchId');
  if (!partial || dto.name !== undefined) v.str(dto, 'name');
  if (!partial || dto.startTime !== undefined) v.match(dto, 'startTime', HHMM);
  if (!partial || dto.endTime !== undefined) v.match(dto, 'endTime', HHMM);
  if (dto.breakMinutes !== undefined) dto.breakMinutes = v.num(dto, 'breakMinutes', { min: 0, max: 240 });
  if (dto.graceMinutes !== undefined) dto.graceMinutes = v.num(dto, 'graceMinutes', { min: 0, max: 120 });
  if ((!partial || dto.days !== undefined) && !(Array.isArray(dto.days) && dto.days.length <= 7 && dto.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) throw badRequest('days must be an array');
  return dto;
}

export const coreRoutes: Route[] = [
  // ---------- public ----------
  route('GET', '/health', 'PUBLIC', () => ({ status: 'ok' })),
  route('POST', '/public/leads', 'PUBLIC', ({ db, body }) => {
    v.str(body, 'name', { min: 2 }); v.str(body, 'company'); const email = v.email(body, 'email')!; v.str(body, 'phone');
    const lead = { id: nextId(db, 'lead'), name: String(body.name), company: String(body.company), email, phone: String(body.phone), employeesCount: body.employeesCount ? Number(body.employeesCount) : null, sector: (body.sector as string) ?? null, message: (body.message as string) ?? null, status: 'NEW' as const, notes: null, createdAt: nowIso(), updatedAt: nowIso() };
    db.leads.push(lead);
    return { id: lead.id };
  }),
  route('POST', '/public/eosb', 'PUBLIC', ({ body }) => {
    v.match(body, 'startDate', DATE_RE); v.match(body, 'endDate', DATE_RE); v.oneOf(body, 'reason', TERMINATION_REASONS);
    const w = (body.wage ?? {}) as Record<string, unknown>;
    return calculateEndOfService({
      startDate: String(body.startDate), endDate: String(body.endDate), reason: body.reason as TerminationReason,
      wage: { basic: Number(w.basic) || 0, housing: Number(w.housing) || 0, transport: Number(w.transport) || 0, other: Number(w.other) || 0 },
      unusedLeaveDays: body.unusedLeaveDays !== undefined ? Number(body.unusedLeaveDays) : undefined,
    });
  }),

  // ---------- auth ----------
  route('POST', '/auth/login', 'PUBLIC', ({ db, svc, body }) => {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw badRequest('email must be an email');
    const password = String(body.password ?? '');
    const admin = db.admins.find((x) => x.email === email);
    if (admin) {
      if (!admin.isActive || admin.password !== password) throw unauthorized('Invalid email or password', 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
      admin.lastLoginAt = nowIso();
      return adminAuthResponse(admin);
    }
    const u = db.users.find((x) => x.email === email);
    if (!u || !u.isActive || u.password !== password) throw unauthorized('Invalid email or password', 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
    assertCompanyAccess(svc, u.companyId);
    u.lastLoginAt = nowIso();
    return authResponse(svc, u);
  }),
  route('POST', '/auth/register', 'PUBLIC', ({ db, svc, body }) => {
    v.str(body, 'companyNameAr', { min: 2 }); v.str(body, 'sector'); v.str(body, 'ownerName', { min: 2 }); const email = v.email(body, 'email')!; v.str(body, 'password', { min: 8 });
    if (db.users.some((x) => x.email === email) || db.admins.some((x) => x.email === email)) throw conflict('Email already registered', 'البريد الإلكتروني مسجل مسبقاً');
    const now = nowIso();
    const companyId = nextCompanyId(db);
    const settings = db.settings;
    const company: Company = {
      id: companyId, nameAr: String(body.companyNameAr), nameEn: (body.companyNameEn as string) || null, crNumber: null, establishmentId: null, gosiNumber: null, vatNumber: null,
      sector: String(body.sector), city: null, iban: null, bankCode: null, weekendDays: [5, 6], payrollDay: 27, employeesCount: body.employeesCount ? Number(body.employeesCount) : null, createdAt: now, updatedAt: now,
      ...lifecycleDefaults(),
      ...(settings.requireApproval ? {} : { status: 'TRIAL' as const, trialEndsAt: endOfDay(addDays(todayStr(), settings.trialDays)) }),
    };
    db.companies.push(company);
    for (const p of SAUDI_LEAVE_POLICIES) db.leaveTypes.push({ id: nextId(db, 'lt'), companyId, code: p.code, nameAr: p.nameAr, nameEn: p.nameEn, paid: p.paid, maxDaysPerYear: p.maxDaysPerYear, createdAt: now });
    const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null;
    const user: User = { id: nextId(db, 'usr'), companyId, email, password: String(body.password), name: String(body.ownerName), role: 'OWNER', employeeId: null, isActive: true, lastLoginAt: now, createdAt: now, updatedAt: now, phone };
    db.users.push(user);
    logEvent(svc, company, 'REGISTERED', { to: company.status, data: { ownerName: user.name, ownerEmail: email, sector: company.sector, employeesCount: company.employeesCount }, createdAt: now });
    svc.audit({ id: user.id, name: user.name, companyId }, 'REGISTER', 'Company', companyId);
    return authResponse(svc, user);
  }),
  route('GET', '/auth/me', AUTH_ROLES, ({ db, svc, user }) => {
    if (user.role === 'SUPER_ADMIN') return { ...adminUserView(db.admins.find((x) => x.id === user.id)!), company: null };
    return { ...userView(svc, db.users.find((x) => x.id === user.id)!), company: companyLite(svc, user.companyId) };
  }),
  route('POST', '/auth/change-password', AUTH_ROLES, ({ db, svc, user, body }) => {
    v.str(body, 'currentPassword'); v.str(body, 'newPassword', { min: 8 });
    const u = user.role === 'SUPER_ADMIN' ? db.admins.find((x) => x.id === user.id)! : db.users.find((x) => x.id === user.id)!;
    if (u.password !== body.currentPassword) throw badRequest('Current password is incorrect', 'كلمة المرور الحالية غير صحيحة');
    u.password = String(body.newPassword);
    u.updatedAt = nowIso();
    if (user.role !== 'SUPER_ADMIN') svc.audit(user, 'CHANGE_PASSWORD', 'User', u.id);
    return ok;
  }),

  // ---------- dashboard ----------
  route('GET', '/dashboard', STAFF, ({ db, svc, user: u }) => {
    const today = todayStr();
    const where = svc.employeeWhere(u);
    const employees = db.employees.filter((e) => where(e) && e.status !== 'TERMINATED');
    const headcount = employees.length;
    const saudis = employees.filter((e) => e.isSaudi).length;
    const rate = saudizationRate(saudis, headcount);
    const board = svc.board(where, today);
    const presentToday = board.filter((r) => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'INCOMPLETE').length;
    const lateToday = board.filter((r) => r.status === 'LATE').length;
    const absentToday = board.filter((r) => r.status === 'ABSENT').length;
    const onLeaveToday = board.filter((r) => r.status === 'ON_LEAVE').length;
    const visible = (employeeId: string) => { const e = svc.emp(employeeId); return !!e && where(e); };
    const pendingLeaves = db.leaves.filter((l) => l.companyId === u.companyId && l.status === 'PENDING' && visible(l.employeeId)).length;
    const pendingRequests = db.requests.filter((r) => r.companyId === u.companyId && r.status === 'PENDING' && visible(r.employeeId)).length;
    const runs = db.runs.filter((r) => r.companyId === u.companyId && r.status !== 'DRAFT').sort((a, b) => b.period.localeCompare(a.period)).slice(0, 6);
    const lastApproved = runs.find((r) => r.status === 'APPROVED' || r.status === 'PAID');
    let monthlyPayrollCost: number;
    let monthlyPayrollCostSource: 'LAST_RUN' | 'ESTIMATE';
    if (lastApproved && u.role !== 'BRANCH_MANAGER') { monthlyPayrollCost = lastApproved.totalEmployerCost; monthlyPayrollCostSource = 'LAST_RUN'; }
    else {
      monthlyPayrollCost = r2(employees.reduce((s, e) => {
        const wage = e.basicSalary + e.housingAllowance + e.transportAllowance + e.otherAllowances;
        const gosi = e.gosiRegistered ? calculateGosi({ basic: e.basicSalary, housing: e.housingAllowance, isSaudi: e.isSaudi }).employer : 0;
        return s + wage + gosi;
      }, 0));
      monthlyPayrollCostSource = 'ESTIMATE';
    }
    const payrollTrend = u.role === 'BRANCH_MANAGER' ? [] : runs.slice().reverse().map((r) => ({ period: r.period, gross: r.totalGross, net: r.totalNet, employerCost: r.totalEmployerCost }));
    const limit = addDays(today, 90);
    const empIds = new Set(employees.map((e) => e.id));
    const expiringDocuments = db.documents
      .filter((d) => d.companyId === u.companyId && d.expiryDate && d.expiryDate <= limit && empIds.has(d.employeeId))
      .sort((a, b) => a.expiryDate!.localeCompare(b.expiryDate!)).slice(0, 20)
      .map((d) => ({ id: d.id, employeeId: d.employeeId, employeeName: fullName(svc.emp(d.employeeId)!), type: d.type, expiryDate: d.expiryDate, status: expiryStatus(d.expiryDate, today) }));
    const headcountByBranch = db.branches.filter((b) => b.companyId === u.companyId && (u.role !== 'BRANCH_MANAGER' || b.id === u.branchId)).sort(byCreatedAsc).map((b) => {
      const list = employees.filter((e) => e.branchId === b.id);
      const s = list.filter((e) => e.isSaudi).length;
      return { branchId: b.id, branchName: b.nameAr, count: list.length, saudis: s, saudizationRate: saudizationRate(s, list.length) };
    });
    const headcountByDepartment = db.departments.filter((d) => d.companyId === u.companyId).sort(byCreatedAsc)
      .map((d) => ({ departmentId: d.id, name: d.name, count: employees.filter((e) => e.departmentId === d.id).length }))
      .filter((d) => d.count > 0 || u.role !== 'BRANCH_MANAGER');
    const from = addDays(today, -13);
    const recs = db.attendance.filter((r) => r.companyId === u.companyId && r.date >= from && visible(r.employeeId));
    const attendanceTrend = eachDay(from, today).map((ds) => {
      if (ds === today) return { date: ds, present: presentToday, late: lateToday, absent: absentToday };
      const rs = recs.filter((r) => r.date === ds);
      return { date: ds, present: rs.filter((r) => ['PRESENT', 'LATE', 'INCOMPLETE'].includes(r.status)).length, late: rs.filter((r) => r.status === 'LATE').length, absent: rs.filter((r) => r.status === 'ABSENT').length };
    });
    const recentActivity = db.audit.filter((l) => l.companyId === u.companyId && (u.role !== 'BRANCH_MANAGER' || l.userId === u.id)).sort(byCreatedDesc).slice(0, 10)
      .map((l) => ({ id: l.id, action: l.action, entity: l.entity, entityId: l.entityId, createdAt: l.createdAt, userName: l.userName }));
    return {
      headcount, saudis, nonSaudis: headcount - saudis, saudizationRate: rate, nitaqatBand: nitaqatBand(rate), presentToday, lateToday, absentToday, onLeaveToday,
      pendingLeaves, pendingRequests, monthlyPayrollCost, monthlyPayrollCostSource, expiringDocuments, headcountByBranch, headcountByDepartment, payrollTrend, attendanceTrend, recentActivity,
    };
  }),

  // ---------- company & settings ----------
  route('GET', '/company', STAFF, ({ svc, user }) => tenantCompanyView(svc.company(user.companyId))),
  route('PATCH', '/company', ADMIN, ({ svc, user, body }) => {
    const dto = companyDto(body);
    if (dto.iban) {
      dto.iban = String(dto.iban).replace(/\s+/g, '').toUpperCase();
      if (!validateSaudiIban(dto.iban as string)) throw badRequest('Invalid Saudi IBAN', 'رقم الآيبان غير صالح');
      dto.bankCode = dto.bankCode || bankCodeFromIban(dto.iban as string);
    }
    const c = Object.assign(svc.company(user.companyId), dto, { updatedAt: nowIso() });
    svc.audit(user, 'UPDATE', 'Company', c.id, dto);
    return tenantCompanyView(c);
  }),
  route('GET', '/users', ADMIN, ({ db, svc, user }) => db.users.filter((x) => x.companyId === user.companyId).sort(byCreatedAsc).map((x) => userSelect(svc, x))),
  route('POST', '/users', ADMIN, ({ db, svc, user: u, body }) => {
    const email = v.email(body, 'email')!; v.str(body, 'name', { min: 2 }); const role = v.oneOf(body, 'role', ROLES)!; v.str(body, 'password', { min: 8 });
    if (role === 'OWNER' && u.role !== 'OWNER') throw forbidden('Only owners can create owners', 'فقط المالك يمكنه إنشاء مالك');
    if (db.users.some((x) => x.email === email)) throw conflict('Email already in use', 'البريد الإلكتروني مستخدم مسبقاً');
    const employeeId = (body.employeeId as string) || null;
    if (employeeId && !db.employees.some((e) => e.id === employeeId && e.companyId === u.companyId)) throw notFound('Employee', 'الموظف غير موجود');
    if (employeeId && db.users.some((x) => x.employeeId === employeeId)) throw conflict('Duplicate value', 'القيمة مستخدمة مسبقاً');
    const now = nowIso();
    const created: User = { id: nextId(db, 'usr'), companyId: u.companyId, email, name: String(body.name), role, employeeId, password: String(body.password), isActive: true, lastLoginAt: null, createdAt: now, updatedAt: now };
    db.users.push(created);
    svc.audit(u, 'CREATE', 'User', created.id, { email, role });
    return userSelect(svc, created);
  }),
  route('PATCH', '/users/:id', ADMIN, ({ db, svc, user: u, params, body }) => {
    const target = db.users.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!target) throw notFound('User', 'المستخدم غير موجود');
    const dto = pick(body, ['role', 'isActive', 'name', 'employeeId', 'password']);
    if (dto.role !== undefined) v.oneOf(dto, 'role', ROLES);
    if (dto.password !== undefined) v.str(dto, 'password', { min: 8 });
    if ((target.role === 'OWNER' || dto.role === 'OWNER') && u.role !== 'OWNER') throw forbidden('Only owners can modify owners', 'فقط المالك يمكنه تعديل حساب مالك');
    if (target.id === u.id && (dto.isActive === false || (dto.role && dto.role !== u.role))) throw badRequest('You cannot deactivate or demote yourself', 'لا يمكنك تعطيل حسابك أو تغيير دورك');
    if (dto.employeeId && !db.employees.some((e) => e.id === dto.employeeId && e.companyId === u.companyId)) throw notFound('Employee', 'الموظف غير موجود');
    const { password, ...rest } = dto;
    Object.assign(target, rest, password ? { password } : {}, { updatedAt: nowIso() });
    svc.audit(u, 'UPDATE', 'User', target.id, rest);
    return userSelect(svc, target);
  }),
  route('DELETE', '/users/:id', ADMIN, ({ db, svc, user: u, params }) => {
    const target = db.users.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!target) throw notFound('User', 'المستخدم غير موجود');
    if (target.id === u.id) throw badRequest('You cannot delete yourself', 'لا يمكنك حذف حسابك');
    if (target.role === 'OWNER' && u.role !== 'OWNER') throw forbidden();
    db.users = db.users.filter((x) => x.id !== target.id);
    db.notifications = db.notifications.filter((n) => n.userId !== target.id);
    svc.audit(u, 'DELETE', 'User', target.id, { email: target.email });
    return ok;
  }),
  route('GET', '/leave-types', ALL_ROLES, ({ db, user }) => db.leaveTypes.filter((t) => t.companyId === user.companyId).sort(byCreatedAsc)),
  route('POST', '/leave-types', ADMIN, ({ db, svc, user: u, body }) => {
    const code = v.match(body, 'code', /^[A-Z0-9_]+$/)!; v.str(body, 'nameAr'); v.str(body, 'nameEn');
    if (typeof body.paid !== 'boolean') throw badRequest('paid must be a boolean value');
    if (db.leaveTypes.some((t) => t.companyId === u.companyId && t.code === code)) throw conflict('Duplicate value', 'القيمة مستخدمة مسبقاً');
    const t = { id: nextId(db, 'lt'), companyId: u.companyId, code, nameAr: String(body.nameAr), nameEn: String(body.nameEn), paid: body.paid, maxDaysPerYear: body.maxDaysPerYear === undefined || body.maxDaysPerYear === null ? null : v.num(body, 'maxDaysPerYear', { min: 0 })!, createdAt: nowIso() };
    db.leaveTypes.push(t);
    svc.audit(u, 'CREATE', 'LeaveType', t.id, pick(body, ['code', 'nameAr', 'nameEn', 'paid', 'maxDaysPerYear']));
    return t;
  }),
  route('PATCH', '/leave-types/:id', ADMIN, ({ db, svc, user: u, params, body }) => {
    const t = db.leaveTypes.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!t) throw notFound('Leave type', 'نوع الإجازة غير موجود');
    const dto = pick(body, ['code', 'nameAr', 'nameEn', 'paid', 'maxDaysPerYear']);
    if (dto.code !== undefined) v.match(dto, 'code', /^[A-Z0-9_]+$/);
    if (dto.code && db.leaveTypes.some((x) => x.companyId === u.companyId && x.code === dto.code && x.id !== t.id)) throw conflict('Duplicate value', 'القيمة مستخدمة مسبقاً');
    Object.assign(t, dto);
    svc.audit(u, 'UPDATE', 'LeaveType', t.id, dto);
    return t;
  }),
  route('DELETE', '/leave-types/:id', ADMIN, ({ db, svc, user: u, params }) => {
    const t = db.leaveTypes.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!t) throw notFound('Leave type', 'نوع الإجازة غير موجود');
    if (db.leaves.some((l) => l.leaveTypeId === t.id)) throw conflict('Leave type is in use', 'لا يمكن حذف نوع إجازة مستخدم في طلبات');
    db.leaveTypes = db.leaveTypes.filter((x) => x.id !== t.id);
    svc.audit(u, 'DELETE', 'LeaveType', t.id, { code: t.code });
    return ok;
  }),
  route('GET', '/holidays', STAFF, ({ db, user, query }) => {
    const y = Number(query.year);
    return db.holidays.filter((h) => h.companyId === user.companyId && (!y || h.date.startsWith(`${y}-`))).sort((a, b) => a.date.localeCompare(b.date));
  }),
  route('POST', '/holidays', ADMIN, ({ db, svc, user: u, body }) => {
    const date = v.match(body, 'date', /^\d{4}-\d{2}-\d{2}$/)!; v.str(body, 'nameAr');
    if (db.holidays.some((h) => h.companyId === u.companyId && h.date === date)) throw conflict('Duplicate value', 'القيمة مستخدمة مسبقاً');
    const h = { id: nextId(db, 'hol'), companyId: u.companyId, date, nameAr: String(body.nameAr), nameEn: (body.nameEn as string) ?? null, createdAt: nowIso() };
    db.holidays.push(h);
    svc.audit(u, 'CREATE', 'PublicHoliday', h.id, pick(body, ['date', 'nameAr', 'nameEn']));
    return h;
  }),
  route('DELETE', '/holidays/:id', ADMIN, ({ db, svc, user: u, params }) => {
    const h = db.holidays.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!h) throw notFound('Holiday', 'العطلة غير موجودة');
    db.holidays = db.holidays.filter((x) => x.id !== h.id);
    svc.audit(u, 'DELETE', 'PublicHoliday', h.id);
    return ok;
  }),
  route('GET', '/audit-logs', ADMIN, ({ db, user: u, query: q }) => {
    const s = (q.search ?? '').toLowerCase();
    const rows = db.audit
      .filter((a) => a.companyId === u.companyId && (!q.entity || a.entity === q.entity) && (!q.action || a.action === q.action) && (!s || (a.userName ?? '').toLowerCase().includes(s) || a.entity.toLowerCase().includes(s)))
      .sort(byCreatedDesc).map((a) => ({ id: a.id, action: a.action, entity: a.entity, entityId: a.entityId, userName: a.userName, createdAt: a.createdAt, data: a.data }));
    return paginate(rows, q);
  }),

  // ---------- branches & departments ----------
  route('GET', '/branches', STAFF, ({ svc, user }) => branchesView(svc, user)),
  route('POST', '/branches', ADMIN, ({ db, svc, user: u, body }) => {
    v.str(body, 'nameAr', { min: 2 }); v.str(body, 'city'); v.num(body, 'lat', { min: -90, max: 90 }); v.num(body, 'lng', { min: -180, max: 180 });
    const dto = pick(body, ['nameAr', 'nameEn', 'city', 'address', 'lat', 'lng', 'radiusMeters', 'managerEmployeeId']);
    if (dto.radiusMeters !== undefined) dto.radiusMeters = v.num(dto, 'radiusMeters', { min: 10, max: 10000 });
    if (dto.managerEmployeeId && !db.employees.some((e) => e.id === dto.managerEmployeeId && e.companyId === u.companyId)) throw badRequest('Invalid managerEmployeeId', 'المدير المحدد غير موجود');
    const now = nowIso();
    const b = { id: nextId(db, 'br'), companyId: u.companyId, nameAr: String(dto.nameAr), nameEn: (dto.nameEn as string) ?? null, city: String(dto.city), address: (dto.address as string) ?? null, lat: Number(dto.lat), lng: Number(dto.lng), radiusMeters: (dto.radiusMeters as number) ?? 150, managerEmployeeId: (dto.managerEmployeeId as string) || null, createdAt: now, updatedAt: now };
    db.branches.push(b);
    svc.audit(u, 'CREATE', 'Branch', b.id, dto);
    return b;
  }),
  route('PATCH', '/branches/:id', ADMIN, ({ db, svc, user: u, params, body }) => {
    const b = db.branches.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!b) throw notFound('Branch', 'الفرع غير موجود');
    const dto = pick(body, ['nameAr', 'nameEn', 'city', 'address', 'lat', 'lng', 'radiusMeters', 'managerEmployeeId']);
    if (dto.lat !== undefined) dto.lat = v.num(dto, 'lat', { min: -90, max: 90 });
    if (dto.lng !== undefined) dto.lng = v.num(dto, 'lng', { min: -180, max: 180 });
    if (dto.radiusMeters !== undefined) dto.radiusMeters = v.num(dto, 'radiusMeters', { min: 10, max: 10000 });
    if (dto.managerEmployeeId && !db.employees.some((e) => e.id === dto.managerEmployeeId && e.companyId === u.companyId)) throw badRequest('Invalid managerEmployeeId', 'المدير المحدد غير موجود');
    Object.assign(b, dto, { updatedAt: nowIso() });
    svc.audit(u, 'UPDATE', 'Branch', b.id, dto);
    return b;
  }),
  route('DELETE', '/branches/:id', ADMIN, ({ db, svc, user: u, params }) => {
    const b = db.branches.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!b) throw notFound('Branch', 'الفرع غير موجود');
    if (db.employees.some((e) => e.branchId === b.id && e.status !== 'TERMINATED')) throw conflict('Branch has active employees', 'لا يمكن حذف فرع به موظفون نشطون');
    db.branches = db.branches.filter((x) => x.id !== b.id);
    db.employees.forEach((e) => { if (e.branchId === b.id) e.branchId = null; });
    const shiftIds = new Set(db.shifts.filter((s) => s.branchId === b.id).map((s) => s.id));
    db.shifts = db.shifts.filter((s) => s.branchId !== b.id);
    db.assignments = db.assignments.filter((a) => !shiftIds.has(a.shiftId));
    db.announcements = db.announcements.filter((a) => a.branchId !== b.id);
    db.jobs.forEach((j) => { if (j.branchId === b.id) j.branchId = null; });
    svc.audit(u, 'DELETE', 'Branch', b.id, { nameAr: b.nameAr });
    return ok;
  }),
  route('GET', '/departments', STAFF, ({ db, user }) => db.departments.filter((d) => d.companyId === user.companyId).sort(byCreatedAsc).map((d) => ({
    id: d.id, name: d.name, parentId: d.parentId, employeesCount: db.employees.filter((e) => e.departmentId === d.id && e.status !== 'TERMINATED').length, createdAt: d.createdAt,
  }))),
  route('POST', '/departments', ADMIN, ({ db, svc, user: u, body }) => {
    v.str(body, 'name', { min: 2 });
    const parentId = (body.parentId as string) || null;
    if (parentId && !db.departments.some((d) => d.id === parentId && d.companyId === u.companyId)) throw badRequest('Invalid parentId', 'القسم الأب غير موجود');
    const d = { id: nextId(db, 'dep'), companyId: u.companyId, name: String(body.name), parentId, createdAt: nowIso() };
    db.departments.push(d);
    svc.audit(u, 'CREATE', 'Department', d.id, pick(body, ['name', 'parentId']));
    return { ...d, employeesCount: 0 };
  }),
  route('PATCH', '/departments/:id', ADMIN, ({ db, svc, user: u, params, body }) => {
    const d = db.departments.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!d) throw notFound('Department', 'القسم غير موجود');
    const dto = pick(body, ['name', 'parentId']);
    if (dto.parentId) {
      if (dto.parentId === d.id) throw badRequest('Department cannot be its own parent', 'لا يمكن أن يكون القسم أباً لنفسه');
      if (!db.departments.some((x) => x.id === dto.parentId && x.companyId === u.companyId)) throw badRequest('Invalid parentId', 'القسم الأب غير موجود');
    }
    Object.assign(d, dto);
    svc.audit(u, 'UPDATE', 'Department', d.id, dto);
    return d;
  }),
  route('DELETE', '/departments/:id', ADMIN, ({ db, svc, user: u, params }) => {
    const d = db.departments.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!d) throw notFound('Department', 'القسم غير موجود');
    db.departments = db.departments.filter((x) => x.id !== d.id);
    db.departments.forEach((x) => { if (x.parentId === d.id) x.parentId = null; });
    db.employees.forEach((e) => { if (e.departmentId === d.id) e.departmentId = null; });
    db.jobs.forEach((j) => { if (j.departmentId === d.id) j.departmentId = null; });
    svc.audit(u, 'DELETE', 'Department', d.id, { name: d.name });
    return ok;
  }),

  // ---------- employees ----------
  route('GET', '/employees', STAFF, ({ db, svc, user: u, query: q }) => {
    const where = svc.employeeWhere(u);
    const s = q.search?.trim().toLowerCase() ?? '';
    const parts = s.split(/\s+/);
    const rows = db.employees.filter((e) => {
      if (!where(e)) return false;
      if (q.branchId && e.branchId !== q.branchId) return false;
      if (q.departmentId && e.departmentId !== q.departmentId) return false;
      if (q.status && ['ACTIVE', 'ON_LEAVE', 'TERMINATED'].includes(q.status) && e.status !== q.status) return false;
      if (q.nationality === 'SA' && !e.isSaudi) return false;
      if (q.nationality === 'NON_SA' && e.isSaudi) return false;
      if (q.nationality && q.nationality.length === 2 && q.nationality !== 'SA' && e.nationality !== q.nationality.toUpperCase()) return false;
      if (s) {
        const has = (x: string | null) => !!x && x.toLowerCase().includes(s);
        const hit = has(e.firstNameAr) || has(e.lastNameAr) || has(e.fullNameEn) || has(e.employeeNumber) || has(e.nationalId) || has(e.phone) || has(e.email) || has(e.jobTitle)
          || (parts.length > 1 && e.firstNameAr.includes(parts[0]) && e.lastNameAr.includes(parts.slice(1).join(' ')));
        if (!hit) return false;
      }
      return true;
    }).sort(byNumber);
    const page = paginate(rows, q);
    return { ...page, data: page.data.map((e) => employeeView(svc, e)) };
  }),
  route('GET', '/employees/:id', STAFF, ({ svc, user, params }) => employeeDetail(svc, user, params.id)),
  route('POST', '/employees', ADMIN, ({ db, svc, user: u, body }) => {
    assertSeat(svc, u.companyId);
    const dto = employeeDto(body, false);
    validateEmployeeRefs(svc, u, dto);
    const cu = body.createUser as { email?: string; password?: string } | undefined;
    if (cu) {
      if (!cu.email || !EMAIL_RE.test(cu.email.trim())) throw badRequest('createUser.email must be an email');
      if (!cu.password || cu.password.length < 8) throw badRequest('createUser.password must be longer than or equal to 8 characters');
      if (db.users.some((x) => x.email === cu.email!.trim().toLowerCase())) throw conflict('Login email already in use', 'البريد الإلكتروني للدخول مستخدم مسبقاً');
    }
    const mine = db.employees.filter((e) => e.companyId === u.companyId);
    const employeeNumber = (dto.employeeNumber as string) || `EMP-${String(mine.filter((e) => e.employeeNumber.startsWith('EMP-')).reduce((m, e) => Math.max(m, Number(e.employeeNumber.slice(4)) || 0), 0) + 1).padStart(4, '0')}`;
    if (mine.some((e) => e.employeeNumber === employeeNumber)) throw conflict('Employee number already exists', 'الرقم الوظيفي مستخدم مسبقاً');
    const data = employeeData(dto);
    const now = nowIso();
    db.newEmployeeUsed += 1;
    const id = db.newEmployeeUsed <= NEW_EMPLOYEE_POOL ? newEmployeeId(db.newEmployeeUsed) : nextId(db, 'emp-x');
    const e: Employee = {
      id, companyId: u.companyId, firstNameAr: '', lastNameAr: '', fullNameEn: null, nationality: 'SA', isSaudi: false, gender: 'MALE', birthDate: null,
      maritalStatus: null, nationalId: '', idExpiry: null, passportNumber: null, passportExpiry: null, phone: null, email: null, branchId: null, departmentId: null,
      managerId: null, jobTitle: null, hireDate: todayStr(), contractType: 'UNLIMITED', contractEndDate: null, probationEndDate: null, status: 'ACTIVE',
      terminationDate: null, terminationReason: null, basicSalary: 0, housingAllowance: 0, transportAllowance: 0, otherAllowances: 0, iban: null, bankCode: null,
      gosiRegistered: true, hoursPerDay: 8, avatarColor: AVATAR_COLORS[mine.length % AVATAR_COLORS.length], annualLeaveCarryOver: 0, createdAt: now, updatedAt: now,
      ...data, employeeNumber,
    } as Employee;
    if (!dto.avatarColor) e.avatarColor = AVATAR_COLORS[mine.length % AVATAR_COLORS.length];
    db.employees.push(e);
    if (cu) db.users.push({ id: nextId(db, 'usr'), companyId: u.companyId, email: cu.email!.trim().toLowerCase(), name: fullName(e), role: 'EMPLOYEE', employeeId: e.id, password: cu.password!, isActive: true, lastLoginAt: null, createdAt: now, updatedAt: now });
    svc.audit(u, 'CREATE', 'Employee', e.id, { employeeNumber, name: fullName(e) });
    return employeeView(svc, e);
  }),
  route('PATCH', '/employees/:id', ADMIN, ({ db, svc, user: u, params, body }) => {
    const e = svc.scopedEmployee(u, params.id);
    const dto = employeeDto(body, true);
    validateEmployeeRefs(svc, u, dto, e.id);
    if (dto.employeeNumber && db.employees.some((x) => x.companyId === u.companyId && x.employeeNumber === dto.employeeNumber && x.id !== e.id)) throw conflict('Employee number already exists', 'الرقم الوظيفي مستخدم مسبقاً');
    Object.assign(e, employeeData(dto), { updatedAt: nowIso() });
    svc.audit(u, 'UPDATE', 'Employee', e.id, dto);
    return employeeView(svc, e);
  }),
  route('POST', '/employees/:id/terminate', ADMIN, ({ db, svc, user: u, params, body }) => {
    const e = svc.scopedEmployee(u, params.id);
    const terminationDate = v.match(body, 'terminationDate', DATE_RE)!.slice(0, 10);
    const reason = v.oneOf(body, 'reason', TERMINATION_REASONS)!;
    if (e.status === 'TERMINATED') throw badRequest('Employee already terminated', 'تم إنهاء خدمة الموظف مسبقاً');
    if (terminationDate < e.hireDate) throw badRequest('Termination before hire date', 'تاريخ إنهاء الخدمة قبل تاريخ التعيين');
    const result = eosb(svc, u, e.id, terminationDate, reason);
    Object.assign(e, { status: 'TERMINATED', terminationDate, terminationReason: reason, updatedAt: nowIso() });
    db.users.forEach((x) => { if (x.employeeId === e.id) x.isActive = false; });
    svc.audit(u, 'TERMINATE', 'Employee', e.id, { terminationDate, reason, eosbTotal: result.total });
    return { employee: employeeView(svc, e), eosb: result };
  }),
  route('GET', '/employees/:id/eosb', ['OWNER', 'HR_ADMIN', 'PAYROLL'], ({ svc, user, params, query }) => eosb(svc, user, params.id, query.endDate, query.reason)),
  route('GET', '/employees/:id/documents', STAFF, ({ db, svc, user, params }) => {
    svc.scopedEmployee(user, params.id);
    const today = todayStr();
    return db.documents.filter((d) => d.employeeId === params.id && d.companyId === user.companyId).sort(byCreatedDesc).map((d) => ({ ...d, status: expiryStatus(d.expiryDate, today) }));
  }),
  route('POST', '/employees/:id/documents', ADMIN, ({ db, svc, user: u, params, body }) => {
    const e = svc.scopedEmployee(u, params.id);
    const type = v.oneOf(body, 'type', ['IQAMA', 'PASSPORT', 'CONTRACT', 'CERTIFICATE', 'INSURANCE', 'OTHER'] as const)!;
    const issueDate = v.match(body, 'issueDate', DATE_RE, true);
    const expiryDate = v.match(body, 'expiryDate', DATE_RE, true);
    const d = { id: nextId(db, 'doc'), companyId: u.companyId, employeeId: e.id, type, number: (body.number as string) ?? null, note: (body.note as string) ?? null, issueDate: issueDate?.slice(0, 10) ?? null, expiryDate: expiryDate?.slice(0, 10) ?? null, createdAt: nowIso() };
    db.documents.push(d);
    if (type === 'IQAMA' && d.expiryDate) e.idExpiry = d.expiryDate;
    if (type === 'PASSPORT' && d.expiryDate) { e.passportExpiry = d.expiryDate; if (d.number) e.passportNumber = d.number; }
    svc.audit(u, 'CREATE', 'EmployeeDocument', d.id, { employeeId: e.id, ...pick(body, ['type', 'number', 'issueDate', 'expiryDate', 'note']) });
    return { ...d, status: expiryStatus(d.expiryDate, todayStr()) };
  }),
  route('DELETE', '/employees/:id/documents/:docId', ADMIN, ({ db, svc, user: u, params }) => {
    svc.scopedEmployee(u, params.id);
    const d = db.documents.find((x) => x.id === params.docId && x.employeeId === params.id && x.companyId === u.companyId);
    if (!d) throw notFound('Document', 'المستند غير موجود');
    db.documents = db.documents.filter((x) => x.id !== d.id);
    svc.audit(u, 'DELETE', 'EmployeeDocument', d.id, { employeeId: params.id, type: d.type });
    return ok;
  }),
  route('GET', '/documents/expiring', STAFF, ({ db, svc, user: u, query }) => {
    const today = todayStr();
    const limit = addDays(today, Number(query.days) || 90);
    const where = svc.employeeWhere(u);
    return db.documents
      .filter((d) => { const e = svc.emp(d.employeeId); return d.companyId === u.companyId && !!d.expiryDate && d.expiryDate <= limit && !!e && where(e) && e.status !== 'TERMINATED'; })
      .sort((a, b) => a.expiryDate!.localeCompare(b.expiryDate!))
      .map((d) => { const e = svc.emp(d.employeeId)!; return { id: d.id, employeeId: d.employeeId, employeeName: fullName(e), branchName: svc.branch(e.branchId)?.nameAr ?? null, type: d.type, number: d.number, expiryDate: d.expiryDate, status: expiryStatus(d.expiryDate, today) }; });
  }),
  route('GET', '/org-chart', STAFF, ({ db, svc, user: u }) => {
    const where = svc.employeeWhere(u);
    return db.employees.filter((e) => where(e) && e.status !== 'TERMINATED').sort(byNumber)
      .map((e) => ({ id: e.id, name: fullName(e), jobTitle: e.jobTitle, managerId: e.managerId, branchName: svc.branch(e.branchId)?.nameAr ?? null, avatarColor: e.avatarColor }));
  }),

  // ---------- shifts & roster ----------
  route('GET', '/shifts', STAFF, ({ db, svc, user: u, query }) => {
    const b = svc.branchFilter(u, query.branchId);
    return db.shifts.filter((s) => s.companyId === u.companyId && (!b || s.branchId === b)).sort((a, c) => a.branchId.localeCompare(c.branchId) || a.startTime.localeCompare(c.startTime));
  }),
  route('POST', '/shifts', MANAGERS, ({ db, svc, user: u, body }) => {
    const dto = shiftDto(body, false);
    svc.scopedBranch(u, String(dto.branchId));
    svc.assertBranch(u, String(dto.branchId));
    const s = { id: nextId(db, 'sh'), companyId: u.companyId, branchId: String(dto.branchId), name: String(dto.name), startTime: String(dto.startTime), endTime: String(dto.endTime), breakMinutes: (dto.breakMinutes as number) ?? 60, graceMinutes: (dto.graceMinutes as number) ?? 15, days: dto.days as number[], color: (dto.color as string) ?? '#0E776D', createdAt: nowIso() };
    db.shifts.push(s);
    svc.audit(u, 'CREATE', 'Shift', s.id, dto);
    return s;
  }),
  route('PATCH', '/shifts/:id', MANAGERS, ({ db, svc, user: u, params, body }) => {
    const s = db.shifts.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!s) throw notFound('Shift', 'الوردية غير موجودة');
    svc.assertBranch(u, s.branchId);
    const dto = shiftDto(body, true);
    if (dto.branchId) { svc.scopedBranch(u, String(dto.branchId)); svc.assertBranch(u, String(dto.branchId)); }
    Object.assign(s, dto);
    svc.audit(u, 'UPDATE', 'Shift', s.id, dto);
    return s;
  }),
  route('DELETE', '/shifts/:id', MANAGERS, ({ db, svc, user: u, params }) => {
    const s = db.shifts.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!s) throw notFound('Shift', 'الوردية غير موجودة');
    svc.assertBranch(u, s.branchId);
    db.shifts = db.shifts.filter((x) => x.id !== s.id);
    db.assignments = db.assignments.filter((a) => a.shiftId !== s.id);
    db.attendance.forEach((r) => { if (r.shiftId === s.id) r.shiftId = null; });
    svc.audit(u, 'DELETE', 'Shift', s.id);
    return ok;
  }),
  route('GET', '/roster', STAFF, ({ db, svc, user: u, query }) => {
    const b = svc.branchFilter(u, query.branchId);
    const today = todayStr();
    const start = query.weekStart ? query.weekStart.slice(0, 10) : addDays(today, -weekday(today));
    const end = addDays(start, 6);
    const where = svc.employeeWhere(u);
    const employees = db.employees.filter((e) => where(e) && e.status !== 'TERMINATED' && (!b || e.branchId === b)).sort(byNumber);
    const ids = new Set(employees.map((e) => e.id));
    const assignments = db.assignments.filter((a) => a.companyId === u.companyId && ids.has(a.employeeId) && a.date >= start && a.date <= end).sort((a, c) => a.date.localeCompare(c.date));
    return {
      weekStart: start,
      employees: employees.map((e) => ({ id: e.id, name: fullName(e), jobTitle: e.jobTitle, branchId: e.branchId })),
      assignments: assignments.map((a) => ({ id: a.id, employeeId: a.employeeId, shiftId: a.shiftId, date: a.date })),
    };
  }),
  route('PUT', '/roster', MANAGERS, ({ db, svc, user: u, body }) => {
    const list = Array.isArray(body.assignments) ? (body.assignments as { employeeId: string; shiftId: string | null; date: string }[]) : null;
    if (!list) throw badRequest('assignments must be an array');
    const empIds = [...new Set(list.map((a) => a.employeeId))];
    const shiftIds = [...new Set(list.map((a) => a.shiftId).filter(Boolean))] as string[];
    const where = svc.employeeWhere(u);
    if (empIds.some((id) => { const e = svc.emp(id); return !e || !where(e); })) throw notFound('Employee', 'أحد الموظفين غير موجود');
    const shifts = shiftIds.map((id) => db.shifts.find((s) => s.id === id && s.companyId === u.companyId));
    if (shifts.some((s) => !s)) throw notFound('Shift', 'إحدى الورديات غير موجودة');
    if (u.role === 'BRANCH_MANAGER') shifts.forEach((s) => svc.assertBranch(u, s!.branchId));
    let upserted = 0;
    let deleted = 0;
    for (const a of list) {
      const date = String(a.date).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('date must match /^\\d{4}-\\d{2}-\\d{2}$/');
      const idx = db.assignments.findIndex((x) => x.employeeId === a.employeeId && x.date === date);
      if (!a.shiftId) { if (idx >= 0) { db.assignments.splice(idx, 1); deleted++; } }
      else {
        if (idx >= 0) db.assignments[idx].shiftId = a.shiftId;
        else db.assignments.push({ id: nextId(db, 'asg'), companyId: u.companyId, employeeId: a.employeeId, shiftId: a.shiftId, date });
        upserted++;
      }
    }
    svc.audit(u, 'UPDATE', 'Roster', null, { upserted, deleted });
    return { ok: true, upserted, deleted };
  }),

  // ---------- attendance ----------
  route('GET', '/attendance', STAFF, ({ svc, user: u, query }) => {
    const b = svc.branchFilter(u, query.branchId);
    const where = svc.employeeWhere(u);
    return svc.board((e) => where(e) && (!b || e.branchId === b), query.date || todayStr());
  }),
  route('GET', '/attendance/summary', STAFF, ({ svc, user, query }) => attendanceSummary(svc, user, query)),
  route('POST', '/attendance/manual', MANAGERS, ({ svc, user: u, body }) => {
    v.str(body, 'employeeId'); const date = v.match(body, 'date', /^\d{4}-\d{2}-\d{2}$/)!;
    const status = v.oneOf(body, 'status', ['ABSENT'] as const, true);
    const e = svc.scopedEmployee(u, String(body.employeeId));
    const r = upsertRecord(svc, u.companyId, e, date, body.checkIn as string, body.checkOut as string, { note: body.note as string, source: 'MANUAL', status });
    svc.audit(u, 'MANUAL_ENTRY', 'AttendanceRecord', r.id, pick(body, ['employeeId', 'date', 'checkIn', 'checkOut', 'note', 'status']));
    return r;
  }),
  route('PATCH', '/attendance/:id', MANAGERS, ({ db, svc, user: u, params, body }) => {
    const rec = db.attendance.find((r) => r.id === params.id && r.companyId === u.companyId);
    if (!rec) throw notFound('Attendance record', 'سجل الحضور غير موجود');
    const e = svc.scopedEmployee(u, rec.employeeId);
    // Keep an ABSENT day absent unless the edit supplies a check-in.
    const status = v.oneOf(body, 'status', ['ABSENT'] as const, true) ?? (rec.status === 'ABSENT' && body.checkIn === undefined ? 'ABSENT' : undefined);
    const r = upsertRecord(svc, u.companyId, e, dayStr(rec.date)!, body.checkIn !== undefined ? (body.checkIn as string) : rec.checkIn, body.checkOut !== undefined ? (body.checkOut as string) : rec.checkOut, { note: (body.note as string) ?? rec.note, source: 'MANUAL', status });
    svc.audit(u, 'UPDATE', 'AttendanceRecord', rec.id, pick(body, ['checkIn', 'checkOut', 'note', 'status']));
    return r;
  }),
];

export type { Ctx };
