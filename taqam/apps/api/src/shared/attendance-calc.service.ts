import { Injectable } from '@nestjs/common';
import { Prisma, Shift } from '@prisma/client';
import { calculateAttendance, AttendanceCalc } from '@taqam/core';
import { PrismaService } from '../prisma/prisma.service';
import { day, riyadhDateTime, todayStr, weekday } from '../common/dates';

export type BoardStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'ON_LEAVE' | 'INCOMPLETE' | 'OFF';

export interface BoardRow {
  employeeId: string;
  employeeName: string;
  branchId: string | null;
  branchName: string | null;
  shiftName: string | null;
  shiftId: string | null;
  checkIn: Date | null;
  checkOut: Date | null;
  workedMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  status: BoardStatus;
  recordId: string | null;
}

/** Shift resolution + attendance metrics (math from @taqam/core.calculateAttendance). */
@Injectable()
export class AttendanceCalcService {
  constructor(private readonly prisma: PrismaService) {}

  /** Today's roster shift, falling back to the first branch shift that runs on that weekday. */
  async shiftFor(employee: { id: string; branchId: string | null }, date: string | Date): Promise<Shift | null> {
    const d = day(date);
    const assignment = await this.prisma.shiftAssignment.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: d } },
      include: { shift: true },
    });
    if (assignment) return assignment.shift;
    if (!employee.branchId) return null;
    return this.prisma.shift.findFirst({
      where: { branchId: employee.branchId, days: { has: weekday(d) } },
      orderBy: { startTime: 'asc' },
    });
  }

  compute(shift: Shift | null, checkIn: Date | null, checkOut: Date | null): AttendanceCalc {
    if (shift) {
      return calculateAttendance(
        { startTime: shift.startTime, endTime: shift.endTime, breakMinutes: shift.breakMinutes, graceMinutes: shift.graceMinutes },
        checkIn,
        checkOut,
        180,
      );
    }
    if (!checkIn) return { workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, status: 'ABSENT' };
    if (!checkOut || checkOut <= checkIn) {
      return { workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, status: 'INCOMPLETE' };
    }
    const worked = Math.round((checkOut.getTime() - checkIn.getTime()) / 60000);
    return { workedMinutes: worked, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, status: 'PRESENT' };
  }

  /** Daily board for all visible employees. */
  async board(employeeWhere: Prisma.EmployeeWhereInput, date: string): Promise<BoardRow[]> {
    const d = day(date);
    const wd = weekday(d);
    const today = todayStr();
    const now = new Date();
    const employees = await this.prisma.employee.findMany({
      where: {
        ...employeeWhere,
        hireDate: { lte: d },
        OR: [{ status: { not: 'TERMINATED' } }, { terminationDate: { gte: d } }],
      },
      include: { branch: { select: { id: true, nameAr: true } } },
      orderBy: [{ branchId: 'asc' }, { employeeNumber: 'asc' }],
    });
    const ids = employees.map((e) => e.id);
    const branchIds = [...new Set(employees.map((e) => e.branchId).filter(Boolean))] as string[];
    const [records, assignments, leaves, branchShifts] = await Promise.all([
      this.prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, date: d }, include: { shift: true } }),
      this.prisma.shiftAssignment.findMany({ where: { employeeId: { in: ids }, date: d }, include: { shift: true } }),
      this.prisma.leaveRequest.findMany({
        where: { employeeId: { in: ids }, status: 'APPROVED', startDate: { lte: d }, endDate: { gte: d } },
        select: { employeeId: true },
      }),
      this.prisma.shift.findMany({ where: { branchId: { in: branchIds } }, orderBy: { startTime: 'asc' } }),
    ]);
    const recMap = new Map(records.map((r) => [r.employeeId, r]));
    const asgMap = new Map(assignments.map((a) => [a.employeeId, a.shift]));
    const onLeave = new Set(leaves.map((l) => l.employeeId));
    const hasRoster = assignments.length > 0;

    return employees.map((e) => {
      const rec = recMap.get(e.id);
      let shift: Shift | null = asgMap.get(e.id) ?? rec?.shift ?? null;
      if (!shift && !hasRoster) shift = branchShifts.find((s) => s.branchId === e.branchId && s.days.includes(wd)) ?? null;
      let status: BoardStatus;
      if (rec) {
        status = rec.status as BoardStatus;
        if (rec.checkIn && !rec.checkOut && date === today) status = rec.lateMinutes > 0 ? 'LATE' : 'PRESENT';
      } else if (onLeave.has(e.id)) {
        status = 'ON_LEAVE';
      } else if (!shift) {
        status = 'OFF';
      } else if (date < today) {
        status = 'ABSENT';
      } else if (date === today && now > new Date(riyadhDateTime(d, shift.startTime).getTime() + shift.graceMinutes * 60000)) {
        status = 'ABSENT';
      } else {
        status = 'OFF';
      }
      return {
        employeeId: e.id,
        employeeName: `${e.firstNameAr} ${e.lastNameAr}`,
        branchId: e.branchId,
        branchName: e.branch?.nameAr ?? null,
        shiftId: shift?.id ?? null,
        shiftName: shift?.name ?? null,
        checkIn: rec?.checkIn ?? null,
        checkOut: rec?.checkOut ?? null,
        workedMinutes: rec?.workedMinutes ?? 0,
        lateMinutes: rec?.lateMinutes ?? 0,
        overtimeMinutes: rec?.overtimeMinutes ?? 0,
        status,
        recordId: rec?.id ?? null,
      };
    });
  }
}
