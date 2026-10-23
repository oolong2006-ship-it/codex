import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../shared/audit.service';
import { ScopeService } from '../shared/scope.service';
import { AttendanceCalcService } from '../shared/attendance-calc.service';
import { AuthUser } from '../common/types';
import { addDays, day, dayStr, parseTime, todayStr, weekday } from '../common/dates';
import { badRequest, notFound } from '../common/errors';
import { fullName } from '../employees/employee.view';
import { ManualAttendanceDto, RosterDto, ShiftDto, UpdateAttendanceDto, UpdateShiftDto } from './attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly calc: AttendanceCalcService,
  ) {}

  // ---------- Shifts ----------
  shifts(u: AuthUser, branchId?: string) {
    const b = this.scope.branchFilter(u, branchId);
    return this.prisma.shift.findMany({
      where: { companyId: u.companyId, ...(b ? { branchId: b } : {}) },
      orderBy: [{ branchId: 'asc' }, { startTime: 'asc' }],
    });
  }

  async createShift(u: AuthUser, dto: ShiftDto) {
    await this.scope.branch(u, dto.branchId);
    this.scope.assertBranch(u, dto.branchId);
    const s = await this.prisma.shift.create({
      data: { ...dto, breakMinutes: dto.breakMinutes ?? 60, graceMinutes: dto.graceMinutes ?? 15, companyId: u.companyId },
    });
    await this.audit.log(u, 'CREATE', 'Shift', s.id, dto);
    return s;
  }

  private async getShift(u: AuthUser, id: string) {
    const s = await this.prisma.shift.findFirst({ where: { id, companyId: u.companyId } });
    if (!s) throw notFound('Shift', 'الوردية غير موجودة');
    this.scope.assertBranch(u, s.branchId);
    return s;
  }

  async updateShift(u: AuthUser, id: string, dto: UpdateShiftDto) {
    await this.getShift(u, id);
    if (dto.branchId) {
      await this.scope.branch(u, dto.branchId);
      this.scope.assertBranch(u, dto.branchId);
    }
    const s = await this.prisma.shift.update({ where: { id }, data: dto });
    await this.audit.log(u, 'UPDATE', 'Shift', id, dto);
    return s;
  }

  async deleteShift(u: AuthUser, id: string) {
    await this.getShift(u, id);
    await this.prisma.shift.delete({ where: { id } });
    await this.audit.log(u, 'DELETE', 'Shift', id);
    return { ok: true };
  }

  // ---------- Roster ----------
  async roster(u: AuthUser, branchId?: string, weekStart?: string) {
    const b = this.scope.branchFilter(u, branchId);
    const start = weekStart ? day(weekStart) : day(addDays(todayStr(), -weekday(todayStr())));
    const end = addDays(start, 6);
    const employees = await this.prisma.employee.findMany({
      where: this.scope.employeeWhere(u, { status: { not: 'TERMINATED' }, ...(b ? { branchId: b } : {}) }),
      select: { id: true, firstNameAr: true, lastNameAr: true, jobTitle: true, branchId: true },
      orderBy: { employeeNumber: 'asc' },
    });
    const assignments = await this.prisma.shiftAssignment.findMany({
      where: { companyId: u.companyId, employeeId: { in: employees.map((e) => e.id) }, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });
    return {
      weekStart: start,
      employees: employees.map((e) => ({ id: e.id, name: fullName(e), jobTitle: e.jobTitle, branchId: e.branchId })),
      assignments: assignments.map((a) => ({ id: a.id, employeeId: a.employeeId, shiftId: a.shiftId, date: a.date })),
    };
  }

  async putRoster(u: AuthUser, dto: RosterDto) {
    const empIds = [...new Set(dto.assignments.map((a) => a.employeeId))];
    const shiftIds = [...new Set(dto.assignments.map((a) => a.shiftId).filter(Boolean))] as string[];
    const emps = await this.prisma.employee.findMany({ where: this.scope.employeeWhere(u, { id: { in: empIds } }), select: { id: true } });
    if (emps.length !== empIds.length) throw notFound('Employee', 'أحد الموظفين غير موجود');
    const shifts = await this.prisma.shift.findMany({ where: { id: { in: shiftIds }, companyId: u.companyId } });
    if (shifts.length !== shiftIds.length) throw notFound('Shift', 'إحدى الورديات غير موجودة');
    if (u.role === 'BRANCH_MANAGER') shifts.forEach((s) => this.scope.assertBranch(u, s.branchId));

    let upserted = 0;
    let deleted = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const a of dto.assignments) {
        const where = { employeeId_date: { employeeId: a.employeeId, date: day(a.date) } };
        if (!a.shiftId) {
          const r = await tx.shiftAssignment.deleteMany({ where: { employeeId: a.employeeId, date: day(a.date) } });
          deleted += r.count;
        } else {
          await tx.shiftAssignment.upsert({
            where,
            create: { companyId: u.companyId, employeeId: a.employeeId, shiftId: a.shiftId, date: day(a.date) },
            update: { shiftId: a.shiftId },
          });
          upserted++;
        }
      }
    });
    await this.audit.log(u, 'UPDATE', 'Roster', null, { upserted, deleted });
    return { ok: true, upserted, deleted };
  }

  // ---------- Attendance ----------
  async board(u: AuthUser, date?: string, branchId?: string) {
    const b = this.scope.branchFilter(u, branchId);
    const rows = await this.calc.board(this.scope.employeeWhere(u, b ? { branchId: b } : {}), date || todayStr());
    return rows;
  }

  async summary(u: AuthUser, q: { from?: string; to?: string; branchId?: string; employeeId?: string }) {
    const to = q.to || todayStr();
    const from = q.from || dayStr(addDays(to, -29))!;
    const b = this.scope.branchFilter(u, q.branchId);
    const employees = await this.prisma.employee.findMany({
      where: this.scope.employeeWhere(u, {
        ...(b ? { branchId: b } : {}),
        ...(q.employeeId ? { id: q.employeeId } : {}),
        OR: [{ status: { not: 'TERMINATED' } }, { terminationDate: { gte: day(from) } }],
      }),
      include: { branch: { select: { id: true, nameAr: true } } },
      orderBy: { employeeNumber: 'asc' },
    });
    const records = await this.prisma.attendanceRecord.findMany({
      where: { companyId: u.companyId, employeeId: { in: employees.map((e) => e.id) }, date: { gte: day(from), lte: day(to) } },
    });
    return employees.map((e) => {
      const rs = records.filter((r) => r.employeeId === e.id);
      const present = rs.filter((r) => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'INCOMPLETE');
      return {
        employeeId: e.id,
        employeeName: fullName(e),
        branchId: e.branchId,
        branchName: e.branch?.nameAr ?? null,
        presentDays: present.length,
        lateDays: rs.filter((r) => r.status === 'LATE').length,
        absentDays: rs.filter((r) => r.status === 'ABSENT').length,
        lateMinutes: rs.reduce((s, r) => s + r.lateMinutes, 0),
        overtimeMinutes: rs.reduce((s, r) => s + r.overtimeMinutes, 0),
        workedHours: Math.round((rs.reduce((s, r) => s + r.workedMinutes, 0) / 60) * 100) / 100,
      };
    });
  }

  /** Upsert a record and compute metrics through @taqam/core. Used by manual entry & request approvals. */
  async upsertRecord(
    companyId: string,
    employee: { id: string; branchId: string | null },
    date: string,
    checkInRaw: string | null | undefined,
    checkOutRaw: string | null | undefined,
    opts: { note?: string; source: string; status?: 'ABSENT' },
  ) {
    const d = day(date);
    const shift = await this.calc.shiftFor(employee, d);
    const checkIn = opts.status === 'ABSENT' ? null : parseTime(d, checkInRaw);
    let checkOut = opts.status === 'ABSENT' ? null : parseTime(d, checkOutRaw);
    if (checkIn && checkOut && checkOut <= checkIn && checkOutRaw && /^\d{1,2}:\d{2}$/.test(checkOutRaw)) {
      checkOut = new Date(checkOut.getTime() + 86400000); // overnight
    }
    if (!checkIn && opts.status !== 'ABSENT') throw badRequest('checkIn is required', 'وقت الحضور مطلوب');
    const m = this.calc.compute(shift, checkIn, checkOut);
    const data = {
      shiftId: shift?.id ?? null,
      checkIn,
      checkOut,
      workedMinutes: m.workedMinutes,
      lateMinutes: m.lateMinutes,
      earlyLeaveMinutes: m.earlyLeaveMinutes,
      overtimeMinutes: m.overtimeMinutes,
      status: opts.status ?? m.status,
      source: opts.source,
      note: opts.note,
    };
    return this.prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: employee.id, date: d } },
      create: { companyId, employeeId: employee.id, date: d, ...data },
      update: data,
    });
  }

  async manual(u: AuthUser, dto: ManualAttendanceDto) {
    const e = await this.scope.employee(u, dto.employeeId);
    const r = await this.upsertRecord(u.companyId, e, dto.date, dto.checkIn, dto.checkOut, { note: dto.note, source: 'MANUAL', status: dto.status });
    await this.audit.log(u, 'MANUAL_ENTRY', 'AttendanceRecord', r.id, dto);
    return r;
  }

  async update(u: AuthUser, id: string, dto: UpdateAttendanceDto) {
    const rec = await this.prisma.attendanceRecord.findFirst({ where: { id, companyId: u.companyId } });
    if (!rec) throw notFound('Attendance record', 'سجل الحضور غير موجود');
    const e = await this.scope.employee(u, rec.employeeId);
    const date = dayStr(rec.date)!;
    const r = await this.upsertRecord(
      u.companyId,
      e,
      date,
      dto.checkIn !== undefined ? dto.checkIn : rec.checkIn?.toISOString(),
      dto.checkOut !== undefined ? dto.checkOut : rec.checkOut?.toISOString(),
      { note: dto.note ?? rec.note ?? undefined, source: 'MANUAL', status: dto.status },
    );
    await this.audit.log(u, 'UPDATE', 'AttendanceRecord', id, dto);
    return r;
  }
}
