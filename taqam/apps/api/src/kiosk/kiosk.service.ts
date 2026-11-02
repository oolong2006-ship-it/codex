import { HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../shared/audit.service';
import { ScopeService } from '../shared/scope.service';
import { NotifyService } from '../shared/notifications.service';
import { AttendanceCalcService } from '../shared/attendance-calc.service';
import { AuthUser } from '../common/types';
import { day, todayStr } from '../common/dates';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { fullName } from '../employees/employee.view';
import { currentBranchCode } from '../attendance/branch-code';

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in kiosk.service.spec.ts)
// ---------------------------------------------------------------------------

/** 5 wrong PINs within 15 minutes lock the employee's PIN for 15 minutes (spec §6). */
export const KIOSK_MAX_FAILS = 5;
export const KIOSK_WINDOW_MS = 15 * 60_000;
export const KIOSK_LOCK_MS = 15 * 60_000;
/** A second tap this soon after a kiosk check-in is not taken as the check-out. */
export const KIOSK_DOUBLE_TAP_MS = 60_000;
/** Same reach as the ESS self check-out for closing an overnight record. */
const OVERNIGHT_WINDOW_MS = 16 * 3600 * 1000;
const BCRYPT_ROUNDS = 10;

export const KIOSK_INVALID_AR = 'رقم الموظف أو الرمز غير صحيح';
export const KIOSK_LOCKED_AR = 'تم إيقاف الرمز مؤقتاً لكثرة المحاولات، حاول بعد 15 دقيقة';
export const KIOSK_TOKEN_INVALID_AR = 'هذا الجهاز غير مربوط أو أُلغي ربطه. اطلب رمز جهاز جديد من الموارد البشرية';
export const NEED_KIOSK_AR = 'اربط جهاز حضور في الفرع أولاً ليظهر الرمز للموظفين';
const PIN_FORMAT_AR = 'رمز الحضور السريع يتكون من 4 إلى 6 أرقام';

/** Random pairing token: 32 bytes as hex, shown once. */
export const newKioskToken = () => randomBytes(32).toString('hex');
/** Only the sha256 of the token is stored. */
export const hashKioskToken = (token: string) => createHash('sha256').update(token).digest('hex');

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXTENDED_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';
/** Trims and maps Arabic-Indic digits (both forms) to ASCII. */
export function normalizeDigits(s: string): string {
  return String(s ?? '')
    .trim()
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EXTENDED_ARABIC_INDIC.indexOf(d)));
}

/** The PIN as ASCII digits, or null when it is not 4–6 digits. */
export function normalizePin(pin: unknown): string | null {
  if (typeof pin !== 'string') return null;
  const p = normalizeDigits(pin);
  return /^\d{4,6}$/.test(p) ? p : null;
}

export interface PinState {
  kioskFailCount: number;
  kioskFirstFailAt: Date | null;
  kioskLockedUntil: Date | null;
}
export const PIN_CLEAR: PinState = { kioskFailCount: 0, kioskFirstFailAt: null, kioskLockedUntil: null };

export const isPinLocked = (s: PinState, now: Date) => !!s.kioskLockedUntil && s.kioskLockedUntil.getTime() > now.getTime();

/** State after one more wrong PIN: the window restarts when its first failure is older than 15 minutes. */
export function afterPinFailure(s: PinState, now: Date): PinState {
  const fresh = !s.kioskFirstFailAt || now.getTime() - s.kioskFirstFailAt.getTime() > KIOSK_WINDOW_MS;
  const count = fresh ? 1 : s.kioskFailCount + 1;
  return {
    kioskFailCount: count,
    kioskFirstFailAt: fresh ? now : s.kioskFirstFailAt,
    kioskLockedUntil: count >= KIOSK_MAX_FAILS ? new Date(now.getTime() + KIOSK_LOCK_MS) : null,
  };
}

