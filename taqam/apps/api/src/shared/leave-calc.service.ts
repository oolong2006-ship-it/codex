import { Injectable } from '@nestjs/common';
import { Employee, LeaveType } from '@prisma/client';
import { annualLeaveBalance, countLeaveDays, serviceDuration } from '@taqam/core';
import { PrismaService } from '../prisma/prisma.service';
import { day, todayStr } from '../common/dates';
import { badRequest } from '../common/errors';
import { num } from '../common/money';

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

  /** Start of the employee's current service year (latest hire anniversary <= asOf). */
  serviceYearStart(hireDate: Date, asOf: string = todayStr()): Date {
    const years = serviceDuration(hireDate, asOf).years;
    const d = new Date(hireDate);
    d.setUTCFullYear(d.getUTCFullYear() + Math.max(0, years));
    return d;
  }

  async annualBalance(emp: Pick<Employee, 'id' | 'hireDate' | 'annualLeaveCarryOver'>, asOf: string = todayStr()) {
    const yearStart = this.serviceYearStart(emp.hireDate, asOf);
    const agg = await this.prisma.leaveRequest.aggregate({
      where: { employeeId: emp.id, status: 'APPROVED', leaveType: { code: 'ANNUAL' }, startDate: { gte: yearStart } },
      _sum: { days: true },
    });
    return annualLeaveBalance({
      hireDate: emp.hireDate,
      asOf,
      takenDays: agg._sum.days ?? 0,
      carriedOver: num(emp.annualLeaveCarryOver),
    });
  }

  /** `{ leaveTypeId, code, nameAr, entitlement|null, taken, balance|null }[]` */
  async balances(emp: Employee) {
    const types = await this.prisma.leaveType.findMany({ where: { companyId: emp.companyId }, orderBy: { createdAt: 'asc' } });
    const yearStart = day(`${todayStr().slice(0, 4)}-01-01`);
    const taken = await this.prisma.leaveRequest.groupBy({
      by: ['leaveTypeId'],
      where: { employeeId: emp.id, status: 'APPROVED', startDate: { gte: yearStart } },
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

  /** Validates a new leave request and returns the computed working days. Throws 400 with messageAr. */
  async validate(emp: Employee, type: LeaveType, startDate: string, endDate: string, excludeId?: string): Promise<number> {
    const start = day(startDate);
    const end = day(endDate);
    if (end < start) throw badRequest('endDate must be on or after startDate', 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
    const opts = await this.opts(emp.companyId);
    const days = this.countDays(start, end, opts);
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
      const yearStart = day(`${startDate.slice(0, 4)}-01-01`);
      const used =
        (
          await this.prisma.leaveRequest.aggregate({
            where: {
              employeeId: emp.id,
              leaveTypeId: type.id,
              status: { in: ['PENDING', 'APPROVED'] },
              startDate: { gte: yearStart },
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
