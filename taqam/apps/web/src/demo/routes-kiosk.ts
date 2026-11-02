/**
 * Demo API — branch kiosk (spec §6), mirroring apps/api/src/kiosk: pairing (token shown once, sha256 stored), the
 * kiosk screen (X-Kiosk-Token), employee number + PIN punches with the 5-in-15-minutes lockout, and the PIN endpoints.
 * Never uses the camera.
 */
import { currentBranchCode, sha256 } from '@/lib/hmac';
import {
  afterPinFailure, isPinLocked, kioskAction, matchEmployeeNumber, normalizePin, PIN_CLEAR,
  DEMO_KIOSK_TOKEN, KIOSK_INVALID_AR, KIOSK_LOCKED_AR, KIOSK_MAX_FAILS, KIOSK_TOKEN_INVALID_AR, NEED_KIOSK_AR,
} from '@/lib/kiosk';
import { todayStr } from './dates';
import { nextId, type DB, type KioskDevice, type KioskPin } from './db';
import { HttpError, badRequest, conflict, forbidden, notFound } from './errors';
import { assertCompanyAccess } from './lifecycle';
import { route, type Route } from './router';
import { ADMIN, ALL_ROLES, Services, fullName, nowIso, type AuthUser } from './services';
import { withFlags } from './routes-devices';

const MANAGERS = ['OWNER', 'HR_ADMIN', 'BRANCH_MANAGER'] as const;
const OVERNIGHT_WINDOW_MS = 16 * 3600 * 1000;
const PIN_FORMAT_AR = 'رمز الحضور السريع يتكون من 4 إلى 6 أرقام';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const sha256Hex = (s: string) => hex(sha256(new TextEncoder().encode(s)));
export const hashKioskToken = (token: string) => sha256Hex(token.trim().toLowerCase());
const hashPin = (employeeId: string, pin: string) => sha256Hex(`shuoon-kiosk-pin:${employeeId}:${pin}`);

function randomToken(): string {
  const bytes = new Uint8Array(32);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return hex(bytes);
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const k = Object.keys(headers).find((h) => h.toLowerCase() === name.toLowerCase());
  return k ? headers[k] : undefined;
}

/** Seed: the pre-paired demo kiosk of «فرع العليا» and PIN 1234 for every active demo employee. */
export function seedKiosk(db: DB, companyId: string, branchId: string, createdAt: string) {
  db.kioskDevices.push({ id: nextId(db, 'ksk'), companyId, branchId, name: 'جهاز مدخل العليا', tokenHash: hashKioskToken(DEMO_KIOSK_TOKEN), lastSeenAt: null, revokedAt: null, createdAt });
  for (const e of db.employees) {
    if (e.companyId === companyId && e.status !== 'TERMINATED') db.kioskPins.push({ employeeId: e.id, pinHash: hashPin(e.id, '1234'), ...PIN_CLEAR });
  }
}

const activeKiosks = (db: DB, companyId: string) => db.kioskDevices.filter((k) => k.companyId === companyId && !k.revokedAt).length;
/** GET /company: the «require branch code» toggle can only be switched on while a kiosk shows the code. */
export const companyKioskCount = activeKiosks;
/** PATCH /company guard (same rule and message as the API). */
export function assertCanRequireBranchCode(db: DB, companyId: string, requireBranchCode: unknown) {
  if (requireBranchCode === true && !activeKiosks(db, companyId)) throw badRequest('Pair a branch kiosk first so employees can see the code', NEED_KIOSK_AR);
}

function pinOf(db: DB, employeeId: string): KioskPin | undefined {
  return db.kioskPins.find((p) => p.employeeId === employeeId);
}
function setPin(svc: Services, employeeId: string, raw: unknown) {
  const pin = normalizePin(raw);
  if (!pin) throw badRequest('PIN must be 4 to 6 digits', PIN_FORMAT_AR);
  const db = svc.db;
  db.kioskPins = db.kioskPins.filter((p) => p.employeeId !== employeeId);
  db.kioskPins.push({ employeeId, pinHash: hashPin(employeeId, pin), ...PIN_CLEAR }); // a new PIN clears any lockout
}

