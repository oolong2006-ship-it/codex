/**
 * Demo API — anti-tamper attendance (spec §6), mirroring apps/api: ESS device binding (DevicesService),
 * the rotating branch code and offline replays (MeController.guardPunch). No photos, ever.
 */
import { verifyBranchCode } from '@taqam/core';
import { hmacSha256, sha256 } from '@/lib/hmac';
import { nextId, type Branch, type EmployeeDevice, type EmployeeDeviceStatus } from './db';
import { HttpError, badRequest, conflict, notFound } from './errors';
import { route, type Route } from './router';
import { Services, fullName, nowIso, type AuthUser } from './services';

export const DEVICE_NOT_REGISTERED_AR = 'هذا الجهاز غير مسجل لحسابك. اطلب من الموارد البشرية اعتماد الجهاز الجديد';
const DEVICE_STATUSES: EmployeeDeviceStatus[] = ['ACTIVE', 'PENDING', 'REJECTED', 'REVOKED'];
const DEVICE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const OFFLINE_MAX_AGE_MS = 12 * 3600 * 1000;
const OFFLINE_MAX_SKEW_MS = 2 * 60 * 1000;
const MANAGERS = ['OWNER', 'HR_ADMIN', 'BRANCH_MANAGER'] as const;

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** Deterministic secret for seeded demo branches (stable across re-seeds). */
export function seededBranchSecret(branchId: string): string {
  return toHex(sha256(new TextEncoder().encode(`shuoon-demo-branch:${branchId}`)));
}

/** Random 32-byte secret for a branch created in the demo. */
export function randomBranchSecret(): string {
  const bytes = new Uint8Array(32);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return toHex(bytes);
}

/** Branch as the API returns it: the code secret never leaves the server. */
export function branchPublic<T extends Pick<Branch, 'codeSecret'>>(b: T): Omit<T, 'codeSecret'> {
  const { codeSecret: _s, ...rest } = b;
  return rest;
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const k = Object.keys(headers).find((h) => h.toLowerCase() === name.toLowerCase());
  return k ? headers[k] : undefined;
}

export interface PunchContext {
  at: Date; captured: Date | null; offline: boolean; receivedAt: Date; device: EmployeeDevice | null; flags: string[];
}

/** MeController samePunch: identical time, or an OFFLINE record within the skew allowance before a future capturedAt. */
export function samePunch(existingIso: string, existingFlags: string[], ctx: PunchContext): boolean {
  if (!ctx.offline || !ctx.captured) return false;
  const existing = Date.parse(existingIso);
  if (existing === ctx.at.getTime()) return true;
  const ahead = ctx.captured.getTime() - existing;
  return existingFlags.includes('OFFLINE') && ahead > 0 && ahead <= OFFLINE_MAX_SKEW_MS;
}

