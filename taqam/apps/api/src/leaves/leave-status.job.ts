import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { day, todayStr } from '../common/dates';

/**
 * Keeps Employee.status in step with approved leaves: ACTIVE ↔ ON_LEAVE.
 * Runs daily at 00:10 Riyadh and after every leave approve/cancel. TERMINATED is never touched.
 */
@Injectable()
export class LeaveStatusJob {
  private readonly log = new Logger(LeaveStatusJob.name);

  constructor(private readonly prisma: PrismaService) {}

  async syncLeaveStatuses(today: string | Date = todayStr(), scope: { companyId?: string; employeeId?: string } = {}) {
    const d = day(today);
    const coveringToday: Prisma.LeaveRequestWhereInput = { status: 'APPROVED', startDate: { lte: d }, endDate: { gte: d } };
    const base: Prisma.EmployeeWhereInput = {
      ...(scope.employeeId ? { id: scope.employeeId } : {}),
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
    };
    const onLeave = await this.prisma.employee.updateMany({
      where: { ...base, status: 'ACTIVE', leaveRequests: { some: coveringToday } },
      data: { status: 'ON_LEAVE' },
    });
    const active = await this.prisma.employee.updateMany({
      where: { ...base, status: 'ON_LEAVE', leaveRequests: { none: coveringToday } },
      data: { status: 'ACTIVE' },
    });
    return { onLeave: onLeave.count, active: active.count };
  }

  @Cron('0 10 0 * * *', { name: 'sync-leave-statuses', timeZone: 'Asia/Riyadh' })
  async daily() {
    const res = await this.syncLeaveStatuses(todayStr());
    if (res.onLeave || res.active) this.log.log(`Leave statuses synced: ${res.onLeave} on leave, ${res.active} back to active`);
    return res;
  }
}