function manageableBranch(svc: Services, u: AuthUser, id: string) {
  const b = svc.scopedBranch(u, id);
  svc.assertBranch(u, b.id);
  return b;
}

const kioskView = (k: KioskDevice) => ({ id: k.id, name: k.name, branchId: k.branchId, lastSeenAt: k.lastSeenAt, revokedAt: k.revokedAt, createdAt: k.createdAt });

/** KioskGuard: X-Kiosk-Token → paired, non-revoked kiosk of an accessible company; else 401 KIOSK_TOKEN_INVALID. */
function resolveKiosk(svc: Services, headers: Record<string, string>): KioskDevice {
  const raw = String(header(headers, 'X-Kiosk-Token') ?? '').trim();
  const invalid = () => new HttpError(401, { message: 'Kiosk is not paired or was revoked', messageAr: KIOSK_TOKEN_INVALID_AR, code: 'KIOSK_TOKEN_INVALID' });
  if (!/^[0-9a-f]{64}$/i.test(raw)) throw invalid();
  const hash = hashKioskToken(raw);
  const k = svc.db.kioskDevices.find((x) => x.tokenHash === hash);
  if (!k || k.revokedAt) throw invalid();
  assertCompanyAccess(svc, k.companyId);
  const now = Date.now();
  if (!k.lastSeenAt || now - Date.parse(k.lastSeenAt) > 60_000) { k.lastSeenAt = new Date(now).toISOString(); svc.dirty = true; }
  return k;
}

const invalidCredentials = () => new HttpError(401, { message: 'Invalid employee number or PIN', messageAr: KIOSK_INVALID_AR });