/** DevicesService.check: first punch binds; another device → 403 and one PENDING request per employee. */
function checkDevice(svc: Services, companyId: string, employee: { id: string; branchId: string | null; firstNameAr: string; lastNameAr: string }, raw: string | undefined, userAgent: string | null): { device: EmployeeDevice; flags: string[] } {
  const db = svc.db;
  const employeeId = employee.id;
  const deviceId = String(raw ?? '').trim();
  if (!DEVICE_ID.test(deviceId)) throw badRequest('X-Device-Id header is required', 'تعذّر التعرّف على هذا الجهاز. حدّث الصفحة ثم حاول مرة أخرى');
  const ua = userAgent ? userAgent.slice(0, 300) : null;
  const devices = db.employeeDevices.filter((d) => d.employeeId === employeeId);
  const mine = devices.find((d) => d.deviceId === deviceId);
  const dropOtherPending = () => { db.employeeDevices = db.employeeDevices.filter((d) => !(d.employeeId === employeeId && d.status === 'PENDING' && d.deviceId !== deviceId)); };
  svc.dirty = true;
  if (mine?.status === 'ACTIVE') return { device: mine, flags: mine.approvedById && !mine.lastUsedAt ? ['NEW_DEVICE_APPROVED'] : [] };
  if (!devices.some((d) => d.status === 'ACTIVE')) {
    dropOtherPending();
    if (mine) {
      Object.assign(mine, { status: 'ACTIVE', userAgent: ua, approvedById: null, decidedAt: null });
      return { device: mine, flags: [] };
    }
    const bound: EmployeeDevice = { id: nextId(db, 'dev'), companyId, employeeId, deviceId, status: 'ACTIVE', userAgent: ua, createdAt: nowIso(), approvedById: null, decidedAt: null, lastUsedAt: null };
    db.employeeDevices.push(bound);
    return { device: bound, flags: [] };
  }
  dropOtherPending();
  let created = false;
  if (!mine) {
    db.employeeDevices.push({ id: nextId(db, 'dev'), companyId, employeeId, deviceId, status: 'PENDING', userAgent: ua, createdAt: nowIso(), approvedById: null, decidedAt: null, lastUsedAt: null });
    created = true;
  } else if (mine.status === 'REVOKED') {
    Object.assign(mine, { status: 'PENDING', userAgent: ua, approvedById: null, decidedAt: null });
    created = true;
  }
  if (created) svc.notifyApprovers(companyId, employee.branchId, 'طلب اعتماد جهاز جديد', `${fullName(employee)} — يحاول البصمة من جهاز غير مسجل`, '/attendance/devices');
  throw new HttpError(403, { message: 'This device is not registered for your account', messageAr: DEVICE_NOT_REGISTERED_AR, code: 'DEVICE_NOT_REGISTERED', deviceStatus: mine?.status === 'REJECTED' ? 'REJECTED' : 'PENDING' });
}

/**
 * MeController.guardPunch: offline window → geofence (`geofence` callback) → branch code → device binding, so a
 * failing punch never binds a device. Offline: the code is checked against capturedAt; missing/invalid → NO_BRANCH_CODE.
 */
export function guardPunch(svc: Services, companyId: string, employee: { id: string; branchId: string | null; firstNameAr: string; lastNameAr: string }, body: Record<string, unknown>, headers: Record<string, string>, geofence: () => void): PunchContext {
  const now = new Date();
  let at = now;
  let captured: Date | null = null;
  const flags: string[] = [];
  const offline = body.capturedAt !== undefined && body.capturedAt !== null;
  if (offline) {
    const raw = body.capturedAt;
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
    if (typeof raw !== 'string' || !iso.test(raw)) throw badRequest('capturedAt must be a valid ISO 8601 date string');
    captured = new Date(raw);
    if (Number.isNaN(captured.getTime()) || captured.getTime() < now.getTime() - OFFLINE_MAX_AGE_MS || captured.getTime() > now.getTime() + OFFLINE_MAX_SKEW_MS) {
      throw badRequest('capturedAt is outside the allowed window (12 hours)', 'وقت التسجيل خارج المدة المسموحة (12 ساعة)');
    }
    at = captured > now ? now : captured;
    flags.push('OFFLINE');
  }
  if (body.branchCode !== undefined && (typeof body.branchCode !== 'string' || body.branchCode.length > 12)) throw badRequest('branchCode must be a string');
  geofence();
  const company = svc.company(companyId);
  if (company.requireBranchCode) {
    const code = typeof body.branchCode === 'string' ? body.branchCode.trim() : '';
    const branch = svc.branch(employee.branchId)!;
    if (!offline) {
      if (!code) throw badRequest('Branch code is required', 'أدخل رمز الفرع الظاهر على شاشة الحضور');
      if (!verifyBranchCode(branch.codeSecret, code, now, hmacSha256)) throw badRequest('Invalid or expired branch code', 'رمز الفرع غير صحيح أو منتهي');
    } else if (!code || !verifyBranchCode(branch.codeSecret, code, captured!, hmacSha256)) {
      flags.push('NO_BRANCH_CODE');
    }
  }
  const ua = header(headers, 'User-Agent') ?? (typeof navigator !== 'undefined' ? navigator.userAgent ?? null : null);
  const dev = company.deviceBinding ? checkDevice(svc, companyId, employee, header(headers, 'X-Device-Id'), ua) : null;
  return { at, captured, offline, receivedAt: now, device: dev?.device ?? null, flags: [...flags, ...(dev?.flags ?? [])] };
}