/**
 * The employee typed on the kiosk keypad: an exact (case-insensitive) employee number, or digits only matched
 * against the numeric part ("7" or "٠٠٠٧" → EMP-0007). No match or an ambiguous one → null.
 */
export function matchEmployeeNumber<T extends { employeeNumber: string }>(input: string, candidates: T[]): T | null {
  const typed = normalizeDigits(input).toUpperCase();
  if (!typed) return null;
  const exact = candidates.filter((c) => c.employeeNumber.toUpperCase() === typed);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1 || !/^\d+$/.test(typed)) return null;
  const n = Number(typed);
  if (!n) return null;
  const byDigits = candidates.filter((c) => {
    const digits = c.employeeNumber.replace(/\D/g, '');
    return digits !== '' && Number(digits) === n;
  });
  return byDigits.length === 1 ? byDigits[0] : null;
}

interface RecLite {
  checkIn: Date | null;
  checkOut: Date | null;
  shift: { startTime: string; endTime: string } | null;
}
export type KioskDecision = { action: 'IN' } | { action: 'OUT'; target: 'today' | 'previous' } | { error: 'ALREADY_OUT' | 'TOO_SOON' };

const crossesMidnight = (s: { startTime: string; endTime: string }) => s.endTime <= s.startTime;

/**
 * IN when there is no check-in today, else OUT. With no record today, a still-open record from the previous day
 * (found by the caller within the ESS overnight reach) closes as OUT only when its shift crosses midnight — the kiosk
 * infers the action, so a day-shift employee who forgot to check out yesterday starts a new day instead.
 */
