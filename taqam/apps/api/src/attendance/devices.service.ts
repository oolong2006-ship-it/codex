import { Injectable } from '@nestjs/common';
import { EmployeeDevice, EmployeeDeviceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../shared/audit.service';
import { ScopeService } from '../shared/scope.service';
import { NotifyService } from '../shared/notifications.service';
import { AuthUser } from '../common/types';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { fullName } from '../employees/employee.view';

export const DEVICE_NOT_REGISTERED_AR = 'هذا الجهاز غير مسجل لحسابك. اطلب من الموارد البشرية اعتماد الجهاز الجديد';
const DEVICE_STATUSES: EmployeeDeviceStatus[] = ['ACTIVE', 'PENDING', 'REJECTED', 'REVOKED'];
/** Random ids from the ESS app (UUID or similar); anything else is not a device id. */
const DEVICE_ID = /^[A-Za-z0-9._:-]{8,128}$/;

const deviceInclude = {
  employee: { select: { id: true, firstNameAr: true, lastNameAr: true, employeeNumber: true, branchId: true, branch: { select: { nameAr: true } } } },
} satisfies Prisma.EmployeeDeviceInclude;
type DeviceRow = Prisma.EmployeeDeviceGetPayload<{ include: typeof deviceInclude }>;

export function deviceView(d: DeviceRow) {
  return {
    id: d.id,
    employeeId: d.employeeId,
    employeeName: fullName(d.employee),
    employeeNumber: d.employee.employeeNumber,
    branchId: d.employee.branchId,
    branchName: d.employee.branch?.nameAr ?? null,
    /** only the last 6 characters leave the server (enough for HR to tell devices apart) */
    deviceIdSuffix: d.deviceId.slice(-6),
    status: d.status,
    userAgent: d.userAgent,
    createdAt: d.createdAt,
    decidedAt: d.decidedAt,
    approvedById: d.approvedById,
    lastUsedAt: d.lastUsedAt,
  };
}

/** Outcome of the ESS device check: the bound device and the record flags it contributes. */
export interface DeviceCheck {
  device: EmployeeDevice | null;
  flags: string[];
}

/** ESS device binding (spec §6): first punch binds; a different device needs HR approval. No photos, ever. */
@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly notify: NotifyService,
  ) {}

  /** Serializes every device decision for one employee (punch binding, approve, reject, reset). */
  private lock(tx: Prisma.TransactionClient, employeeId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${employeeId}))`;
  }

  /**
   * Checks the punching device. Binds it when the employee has no active device (first punch after deploy
   * or after an HR reset). A different device → 403 and exactly one PENDING request for the employee.
   */
  async check(
    companyId: string,
    employee: { id: string; branchId: string | null; firstNameAr: string; lastNameAr: string },
    deviceIdRaw: string | undefined,
    userAgent?: string,
  ): Promise<DeviceCheck> {
    const employeeId = employee.id;
    const deviceId = String(deviceIdRaw ?? '').trim();
    if (!DEVICE_ID.test(deviceId)) {
      throw badRequest('X-Device-Id header is required', 'تعذّر التعرّف على هذا الجهاز. حدّث الصفحة ثم حاول مرة أخرى');
    }
    const ua = userAgent ? userAgent.slice(0, 300) : null;
    const outcome = await this.prisma.$transaction(async (tx) => {
      // two first punches from two phones must not both bind
      await this.lock(tx, employeeId);
      const devices = await tx.employeeDevice.findMany({ where: { employeeId } });
      const mine = devices.find((d) => d.deviceId === deviceId);
      if (mine?.status === 'ACTIVE') return { ok: true as const, device: mine };
      if (!devices.some((d) => d.status === 'ACTIVE')) {
        await tx.employeeDevice.deleteMany({ where: { employeeId, status: 'PENDING', deviceId: { not: deviceId } } });
        const bound = await tx.employeeDevice.upsert({
          where: { employeeId_deviceId: { employeeId, deviceId } },
          create: { companyId, employeeId, deviceId, status: 'ACTIVE', userAgent: ua },
          update: { status: 'ACTIVE', userAgent: ua, approvedById: null, decidedAt: null },
        });
        return { ok: true as const, device: bound };
      }
      // keep one PENDING request per employee: the latest device asking replaces older requests
      await tx.employeeDevice.deleteMany({ where: { employeeId, status: 'PENDING', deviceId: { not: deviceId } } });
      let created = false;
      if (!mine) {
        await tx.employeeDevice.create({ data: { companyId, employeeId, deviceId, status: 'PENDING', userAgent: ua } });
        created = true;
      } else if (mine.status === 'REVOKED') {
        await tx.employeeDevice.update({ where: { id: mine.id }, data: { status: 'PENDING', userAgent: ua, approvedById: null, decidedAt: null } });
        created = true;
      }
      return { ok: false as const, created, status: mine?.status === 'REJECTED' ? ('REJECTED' as const) : ('PENDING' as const) };
    });
    if (!outcome.ok) {
      if (outcome.created) {
        await this.notify.toApprovers(companyId, employee.branchId, 'طلب اعتماد جهاز جديد', `${fullName(employee)} — يحاول البصمة من جهاز غير مسجل`, '/attendance/devices');
      }
      throw forbidden('This device is not registered for your account', DEVICE_NOT_REGISTERED_AR, { code: 'DEVICE_NOT_REGISTERED', deviceStatus: outcome.status });
    }
    const d = outcome.device;
    return { device: d, flags: d.approvedById && !d.lastUsedAt ? ['NEW_DEVICE_APPROVED'] : [] };
  }

  /** Records a successful punch from this device (its NEW_DEVICE_APPROVED flag is then spent). */
  async markUsed(device: EmployeeDevice | null) {
    if (device) await this.prisma.employeeDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
  }

  // ---------- HR ----------
  async list(u: AuthUser, status?: string) {
    const s = status && DEVICE_STATUSES.includes(status as EmployeeDeviceStatus) ? (status as EmployeeDeviceStatus) : undefined;
    if (status && !s) throw badRequest('Invalid status', 'حالة الجهاز غير صالحة');
    const rows = await this.prisma.employeeDevice.findMany({
      where: { companyId: u.companyId, ...(s ? { status: s } : {}), employee: this.scope.employeeWhere(u) },
      include: deviceInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(deviceView);
  }

  /** A branch manager never decides their own device (same rule as leaves and requests). */
  private assertNotOwn(u: AuthUser, employeeId: string) {
    if (u.role === 'BRANCH_MANAGER' && u.employeeId && u.employeeId === employeeId) {
      throw badRequest('You cannot approve your own request', 'لا يمكنك اعتماد طلبك بنفسك');
    }
  }

  private async visibleDevice(u: AuthUser, id: string) {
    const d = await this.prisma.employeeDevice.findFirst({ where: { id, companyId: u.companyId, employee: this.scope.employeeWhere(u) } });
    if (!d) throw notFound('Device', 'الجهاز غير موجود');
    this.assertNotOwn(u, d.employeeId);
    return d;
  }

  /**
   * Decides a PENDING request atomically: under the employee's device lock, only a row still PENDING is
   * updated (0 rows → 409), so two decisions — or a decision racing a punch from another device — never both win.
   */
  private async decide(u: AuthUser, id: string, approve: boolean) {
    const d = await this.visibleDevice(u, id);
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, d.employeeId);
      const r = await tx.employeeDevice.updateMany({
        where: { id, status: 'PENDING' },
        data: approve ? { status: 'ACTIVE', approvedById: u.id, decidedAt: now, lastUsedAt: null } : { status: 'REJECTED', approvedById: null, decidedAt: now },
      });
      if (!r.count) return null;
      if (approve) {
        await tx.employeeDevice.updateMany({ where: { employeeId: d.employeeId, status: 'ACTIVE', id: { not: id } }, data: { status: 'REVOKED', decidedAt: now } });
      }
      return tx.employeeDevice.findUniqueOrThrow({ where: { id }, include: deviceInclude });
    });
    if (!updated) throw conflict('Device request already decided', 'تم البت في طلب هذا الجهاز مسبقاً');
    await this.audit.log(u, approve ? 'APPROVE' : 'REJECT', 'EmployeeDevice', id, { employeeId: d.employeeId });
    return deviceView(updated);
  }

  /** Approves a new device: it becomes the only active one (the old binding is revoked). */
  approve(u: AuthUser, id: string) {
    return this.decide(u, id, true);
  }

  reject(u: AuthUser, id: string) {
    return this.decide(u, id, false);
  }

  /** Clears every device of an employee: the next punch binds again (lost/replaced phone). */
  async reset(u: AuthUser, employeeId: string) {
    const e = await this.scope.employee(u, employeeId);
    this.assertNotOwn(u, e.id);
    const count = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, e.id);
      return (await tx.employeeDevice.deleteMany({ where: { employeeId: e.id, companyId: u.companyId } })).count;
    });
    await this.audit.log(u, 'RESET_DEVICES', 'Employee', e.id, { removed: count });
    return { removed: count };
  }
}
