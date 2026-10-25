import { Injectable } from '@nestjs/common';
import { Employee, LeaveType } from '@prisma/client';
import { addYears, annualLeaveBalance, annualLeaveEntitlement, calendarDays, countLeaveDays, serviceDuration } from '@taqam/core';
import { PrismaService } from '../prisma/prisma.service';
import { day, todayStr } from '../common/dates';
import { badRequest } from '../common/errors';
import { num } from '../common/money';

/** Leave types the law counts in calendar days (Art. 117 sick tiers, Art. 151 maternity, unpaid wage deduction). */
export const CALENDAR_DAY_CODES = ['SICK', 'MATERNITY', 'UNPAID'];

export interface LeaveOpts {
  weekendDays: number[];
  holidays: Date[];
}

/** Leave-day counting & balances — all math delegated to @taqam/core. */
@Injectable()
export class LeaveCalcService {
  constructor(private readonly prisma: PrismaService) {}

  async opts(companyId: string): Promise<LeaveOpts> {
    const [company, holidays] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { weekendDays: true } }),
      this.prisma.publicHoliday.findMany({ where: { companyId }, select: { date: true } }),
    ]);
    return {
      weekendDays: company.weekendDays?.length ? company.weekendDays : [5, 6],
      holidays: holidays.map((h) => h.date),
    };
  }

  countDays(start: Date | string, end: Date | string, opts: LeaveOpts): number {
    return countLeaveDays(start, end, opts);
  }

  /** Start of the employee's current service year (latest hire anniversary <= asOf; Feb-29 hires → Feb 28). */
  serviceYearStart(hireDate: Date, asOf: string = todayStr()): Date {
    const years = serviceDuration(hireDate, asOf).years;
    return addYears(hireDate, Math.max(0, years));
  }

  /**
   * Annual balance = carried over + accrued in the current service year − taken in it.
   * Carried over = the HR opening balance (`annualLeaveCarryOver`, unused leave from before the
   * employee was added to Shuoon) + Σ entitlement of each completed service year tracked in Shuoon
   * − Σ annual leave taken before the current service year, floored at 0. Unused leave is not
   * forfeited (Arts. 109/111), so there is no upper cap.
   */
  async annualBalance(
    emp: Pick<Employee, 'id' | 'hireDate' | 'annualLeaveCarryOver'> & { createdAt?: Date | null },
    asOf: string = todayStr(),
  ) {
    const hire = day(emp.hireDate);
    const completedYears = Math.max(0, serviceDuration(hire, asOf).years);
    const yearStart = addYears(hire, completedYears);
    const trackedFrom = emp.createdAt ? day(emp.createdAt) : hire;

    let firstTrackedYearStart: Date | null = null;
    let entitled = 0;
    for (let i = 0; i < completedYears; i++) {
      if (addYears(hire, i + 1) <= trackedFrom) continue; // finished before the record existed
      const start = addYears(hire, i);
      firstTrackedYearStart ??= start;
      entitled += annualLeaveEntitlement(hire, start);
    }

    const [current, prior] = await Promise.all([
      this.prisma.leaveRequest.aggregate({
        where: { employeeId: emp.id, status: 'APPROVED', leaveType: { code: 'ANNUAL' }, startDate: { gte: yearStart } },
        _sum: { days: true },
      }),
      firstTrackedYearStart
        ? this.prisma.leaveRequest.aggregate({
            where: { employeeId: emp.id, status: 'APPROVED', leaveType: { code: 'ANNUAL' }, startDate: { gte: firstTrackedYearStart, lt: yearStart } },
            _sum: { days: true },
          })
        : null,
    ]);
    const computedCarry = firstTrackedYearStart ? Math.max(0, entitled - (prior?._sum.days ?? 0)) : 0;
    return annualLeaveBalance({
      hireDate: emp.hireDate,
      asOf,
      takenDays: current._sum.days ?? 0,
      carriedOver: num(emp.annualLeaveCarryOver) + computedCarry,
    });
  }

  /** `{ leaveTypeId, code, nameAr, entitlement|null, taken, balance|null }[]` */
  async balances(emp: Employee) {
    const types = await this.prisma.leaveType.findMany({ where: { companyId: emp.companyId }, orderBy: { createdAt: 'asc' } });
    const year = todayStr().slice(0, 4);
    const taken = await this.prisma.leaveRequest.groupBy({
      by: ['leaveTypeId'],
      where: { employeeId: emp.id, status: 'APPROVED', startDate: { gte: day(`${year}-01-01`), lte: day(`${year}-12-31`) } },
      _sum: { days: true },
    });
    const takenMap = new Map(taken.map((t) => [t.leaveTypeId, t._sum.days ?? 0]));
    const annual = await this.annualBalance(emp);
    return types.map((t) => {
      if (t.code === 'ANNUAL') {
        return {
          leaveTypeId: t.id,
          code: t.code,
          nameAr: t.nameAr,
          nameEn: t.nameEn,
          entitlement: annual.entitlementPerYear,
          accrued: annual.accrued,
          taken: annual.taken,
          balance: annual.balance,
        };
      }
      const tk = takenMap.get(t.id) ?? 0;
      return {
        leaveTypeId: t.id,
        code: t.code,
        nameAr: t.nameAr,
        nameEn: t.nameEn,
        entitlement: t.maxDaysPerYear,
        taken: tk,
        balance: t.maxDaysPerYear === null ? null : Math.max(0, t.maxDaysPerYear - tk),
      };
    });
  }

  /** Days a leave of this type consumes: calendar days for SICK/MATERNITY/UNPAID, working days otherwise. */
  countDaysFor(code: string, start: Date | string, end: Date | string, opts: LeaveOpts): number {
    return CALENDAR_DAY_CODES.includes(code) ? calendarDays(start, end) : this.countDays(start, end, opts);
  }

  /** Validates a new leave request and returns the days it consumes (see countDaysFor). Throws 400 with messageAr. */
  async validate(emp: Employee, type: LeaveType, startDate: string, endDate: string, excludeId?: string): Promise<number> {
    const start = day(startDate);
    const end = day(endDate);
    if (end < start) throw badRequest('endDate must be on or after startDate', 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
    const opts = await this.opts(emp.companyId);
    const days = this.countDaysFor(type.code, start, end, opts);
    if (days <= 0) throw badRequest('Leave contains no working days', 'الفترة المختارة لا تحتوي على أيام عمل');

    const overlap = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId: emp.id,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: end },
        endDate: { gte: start },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (overlap) throw badRequest('Overlapping leave request exists', 'يوجد طلب إجازة متداخل مع هذه الفترة');

    const pendingWhere = {
      employeeId: emp.id,
      leaveTypeId: type.id,
      status: 'PENDING' as const,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    };
    if (type.code === 'ANNUAL') {
      const bal = await this.annualBalance(emp);
      const pending = (await this.prisma.leaveRequest.aggregate({ where: pendingWhere, _sum: { days: true } }))._sum.days ?? 0;
      const available = Math.floor((bal.balance - pending) * 100) / 100;
      if (days > available) {
        throw badRequest(
          `Insufficient annual leave balance (available ${available}, requested ${days})`,
          `رصيد الإجازة السنوية غير كافٍ (المتاح ${available} يوم، المطلوب ${days} يوم)`,
          { available, requested: days },
        );
      }
    } else if (type.maxDaysPerYear !== null && type.code !== 'SICK') {
      const year = startDate.slice(0, 4);
      const used =
        (
          await this.prisma.leaveRequest.aggregate({
            where: {
              employeeId: emp.id,
              leaveTypeId: type.id,
              status: { in: ['PENDING', 'APPROVED'] },
              startDate: { gte: day(`${year}-01-01`), lte: day(`${year}-12-31`) },
              ...(excludeId ? { id: { not: excludeId } } : {}),
            },
            _sum: { days: true },
          })
        )._sum.days ?? 0;
      if (used + days > type.maxDaysPerYear) {
        const available = Math.max(0, type.maxDaysPerYear - used);
        throw badRequest(
          `Exceeds yearly maximum for ${type.code} (available ${available})`,
          `تتجاوز الحد السنوي لـ${type.nameAr} (المتاح ${available} يوم)`,
          { available, requested: days },
        );
      }
    }
    return days;
  }
}