export function kioskAction(today: RecLite | null, previousOpen: RecLite | null, now: Date): KioskDecision {
  if (today?.checkIn) {
    if (today.checkOut) return { error: 'ALREADY_OUT' };
    if (now.getTime() - today.checkIn.getTime() < KIOSK_DOUBLE_TAP_MS) return { error: 'TOO_SOON' };
    return { action: 'OUT', target: 'today' };
  }
  if (previousOpen?.checkIn && !previousOpen.checkOut && previousOpen.shift && crossesMidnight(previousOpen.shift)) {
    return { action: 'OUT', target: 'previous' };
  }
  return { action: 'IN' };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** The paired kiosk resolved by KioskGuard from X-Kiosk-Token. */
export interface KioskContext {
  id: string;
  name: string;
  companyId: string;
  branchId: string;
}

export interface KioskPunchResult {
  action: 'IN' | 'OUT';
  employeeName: string;
  time: Date;
  lateMinutes: number;
}

const invalidCredentials = () => new UnauthorizedException({ message: 'Invalid employee number or PIN', messageAr: KIOSK_INVALID_AR });
const lockedError = () =>
  new HttpException({ message: 'PIN temporarily locked after too many attempts, try again in 15 minutes', messageAr: KIOSK_LOCKED_AR, code: 'KIOSK_PIN_LOCKED' }, 423);

const withFlags = (existing: string[], add: string[]) => [...new Set([...existing, ...add])];

/** Branch kiosk (spec §6): paired shared tablet, employee number + PIN punches, brute-force lockout. Never uses the camera. */
@Injectable()
export class KioskService {
  /** bcrypt hash compared when there is no real one, so unknown numbers cost the same time as a wrong PIN. */
  private readonly dummyHash = bcrypt.hashSync(randomBytes(16).toString('hex'), BCRYPT_ROUNDS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly notify: NotifyService,
    private readonly att: AttendanceCalcService,
  ) {}

  // ---------- pairing (HR / branch manager) ----------
  private async manageableBranch(u: AuthUser, branchId: string) {
    const b = await this.scope.branch(u, branchId);
    this.scope.assertBranch(u, b.id);
    return b;
  }

  async pair(u: AuthUser, branchId: string, nameRaw: string) {
    const b = await this.manageableBranch(u, branchId);
    const name = String(nameRaw ?? '').trim();
    if (!name) throw badRequest('name is required', 'أدخل اسماً للجهاز');
    const token = newKioskToken();
    const k = await this.prisma.kioskDevice.create({ data: { companyId: u.companyId, branchId: b.id, name, tokenHash: hashKioskToken(token) } });
    await this.audit.log(u, 'CREATE', 'KioskDevice', k.id, { name, branchId: b.id });
    return { id: k.id, name: k.name, token };
  }

  async list(u: AuthUser, branchId: string) {
    const b = await this.manageableBranch(u, branchId);
    const rows = await this.prisma.kioskDevice.findMany({ where: { companyId: u.companyId, branchId: b.id }, orderBy: [{ revokedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }] });
    return rows.map((k) => ({ id: k.id, name: k.name, branchId: k.branchId, lastSeenAt: k.lastSeenAt, revokedAt: k.revokedAt, createdAt: k.createdAt }));
  }

  activeCount(companyId: string) {
    return this.prisma.kioskDevice.count({ where: { companyId, revokedAt: null } });
  }

  /**
   * Revokes a kiosk (its token stops working at once). When it was the company's last active kiosk, the
   * «require branch code» setting is switched off — otherwise no screen would show employees the code.
   */
  async revoke(u: AuthUser, id: string) {
    const k = await this.prisma.kioskDevice.findFirst({ where: { id, companyId: u.companyId, ...(u.role === 'BRANCH_MANAGER' ? { branchId: u.branchId ?? '__none__' } : {}) } });
    if (!k) throw notFound('Kiosk', 'جهاز الحضور غير موجود');
    if (k.revokedAt) return { ok: true, requireBranchCodeDisabled: false };
    const disabled = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'kiosks:' + u.companyId}))`;
      await tx.kioskDevice.update({ where: { id }, data: { revokedAt: new Date() } });
      if (await tx.kioskDevice.count({ where: { companyId: u.companyId, revokedAt: null } })) return false;
      const r = await tx.company.updateMany({ where: { id: u.companyId, requireBranchCode: true }, data: { requireBranchCode: false } });
      return r.count > 0;
    });
    await this.audit.log(u, 'REVOKE', 'KioskDevice', id, { name: k.name, branchId: k.branchId, requireBranchCodeDisabled: disabled });
    return { ok: true, requireBranchCodeDisabled: disabled };
  }

  // ---------- PIN ----------
  private async setPin(employeeId: string, pinRaw: unknown) {
    const pin = normalizePin(pinRaw);
    if (!pin) throw badRequest('PIN must be 4 to 6 digits', PIN_FORMAT_AR);
    // a new PIN also clears any lockout
    await this.prisma.employee.update({ where: { id: employeeId }, data: { kioskPinHash: await bcrypt.hash(pin, BCRYPT_ROUNDS), ...PIN_CLEAR } });
  }

  private myEmployeeId(u: AuthUser) {
    if (!u.employeeId) throw forbidden('This account is not linked to an employee', 'حسابك غير مرتبط بملف موظف');
    return u.employeeId;
  }

  async myPin(u: AuthUser) {
    const e = await this.prisma.employee.findFirst({ where: { id: this.myEmployeeId(u), companyId: u.companyId }, select: { kioskPinHash: true } });
    if (!e) throw notFound('Employee', 'ملف الموظف غير موجود');
    return { hasPin: !!e.kioskPinHash };
  }

  async setMyPin(u: AuthUser, pin: unknown) {
    const id = this.myEmployeeId(u);
    const e = await this.prisma.employee.findFirst({ where: { id, companyId: u.companyId }, select: { id: true } });
    if (!e) throw notFound('Employee', 'ملف الموظف غير موجود');
    await this.setPin(e.id, pin);
    await this.audit.log(u, 'SET_KIOSK_PIN', 'Employee', e.id, { by: 'self' });
    return { ok: true };
  }

  async employeePin(u: AuthUser, employeeId: string) {
    const e = await this.scope.employee(u, employeeId);
    const now = new Date();
    return { hasPin: !!e.kioskPinHash, lockedUntil: isPinLocked(e, now) ? e.kioskLockedUntil : null };
  }

  async setEmployeePin(u: AuthUser, employeeId: string, pin: unknown) {
    const e = await this.scope.employee(u, employeeId);
    await this.setPin(e.id, pin);
    await this.audit.log(u, 'SET_KIOSK_PIN', 'Employee', e.id, { by: 'hr' });
    await this.notify.toEmployees(u.companyId, [e.id], 'تم تعيين رمز الحضور السريع (PIN)', 'عيّنت الموارد البشرية رمزاً جديداً لجهاز الحضور في الفرع', '/me/more');
    return { ok: true };
  }

  // ---------- kiosk screen ----------
  async me(k: KioskContext) {
    const b = await this.prisma.branch.findUniqueOrThrow({ where: { id: k.branchId }, include: { company: { select: { nameAr: true } } } });
    const { code, expiresInSeconds } = currentBranchCode(b.codeSecret);
    return { branchName: b.nameAr, companyName: b.company.nameAr, branchCode: code, codeExpiresInSeconds: expiresInSeconds };
  }

  /**
   * Verifies employee number + PIN under a per-employee lock (so parallel guesses cannot slip past the lockout),
   * then punches. Unknown numbers, other branches, terminated staff, missing or wrong PINs all get the same 401
   * after one bcrypt comparison; only existing employees of this branch accumulate failures.
   */
  async punch(k: KioskContext, employeeNumber: unknown, pinRaw: unknown): Promise<KioskPunchResult> {
    const candidates = await this.prisma.employee.findMany({
      where: { companyId: k.companyId, branchId: k.branchId, status: { not: 'TERMINATED' } },
      select: { id: true, employeeNumber: true },
    });
    const match = typeof employeeNumber === 'string' ? matchEmployeeNumber(employeeNumber, candidates) : null;
    const pin = normalizePin(pinRaw) ?? '';
    if (!match) {
      await bcrypt.compare(pin, this.dummyHash);
      throw invalidCredentials();
    }

    const verdict = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'kiosk-pin:' + match.id}))`;
        const e = await tx.employee.findUniqueOrThrow({ where: { id: match.id } });
        const now = new Date();
        if (isPinLocked(e, now)) return { kind: 'locked' as const };
        const ok = await bcrypt.compare(pin, e.kioskPinHash ?? this.dummyHash);
        if (ok && e.kioskPinHash) {
          if (e.kioskFailCount || e.kioskFirstFailAt || e.kioskLockedUntil) await tx.employee.update({ where: { id: e.id }, data: PIN_CLEAR });
          return { kind: 'ok' as const, employee: e };
        }
        const next = afterPinFailure(e, now);
        await tx.employee.update({ where: { id: e.id }, data: next });
        return { kind: 'fail' as const, employee: e, lockedNow: !!next.kioskLockedUntil };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );

    if (verdict.kind === 'locked') throw lockedError();
    if (verdict.kind === 'fail') {
      if (verdict.lockedNow) await this.onLocked(k, verdict.employee);
      throw invalidCredentials();
    }
    return this.record(k, verdict.employee);
  }

  private async onLocked(k: KioskContext, e: { id: string; firstNameAr: string; lastNameAr: string; branchId: string | null }) {
    const actor = { id: null as unknown as string, name: `جهاز الحضور: ${k.name}`, companyId: k.companyId };
    await this.audit.log(actor, 'KIOSK_PIN_LOCKED', 'Employee', e.id, { kioskId: k.id });
    const body = `${fullName(e)} — ${KIOSK_MAX_FAILS} محاولات خاطئة على «${k.name}». أُوقف الرمز 15 دقيقة.`;
    await this.notify.toApprovers(k.companyId, e.branchId, 'تم إيقاف رمز الحضور السريع مؤقتاً', body, `/employees/${e.id}`);
    await this.notify.toEmployees(k.companyId, [e.id], 'تم إيقاف رمز الحضور السريع مؤقتاً', `${KIOSK_MAX_FAILS} محاولات خاطئة على جهاز الحضور في الفرع. إن لم تكن أنت فأبلغ الموارد البشرية.`, '/me/more');
  }

  /**
   * The punch itself — same attendance computation as the ESS check-in/out (late minutes, overnight shifts), under the
   * employee's lock so two taps at once never create two check-ins. Device binding and the geofence do not apply: the
   * paired kiosk in the branch is the trusted device.
   */
  private record(k: KioskContext, e: { id: string; branchId: string | null; firstNameAr: string; lastNameAr: string }): Promise<KioskPunchResult> {
    const actor = { id: null as unknown as string, name: `جهاز الحضور: ${k.name}`, companyId: k.companyId };
    const employeeName = fullName(e);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'kiosk-punch:' + e.id}))`;
        const now = new Date();
        const today = todayStr(now);
        const d = day(today);
        const todayRec = await tx.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: e.id, date: d } }, include: { shift: true } });
        const previousOpen = todayRec?.checkIn
          ? null
          : await tx.attendanceRecord.findFirst({
              where: { employeeId: e.id, date: { lt: d }, checkIn: { gte: new Date(now.getTime() - OVERNIGHT_WINDOW_MS), lte: now }, checkOut: null },
              orderBy: { checkIn: 'desc' },
              include: { shift: true },
            });
        const decision = kioskAction(todayRec, previousOpen, now);
        if ('error' in decision) {
          if (decision.error === 'ALREADY_OUT') throw conflict('Already checked out today', 'تم تسجيل الانصراف مسبقاً اليوم');
          throw conflict('Checked in a moment ago', 'تم تسجيل حضورك قبل قليل');
        }

        if (decision.action === 'IN') {
          const shift = await this.att.shiftFor(e, today);
          const m = this.att.compute(shift, now, null);
          const data = {
            shiftId: shift?.id ?? null,
            checkIn: now,
            checkInReceivedAt: now,
            lateMinutes: m.lateMinutes,
            workedMinutes: 0,
            overtimeMinutes: 0,
            status: m.status,
            source: 'KIOSK',
            flags: withFlags(todayRec?.flags ?? [], ['KIOSK']),
          };
          const rec = await tx.attendanceRecord.upsert({
            where: { employeeId_date: { employeeId: e.id, date: d } },
            create: { companyId: k.companyId, employeeId: e.id, date: d, ...data },
            update: data,
          });
          return { result: { action: 'IN' as const, employeeName, time: now, lateMinutes: m.lateMinutes }, recordId: rec.id, log: { lateMinutes: m.lateMinutes } };
        }

        const rec = decision.target === 'today' ? todayRec! : previousOpen!;
        const shift = rec.shift ?? (await this.att.shiftFor(e, rec.date));
        const m = this.att.compute(shift, rec.checkIn, now);
        await tx.attendanceRecord.update({
          where: { id: rec.id },
          data: {
            checkOut: now,
            checkOutReceivedAt: now,
            workedMinutes: m.workedMinutes,
            lateMinutes: m.lateMinutes,
            earlyLeaveMinutes: m.earlyLeaveMinutes,
            overtimeMinutes: m.overtimeMinutes,
            status: m.status,
            flags: withFlags(rec.flags, ['KIOSK']),
          },
        });
        return { result: { action: 'OUT' as const, employeeName, time: now, lateMinutes: m.lateMinutes }, recordId: rec.id, log: { workedMinutes: m.workedMinutes } };
      },
      { maxWait: 10_000, timeout: 15_000 },
    ).then(async ({ result, recordId, log }) => {
      await this.audit.log(actor, result.action === 'IN' ? 'CHECK_IN' : 'CHECK_OUT', 'AttendanceRecord', recordId, { kioskId: k.id, employeeId: e.id, ...log });
      return result;
    });
  }
}