function punch(svc: Services, k: KioskDevice, body: Record<string, unknown>) {
  const db = svc.db;
  if (typeof body.employeeNumber !== 'string' || body.employeeNumber.length > 32) throw badRequest('employeeNumber must be a string');
  if (typeof body.pin !== 'string' || body.pin.length > 32) throw badRequest('pin must be a string');
  const candidates = db.employees.filter((e) => e.companyId === k.companyId && e.branchId === k.branchId && e.status !== 'TERMINATED');
  const e = matchEmployeeNumber(body.employeeNumber, candidates);
  if (!e) throw invalidCredentials(); // unknown, other branch or terminated: same answer, nothing counted
  const now = new Date();
  let state = pinOf(db, e.id);
  if (!state) { state = { employeeId: e.id, pinHash: null, ...PIN_CLEAR }; db.kioskPins.push(state); }
  if (isPinLocked(state, now)) throw new HttpError(423, { message: 'PIN temporarily locked after too many attempts, try again in 15 minutes', messageAr: KIOSK_LOCKED_AR, code: 'KIOSK_PIN_LOCKED' });
  const pin = normalizePin(body.pin);
  svc.dirty = true; // failures must persist even though the request then fails
  if (!state.pinHash || !pin || hashPin(e.id, pin) !== state.pinHash) {
    Object.assign(state, afterPinFailure(state, now));
    if (state.lockedUntil) {
      svc.audit({ id: null, name: `جهاز الحضور: ${k.name}`, companyId: k.companyId }, 'KIOSK_PIN_LOCKED', 'Employee', e.id, { kioskId: k.id });
      svc.notifyApprovers(k.companyId, e.branchId, 'تم إيقاف رمز الحضور السريع مؤقتاً', `${fullName(e)} — ${KIOSK_MAX_FAILS} محاولات خاطئة على «${k.name}». أُوقف الرمز 15 دقيقة.`, `/employees/${e.id}`);
      svc.notifyEmployees(k.companyId, [e.id], 'تم إيقاف رمز الحضور السريع مؤقتاً', `${KIOSK_MAX_FAILS} محاولات خاطئة على جهاز الحضور في الفرع. إن لم تكن أنت فأبلغ الموارد البشرية.`, '/me/more');
    }
    throw invalidCredentials();
  }
  Object.assign(state, PIN_CLEAR);

  // the punch: same attendance computation as the ESS check-in/out; no device binding, no geofence (trusted kiosk)
  const today = todayStr(now);
  const todayRec = db.attendance.find((r) => r.employeeId === e.id && r.date === today) ?? null;
  const since = now.getTime() - OVERNIGHT_WINDOW_MS;
  const previousOpen = todayRec?.checkIn ? null : db.attendance
    .filter((r) => r.employeeId === e.id && r.date < today && r.checkIn && !r.checkOut && Date.parse(r.checkIn) >= since && Date.parse(r.checkIn) <= now.getTime())
    .sort((a, b) => b.checkIn!.localeCompare(a.checkIn!))[0] ?? null;
  const lite = (r: typeof todayRec) => (r ? { checkIn: r.checkIn, checkOut: r.checkOut, shift: svc.shift(r.shiftId) } : null);
  const decision = kioskAction(lite(todayRec), lite(previousOpen), now);
  if ('error' in decision) {
    if (decision.error === 'ALREADY_OUT') throw conflict('Already checked out today', 'تم تسجيل الانصراف مسبقاً اليوم');
    throw conflict('Checked in a moment ago', 'تم تسجيل حضورك قبل قليل');
  }
  const actor = { id: null, name: `جهاز الحضور: ${k.name}`, companyId: k.companyId };
  const iso = now.toISOString();
  const employeeName = fullName(e);
  if (decision.action === 'IN') {
    const shift = svc.shiftFor(e, today);
    const m = svc.compute(shift, now, null);
    const data = { shiftId: shift?.id ?? null, checkIn: iso, checkInReceivedAt: iso, lateMinutes: m.lateMinutes, workedMinutes: 0, overtimeMinutes: 0, status: m.status, source: 'KIOSK', flags: withFlags(todayRec?.flags ?? [], ['KIOSK']), updatedAt: iso };
    let rec = todayRec;
    if (rec) Object.assign(rec, data);
    else {
      rec = { id: nextId(db, 'att'), companyId: k.companyId, employeeId: e.id, date: today, checkOut: null, checkInLat: null, checkInLng: null, checkOutLat: null, checkOutLng: null, earlyLeaveMinutes: 0, note: null, createdAt: iso, ...data };
      db.attendance.push(rec);
    }
    svc.audit(actor, 'CHECK_IN', 'AttendanceRecord', rec.id, { kioskId: k.id, employeeId: e.id, lateMinutes: m.lateMinutes });
    return { action: 'IN', employeeName, time: iso, lateMinutes: m.lateMinutes };
  }
  const rec = decision.target === 'today' ? todayRec! : previousOpen!;
  const shift = svc.shift(rec.shiftId) ?? svc.shiftFor(e, rec.date);
  const m = svc.compute(shift, new Date(rec.checkIn!), now);
  Object.assign(rec, { checkOut: iso, checkOutReceivedAt: iso, workedMinutes: m.workedMinutes, lateMinutes: m.lateMinutes, earlyLeaveMinutes: m.earlyLeaveMinutes, overtimeMinutes: m.overtimeMinutes, status: m.status, flags: withFlags(rec.flags, ['KIOSK']), updatedAt: iso });
  svc.audit(actor, 'CHECK_OUT', 'AttendanceRecord', rec.id, { kioskId: k.id, employeeId: e.id, workedMinutes: m.workedMinutes });
  return { action: 'OUT', employeeName, time: iso, lateMinutes: m.lateMinutes };
}

function myEmployeeId(svc: Services, u: AuthUser) {
  if (!u.employeeId) throw forbidden('This account is not linked to an employee', 'حسابك غير مرتبط بملف موظف');
  const e = svc.emp(u.employeeId);
  if (!e || e.companyId !== u.companyId) throw notFound('Employee', 'ملف الموظف غير موجود');
  return e.id;
}