export const withFlags = (existing: string[], add: string[]) => [...new Set([...existing, ...add])];

/** A successful punch spends the NEW_DEVICE_APPROVED flag. */
export function markDeviceUsed(svc: Services, device: EmployeeDevice | null) {
  if (device) device.lastUsedAt = nowIso();
}

// ---------- HR ----------
function deviceView(svc: Services, d: EmployeeDevice) {
  const e = svc.emp(d.employeeId)!;
  return {
    id: d.id, employeeId: d.employeeId, employeeName: fullName(e), employeeNumber: e.employeeNumber, branchId: e.branchId,
    branchName: svc.branch(e.branchId)?.nameAr ?? null, deviceIdSuffix: d.deviceId.slice(-6), status: d.status, userAgent: d.userAgent, createdAt: d.createdAt,
    decidedAt: d.decidedAt, approvedById: d.approvedById, lastUsedAt: d.lastUsedAt,
  };
}

function visible(svc: Services, u: AuthUser) {
  const where = svc.employeeWhere(u);
  return (d: EmployeeDevice) => {
    const e = svc.emp(d.employeeId);
    return d.companyId === u.companyId && !!e && where(e);
  };
}

/** A branch manager never decides their own device (same rule as leaves and requests). */
function assertNotOwn(u: AuthUser, employeeId: string) {
  if (u.role === 'BRANCH_MANAGER' && u.employeeId && u.employeeId === employeeId) throw badRequest('You cannot approve your own request', 'لا يمكنك اعتماد طلبك بنفسك');
}

function pending(svc: Services, u: AuthUser, id: string) {
  const d = svc.db.employeeDevices.find((x) => x.id === id && visible(svc, u)(x));
  if (!d) throw notFound('Device', 'الجهاز غير موجود');
  assertNotOwn(u, d.employeeId);
  if (d.status !== 'PENDING') throw conflict('Device request already decided', 'تم البت في طلب هذا الجهاز مسبقاً');
  return d;
}

export const deviceRoutes: Route[] = [
  route('GET', '/devices', [...MANAGERS], ({ db, svc, user: u, query }) => {
    const s = query.status;
    if (s && !DEVICE_STATUSES.includes(s as EmployeeDeviceStatus)) throw badRequest('Invalid status', 'حالة الجهاز غير صالحة');
    return db.employeeDevices.filter((d) => visible(svc, u)(d) && (!s || d.status === s))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((d) => deviceView(svc, d));
  }),
  route('POST', '/devices/:id/approve', [...MANAGERS], ({ db, svc, user: u, params }) => {
    const d = pending(svc, u, params.id);
    const now = nowIso();
    db.employeeDevices.forEach((x) => { if (x.employeeId === d.employeeId && x.status === 'ACTIVE') Object.assign(x, { status: 'REVOKED', decidedAt: now }); });
    Object.assign(d, { status: 'ACTIVE', approvedById: u.id, decidedAt: now, lastUsedAt: null });
    svc.audit(u, 'APPROVE', 'EmployeeDevice', d.id, { employeeId: d.employeeId });
    return deviceView(svc, d);
  }),
  route('POST', '/devices/:id/reject', [...MANAGERS], ({ svc, user: u, params }) => {
    const d = pending(svc, u, params.id);
    Object.assign(d, { status: 'REJECTED', approvedById: null, decidedAt: nowIso() });
    svc.audit(u, 'REJECT', 'EmployeeDevice', d.id, { employeeId: d.employeeId });
    return deviceView(svc, d);
  }),
  route('DELETE', '/employees/:id/devices', [...MANAGERS], ({ db, svc, user: u, params }) => {
    const where = svc.employeeWhere(u);
    const e = db.employees.find((x) => x.id === params.id && where(x));
    if (!e) throw notFound('Employee', 'الموظف غير موجود');
    assertNotOwn(u, e.id);
    const before = db.employeeDevices.length;
    db.employeeDevices = db.employeeDevices.filter((d) => !(d.employeeId === e.id && d.companyId === u.companyId));
    const removed = before - db.employeeDevices.length;
    svc.audit(u, 'RESET_DEVICES', 'Employee', e.id, { removed });
    return { removed };
  }),
];
