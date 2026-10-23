import { Body, Controller, Get, HttpCode, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';
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

export class LocationDto {
  @ApiProperty({ example: 24.6911 }) @IsNumber() @Min(-90) @Max(90) lat: number;
  @ApiProperty({ example: 46.6853 }) @IsNumber() @Min(-180) @Max(180) lng: number;
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
    const [shift, board, leaveBalance, pendingLeaves, pendingReqs, lastSlip, announcements] = await Promise.all([
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
      },
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

  @HttpCode(200)
  @Post('attendance/check-in')
  async checkIn(@CurrentUser() u: AuthUser, @Body() dto: LocationDto) {
    const e = await this.me(u);
    this.geofence(e, dto);
    const today = todayStr();
    const d = day(today);
    const existing = await this.prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: e.id, date: d } } });
    if (existing?.checkIn) throw conflict('Already checked in today', 'تم تسجيل الحضور مسبقاً اليوم');
    const shift = await this.att.shiftFor(e, today);
    const now = new Date();
    const m = this.att.compute(shift, now, null);
    const data = {
      shiftId: shift?.id ?? null,
      checkIn: now,
      checkInLat: dto.lat,
      checkInLng: dto.lng,
      lateMinutes: m.lateMinutes,
      workedMinutes: 0,
      overtimeMinutes: 0,
      status: m.status,
      source: 'SELF',
    };
    const rec = await this.prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: e.id, date: d } },
      create: { companyId: u.companyId, employeeId: e.id, date: d, ...data },
      update: data,
    });
    await this.audit.log(u, 'CHECK_IN', 'AttendanceRecord', rec.id, { ...dto, lateMinutes: m.lateMinutes });
    return { ...rec, status: m.lateMinutes > 0 ? 'LATE' : 'PRESENT', shift: shift ? { name: shift.name, startTime: shift.startTime, endTime: shift.endTime } : null };
  }

  @HttpCode(200)
  @Post('attendance/check-out')
  async checkOut(@CurrentUser() u: AuthUser, @Body() dto: LocationDto) {
    const e = await this.me(u);
    this.geofence(e, dto);
    const today = todayStr();
    const d = day(today);
    const rec = await this.prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: e.id, date: d } }, include: { shift: true } });
    if (!rec?.checkIn) throw badRequest('You have not checked in today', 'لم يتم تسجيل الحضور اليوم');
    if (rec.checkOut) throw conflict('Already checked out today', 'تم تسجيل الانصراف مسبقاً اليوم');
    const shift = rec.shift ?? (await this.att.shiftFor(e, today));
    const now = new Date();
    const m = this.att.compute(shift, rec.checkIn, now);
    const updated = await this.prisma.attendanceRecord.update({
      where: { id: rec.id },
      data: {
        checkOut: now,
        checkOutLat: dto.lat,
        checkOutLng: dto.lng,
        workedMinutes: m.workedMinutes,
        lateMinutes: m.lateMinutes,
        earlyLeaveMinutes: m.earlyLeaveMinutes,
        overtimeMinutes: m.overtimeMinutes,
        status: m.status,
      },
    });
    await this.audit.log(u, 'CHECK_OUT', 'AttendanceRecord', rec.id, { ...dto, workedMinutes: m.workedMinutes });
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

@Module({ imports: [EmployeesModule, LeavesModule, RequestsModule], controllers: [MeController] })
export class MeModule {}
