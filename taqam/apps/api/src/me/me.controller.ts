import { Body, Controller, Get, Headers, HttpCode, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsISO8601, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { haversineMeters, isWithinGeofence } from '@taqam/core';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../shared/audit.service';
import { LeaveCalcService } from '../shared/leave-calc.service';
import { AttendanceCalcService } from '../shared/attendance-calc.service';
import { ALL_ROLES, CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { day, periodRange, todayStr } from '../common/dates';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { EmployeesModule } from '../employees/employees.module';
import { EmployeesService } from '../employees/employees.service';
import { LeavesModule } from '../leaves/leaves.module';
import { leaveInclude, leaveView, LeavesService } from '../leaves/leaves.service';
import { MyLeaveDto } from '../leaves/leaves.dto';
import { RequestsModule } from '../requests/requests.module';
import { RequestsService } from '../requests/requests.service';
import { MyRequestDto } from '../requests/requests.dto';
import { payslipInclude, payslipView } from '../payroll/payroll.service';
import { announcementsWhere } from '../comms/comms.controller';
import { fullName } from '../employees/employee.view';
import { AttendanceModule } from '../attendance/attendance.module';
import { DeviceCheck, DevicesService } from '../attendance/devices.service';
import { checkBranchCode } from '../attendance/branch-code';

/** How far back a self check-out may reach to close an open (overnight) record. */
const OVERNIGHT_WINDOW_MS = 16 * 3600 * 1000;
/** Offline punches replayed with `capturedAt` are accepted from the last 12 hours (2 minutes of clock skew allowed). */
const OFFLINE_MAX_AGE_MS = 12 * 3600 * 1000;
const OFFLINE_MAX_SKEW_MS = 2 * 60 * 1000;
const OFFLINE_WINDOW_AR = 'وقت التسجيل خارج المدة المسموحة (12 ساعة)';

const withFlags = (existing: string[], add: string[]) => [...new Set([...existing, ...add])];

export class LocationDto {
  @ApiProperty({ example: 24.6911 }) @IsNumber() @Min(-90) @Max(90) lat: number;
  @ApiProperty({ example: 46.6853 }) @IsNumber() @Min(-180) @Max(180) lng: number;
}

/** ESS check-in/out body. No photo field — the owner decided punches never capture images of people. */
export class PunchDto extends LocationDto {
  @ApiPropertyOptional({ description: 'Rotating 6-digit code shown on the branch kiosk screen (when the company requires it)', example: '482913' })
  @IsOptional() @IsString() @MaxLength(12) branchCode?: string;
  @ApiPropertyOptional({ description: 'Offline replay: when the punch was captured (ISO). Accepted within the last 12 hours.' })
  @IsOptional() @IsISO8601({ strict: true }) capturedAt?: string;
}

interface PunchContext {
  /** punch time: capturedAt for an offline replay (capped at now), otherwise now */
  at: Date;
  /** capturedAt exactly as sent (may be up to 2 minutes ahead of the server clock) */
  captured: Date | null;
  offline: boolean;
  /** server receive time */
  receivedAt: Date;
  device: DeviceCheck;
  /** OFFLINE / NO_BRANCH_CODE / NEW_DEVICE_APPROVED added by the checks */
  flags: string[];
}

/**
 * The same offline punch replayed (flaky network): identical time, or — for a capturedAt that was a little ahead
 * of the server clock and got capped at "now" — an OFFLINE record within the skew allowance before it.
 */
function samePunch(existing: Date, existingFlags: string[], ctx: PunchContext): boolean {
  if (!ctx.offline || !ctx.captured) return false;
  if (existing.getTime() === ctx.at.getTime()) return true;
  const ahead = ctx.captured.getTime() - existing.getTime();
  return existingFlags.includes('OFFLINE') && ahead > 0 && ahead <= OFFLINE_MAX_SKEW_MS;
}

@ApiTags('self-service (me)')
@ApiBearerAuth()
@Roles(...ALL_ROLES)
@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly leaveCalc: LeaveCalcService,
    private readonly att: AttendanceCalcService,
    private readonly employees: EmployeesService,
    private readonly leaves: LeavesService,
    private readonly requests: RequestsService,
    private readonly devices: DevicesService,
  ) {}

  private async me(u: AuthUser) {
    if (!u.employeeId) throw forbidden('This account is not linked to an employee', 'حسابك غير مرتبط بملف موظف');
    const e = await this.prisma.employee.findFirst({ where: { id: u.employeeId, companyId: u.companyId }, include: { branch: true } });
    if (!e) throw notFound('Employee', 'ملف الموظف غير موجود');
    return e;
  }

  @Get('profile')
  async profile(@CurrentUser() u: AuthUser) {
    const e = await this.me(u);
    return this.employees.detail({ ...u, role: 'EMPLOYEE' }, e.id);
  }

  @Get('home')
  async home(@CurrentUser() u: AuthUser) {
    const e = await this.me(u);
    const today = todayStr();
    const [shift, board, leaveBalance, pendingLeaves, pendingReqs, lastSlip, announcements, policy] = await Promise.all([
      this.att.shiftFor(e, today),
      this.att.board({ id: e.id, companyId: u.companyId }, today),
      this.leaveCalc.annualBalance(e),
      this.prisma.leaveRequest.count({ where: { employeeId: e.id, status: 'PENDING' } }),
      this.prisma.employeeRequest.count({ where: { employeeId: e.id, status: 'PENDING' } }),
      this.prisma.payslip.findFirst({
        where: { employeeId: e.id, payrollRun: { status: { in: ['APPROVED', 'PAID'] } } },
        orderBy: { period: 'desc' },
        select: { id: true, period: true, net: true, gross: true },
      }),
      this.prisma.announcement.findMany({
        where: announcementsWhere({ ...u, branchId: e.branchId }),
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.policy(u.companyId),
    ]);
    const row = board[0];
    return {
      employee: { id: e.id, name: fullName(e), jobTitle: e.jobTitle, branchName: e.branch?.nameAr ?? null, avatarColor: e.avatarColor, employeeNumber: e.employeeNumber },
      today: {
        date: today,
        shift: shift ? { id: shift.id, name: shift.name, startTime: shift.startTime, endTime: shift.endTime } : null,
        checkIn: row?.checkIn ?? null,
        checkOut: row?.checkOut ?? null,
        status: row?.status ?? 'OFF',
        lateMinutes: row?.lateMinutes ?? 0,
        workedMinutes: row?.workedMinutes ?? 0,
        flags: row?.flags ?? [],
      },
      /** ESS punch rules: branch code input shown when required; device id always sent */
      attendancePolicy: policy,
      leaveBalance,
      pendingRequests: pendingLeaves + pendingReqs,
      pendingLeaves,
      lastPayslip: lastSlip,
      announcements,
      branch: e.branch ? { id: e.branch.id, name: e.branch.nameAr, lat: e.branch.lat, lng: e.branch.lng, radiusMeters: e.branch.radiusMeters } : null,
    };
  }

  private geofence(e: Awaited<ReturnType<MeController['me']>>, dto: LocationDto) {
    if (!e.branch) throw badRequest('No branch assigned', 'لا يوجد فرع مرتبط بملفك');
    const center = { lat: e.branch.lat, lng: e.branch.lng };
    if (!isWithinGeofence(dto, center, e.branch.radiusMeters)) {
      const distanceMeters = Math.round(haversineMeters(dto, center));
      throw badRequest('You are outside the branch geofence', 'أنت خارج نطاق الفرع', { distanceMeters, radiusMeters: e.branch.radiusMeters });
    }
  }

  private async policy(companyId: string) {
    return this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { requireBranchCode: true, deviceBinding: true } });
  }

  /**
   * Anti-tamper checks shared by check-in/out (spec §6), in this order: offline window, geofence, rotating
   * branch code, then device binding — so a punch that fails any other check never binds a device or files a
   * request. Never asks for a photo.
   */
  private async guardPunch(u: AuthUser, e: Awaited<ReturnType<MeController['me']>>, dto: PunchDto, deviceId?: string, userAgent?: string): Promise<PunchContext> {
    const now = new Date();
    let at = now;
    let captured: Date | null = null;
    const offline = dto.capturedAt !== undefined;
    const flags: string[] = [];
    if (offline) {
      captured = new Date(dto.capturedAt!);
      if (Number.isNaN(captured.getTime()) || captured.getTime() < now.getTime() - OFFLINE_MAX_AGE_MS || captured.getTime() > now.getTime() + OFFLINE_MAX_SKEW_MS) {
        throw badRequest('capturedAt is outside the allowed window (12 hours)', OFFLINE_WINDOW_AR);
      }
      at = captured > now ? now : captured; // clock skew: never record a punch in the future
      flags.push('OFFLINE');
    }
    this.geofence(e, dto);
    const policy = await this.policy(u.companyId);
    if (policy.requireBranchCode) {
      const code = dto.branchCode?.trim();
      if (!offline) {
        if (!code) throw badRequest('Branch code is required', 'أدخل رمز الفرع الظاهر على شاشة الحضور');
        if (!checkBranchCode(e.branch!.codeSecret, code, now)) throw badRequest('Invalid or expired branch code', 'رمز الفرع غير صحيح أو منتهي');
      } else if (!code || !checkBranchCode(e.branch!.codeSecret, code, captured!)) {
        // offline: the code the kiosk showed when the punch was captured; accepted without one, but flagged
        flags.push('NO_BRANCH_CODE');
      }
    }
    const device: DeviceCheck = policy.deviceBinding ? await this.devices.check(u.companyId, e, deviceId, userAgent) : { device: null, flags: [] };
    return { at, captured, offline, receivedAt: now, device, flags: [...flags, ...device.flags] };
  }

  @HttpCode(200)
  @ApiHeader({ name: 'X-Device-Id', required: false, description: 'Random ESS device id (required while company device binding is on)' })
  @Post('attendance/check-in')
  async checkIn(@CurrentUser() u: AuthUser, @Body() dto: PunchDto, @Headers('x-device-id') deviceId?: string, @Headers('user-agent') userAgent?: string) {
    const e = await this.me(u);
    const ctx = await this.guardPunch(u, e, dto, deviceId, userAgent);
    const today = todayStr(ctx.at);
    const d = day(today);
    const shift = await this.att.shiftFor(e, today);
    const view = (rec: { lateMinutes: number }) => ({
      ...rec,
      status: rec.lateMinutes > 0 ? 'LATE' : 'PRESENT',
      shift: shift ? { name: shift.name, startTime: shift.startTime, endTime: shift.endTime } : null,
    });
    const existing = await this.prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: e.id, date: d } } });
    if (existing?.checkIn) {
      // flaky network: the same offline replay sent twice returns the record it already created
      if (samePunch(existing.checkIn, existing.flags, ctx)) return view(existing);
      throw conflict('Already checked in today', 'تم تسجيل الحضور مسبقاً اليوم');
    }
    const m = this.att.compute(shift, ctx.at, null);
    const data = {
      shiftId: shift?.id ?? null,
      checkIn: ctx.at,
      checkInReceivedAt: ctx.receivedAt,
      checkInLat: dto.lat,
      checkInLng: dto.lng,
      lateMinutes: m.lateMinutes,
      workedMinutes: 0,
      overtimeMinutes: 0,
      status: m.status,
      source: 'SELF',
      flags: withFlags(existing?.flags ?? [], ctx.flags),
    };
    const rec = await this.prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: e.id, date: d } },
      create: { companyId: u.companyId, employeeId: e.id, date: d, ...data },
      update: data,
    });
    await this.devices.markUsed(ctx.device.device);
    await this.audit.log(u, 'CHECK_IN', 'AttendanceRecord', rec.id, { lat: dto.lat, lng: dto.lng, capturedAt: dto.capturedAt, flags: data.flags, lateMinutes: m.lateMinutes });
    return view(rec);
  }

  @HttpCode(200)
  @ApiHeader({ name: 'X-Device-Id', required: false, description: 'Random ESS device id (required while company device binding is on)' })
  @Post('attendance/check-out')
  async checkOut(@CurrentUser() u: AuthUser, @Body() dto: PunchDto, @Headers('x-device-id') deviceId?: string, @Headers('user-agent') userAgent?: string) {
    const e = await this.me(u);
    const ctx = await this.guardPunch(u, e, dto, deviceId, userAgent);
    const at = ctx.at;
    const d = day(todayStr(at));
    let rec = await this.prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: e.id, date: d } }, include: { shift: true } });
    if (!rec) {
      // Overnight shift: no record that day → close the latest still-open record checked in within the 16 hours before.
      rec = await this.prisma.attendanceRecord.findFirst({
        where: { employeeId: e.id, checkIn: { gte: new Date(at.getTime() - OVERNIGHT_WINDOW_MS), lte: at }, checkOut: null },
        orderBy: { checkIn: 'desc' },
        include: { shift: true },
      });
    }
    if (!rec?.checkIn) throw badRequest('You have not checked in today', 'لم يتم تسجيل الحضور اليوم');
    if (rec.checkOut) {
      const { shift: _s, ...existing } = rec;
      if (samePunch(rec.checkOut, rec.flags, ctx)) return existing;
      throw conflict('Already checked out today', 'تم تسجيل الانصراف مسبقاً اليوم');
    }
    if (at <= rec.checkIn) throw badRequest('Check-out must be after check-in', 'وقت الانصراف يجب أن يكون بعد وقت الحضور');
    const shift = rec.shift ?? (await this.att.shiftFor(e, rec.date));
    const m = this.att.compute(shift, rec.checkIn, at);
    const flags = withFlags(rec.flags, ctx.flags);
    const updated = await this.prisma.attendanceRecord.update({
      where: { id: rec.id },
      data: {
        checkOut: at,
        checkOutReceivedAt: ctx.receivedAt,
        checkOutLat: dto.lat,
        checkOutLng: dto.lng,
        workedMinutes: m.workedMinutes,
        lateMinutes: m.lateMinutes,
        earlyLeaveMinutes: m.earlyLeaveMinutes,
        overtimeMinutes: m.overtimeMinutes,
        status: m.status,
        flags,
      },
    });
    await this.devices.markUsed(ctx.device.device);
    await this.audit.log(u, 'CHECK_OUT', 'AttendanceRecord', rec.id, { lat: dto.lat, lng: dto.lng, capturedAt: dto.capturedAt, flags, workedMinutes: m.workedMinutes });
    return updated;
  }

  @Get('attendance')
  async attendance(@CurrentUser() u: AuthUser, @Query('month') month?: string) {
    const e = await this.me(u);
    const period = month && /^\d{4}-\d{2}$/.test(month) ? month : todayStr().slice(0, 7);
    const { start, end } = periodRange(period);
    const recs = await this.prisma.attendanceRecord.findMany({
      where: { employeeId: e.id, date: { gte: start, lte: end } },
      include: { shift: { select: { name: true } } },
      orderBy: { date: 'desc' },
    });
    return recs.map((r) => ({
      id: r.id,
      date: r.date,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      workedMinutes: r.workedMinutes,
      lateMinutes: r.lateMinutes,
      overtimeMinutes: r.overtimeMinutes,
      status: r.status,
      flags: r.flags,
      shiftName: r.shift?.name ?? null,
    }));
  }

  @Get('leaves')
  async myLeaves(@CurrentUser() u: AuthUser) {
    const e = await this.me(u);
    const [data, balances] = await Promise.all([
      this.prisma.leaveRequest.findMany({ where: { employeeId: e.id }, include: leaveInclude, orderBy: { createdAt: 'desc' } }),
      this.leaveCalc.balances(e),
    ]);
    return { data: data.map(leaveView), balances };
  }

  @Post('leaves')
  async createLeave(@CurrentUser() u: AuthUser, @Body() dto: MyLeaveDto) {
    const e = await this.me(u);
    return this.leaves.createFor(u, e, dto);
  }

  @HttpCode(200)
  @Post('leaves/:id/cancel')
  cancelLeave(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.leaves.cancelOwn(u, id);
  }

  @Get('payslips')
  async payslips(@CurrentUser() u: AuthUser) {
    const e = await this.me(u);
    const slips = await this.prisma.payslip.findMany({
      where: { employeeId: e.id, payrollRun: { status: { in: ['APPROVED', 'PAID'] } } },
      include: { payrollRun: { select: { status: true, paidAt: true } } },
      orderBy: { period: 'desc' },
    });
    return slips.map((s) => ({ id: s.id, period: s.period, net: s.net, gross: s.gross, totalDeductions: s.totalDeductions, status: s.payrollRun.status, paidAt: s.payrollRun.paidAt }));
  }

  @Get('payslips/:id')
  async payslip(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const e = await this.me(u);
    const p = await this.prisma.payslip.findFirst({
      where: { id, employeeId: e.id, payrollRun: { status: { in: ['APPROVED', 'PAID'] } } },
      include: payslipInclude,
    });
    if (!p) throw notFound('Payslip', 'قسيمة الراتب غير موجودة');
    return payslipView(p);
  }

  @Get('requests')
  async myRequests(@CurrentUser() u: AuthUser) {
    await this.me(u);
    return this.requests.listOwn(u);
  }

  @Post('requests')
  async createRequest(@CurrentUser() u: AuthUser, @Body() dto: MyRequestDto) {
    const e = await this.me(u);
    return this.requests.createOwn(u, e, dto);
  }
}

@Module({ imports: [EmployeesModule, LeavesModule, RequestsModule, AttendanceModule], controllers: [MeController] })
export class MeModule {}