export const kioskRoutes: Route[] = [
  // ---------- HR / branch manager ----------
  route('POST', '/branches/:id/kiosks', [...MANAGERS], ({ db, svc, user: u, params, body }) => {
    const b = manageableBranch(svc, u, params.id);
    if (typeof body.name !== 'string' || body.name.length > 60) throw badRequest('name must be a string');
    const name = body.name.trim();
    if (!name) throw badRequest('name is required', 'أدخل اسماً للجهاز');
    const token = randomToken();
    const k: KioskDevice = { id: nextId(db, 'ksk'), companyId: u.companyId, branchId: b.id, name, tokenHash: hashKioskToken(token), lastSeenAt: null, revokedAt: null, createdAt: nowIso() };
    db.kioskDevices.push(k);
    svc.audit(u, 'CREATE', 'KioskDevice', k.id, { name, branchId: b.id });
    return { id: k.id, name: k.name, token };
  }),
  route('GET', '/branches/:id/kiosks', [...MANAGERS], ({ db, svc, user: u, params }) => {
    const b = manageableBranch(svc, u, params.id);
    return db.kioskDevices.filter((k) => k.companyId === u.companyId && k.branchId === b.id)
      .sort((a, c) => (a.revokedAt ? 1 : 0) - (c.revokedAt ? 1 : 0) || c.createdAt.localeCompare(a.createdAt)).map(kioskView);
  }),
  route('DELETE', '/kiosks/:id', [...MANAGERS], ({ db, svc, user: u, params }) => {
    const k = db.kioskDevices.find((x) => x.id === params.id && x.companyId === u.companyId && (u.role !== 'BRANCH_MANAGER' || x.branchId === (u.branchId ?? '__none__')));
    if (!k) throw notFound('Kiosk', 'جهاز الحضور غير موجود');
    if (k.revokedAt) return { ok: true, requireBranchCodeDisabled: false };
    k.revokedAt = nowIso();
    const c = svc.company(u.companyId);
    // the last active kiosk: nothing shows the branch code any more, so it can no longer be required
    const disabled = !activeKiosks(db, u.companyId) && c.requireBranchCode;
    if (disabled) Object.assign(c, { requireBranchCode: false, updatedAt: nowIso() });
    svc.audit(u, 'REVOKE', 'KioskDevice', k.id, { name: k.name, branchId: k.branchId, requireBranchCodeDisabled: disabled });
    return { ok: true, requireBranchCodeDisabled: disabled };
  }),
  route('GET', '/me/kiosk-pin', ALL_ROLES, ({ db, svc, user: u }) => ({ hasPin: !!pinOf(db, myEmployeeId(svc, u))?.pinHash })),
  route('POST', '/me/kiosk-pin', ALL_ROLES, ({ svc, user: u, body }) => {
    const id = myEmployeeId(svc, u);
    setPin(svc, id, body.pin);
    svc.audit(u, 'SET_KIOSK_PIN', 'Employee', id, { by: 'self' });
    return { ok: true };
  }),
  route('GET', '/employees/:id/kiosk-pin', ADMIN, ({ db, svc, user: u, params }) => {
    const e = svc.scopedEmployee(u, params.id);
    const p = pinOf(db, e.id);
    return { hasPin: !!p?.pinHash, lockedUntil: p && isPinLocked(p, new Date()) ? p.lockedUntil : null };
  }),
  route('POST', '/employees/:id/kiosk-pin', ADMIN, ({ svc, user: u, params, body }) => {
    const e = svc.scopedEmployee(u, params.id);
    setPin(svc, e.id, body.pin);
    svc.audit(u, 'SET_KIOSK_PIN', 'Employee', e.id, { by: 'hr' });
    svc.notifyEmployees(u.companyId, [e.id], 'تم تعيين رمز الحضور السريع (PIN)', 'عيّنت الموارد البشرية رمزاً جديداً لجهاز الحضور في الفرع', '/me/more');
    return { ok: true };
  }),

  // ---------- the kiosk screen (X-Kiosk-Token, no user login) ----------
  route('GET', '/kiosk/me', 'PUBLIC', ({ svc, headers }) => {
    const k = resolveKiosk(svc, headers);
    const b = svc.branch(k.branchId)!;
    const { code, expiresInSeconds } = currentBranchCode(b.codeSecret);
    return { branchName: b.nameAr, companyName: svc.company(k.companyId).nameAr, branchCode: code, codeExpiresInSeconds: expiresInSeconds };
  }),
  route('POST', '/kiosk/punch', 'PUBLIC', ({ svc, headers, body }) => punch(svc, resolveKiosk(svc, headers), body)),
];
