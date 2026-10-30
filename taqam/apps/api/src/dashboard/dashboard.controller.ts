import { Controller, Get, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { calculateGosi, expiryStatus, gosiRatesFor, nitaqatBand, saudizationRate } from '@taqam/core';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../shared/scope.service';
import { AttendanceCalcService } from '../shared/attendance-calc.service';
import { CurrentUser, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/types';
import { addDays, dayStr, eachDay, todayStr } from '../common/dates';
import { num, r2 } from '../common/money';
import { fullName } from '../employees/employee.view';

@ApiTags('dashboard')
@ApiBearerAuth()
@Roles(...STAFF)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly att: AttendanceCalcService,
  ) {}

  @Get()
  async dashboard(@CurrentUser() u: AuthUser) {
    const today = todayStr();
    const empWhere = this.scope.employeeWhere(u, { status: { not: 'TERMINATED' } });
    const employees = await this.prisma.employee.findMany({
      where: empWhere,
      select: {
        id: true,
        isSaudi: true,
        branchId: true,
        departmentId: true,
        basicSalary: true,
        housingAllowance: true,
        transportAllowance: true,
        otherAllowances: true,
        gosiRegistered: true,
        gosiFirstRegisteredAt: true,
      },
    });
    const headcount = employees.length;
    const saudis = employees.filter((e) => e.isSaudi).length;
    const saudizationRateVal = saudizationRate(saudis, headcount);

    const board = await this.att.board(this.scope.employeeWhere(u), today);
    const presentToday = board.filter((r) => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'INCOMPLETE').length;
    const lateToday = board.filter((r) => r.status === 'LATE').length;
    const absentToday = board.filter((r) => r.status === 'ABSENT').length;
    const onLeaveToday = board.filter((r) => r.status === 'ON_LEAVE').length;

    const empRel = this.scope.employeeWhere(u);
    const [pendingLeaves, pendingRequests] = await Promise.all([
      this.prisma.leaveRequest.count({ where: { companyId: u.companyId, status: 'PENDING', employee: empRel } }),
      this.prisma.employeeRequest.count({ where: { companyId: u.companyId, status: 'PENDING', employee: empRel } }),
    ]);

    // Payroll
    const runs = await this.prisma.payrollRun.findMany({
      where: { companyId: u.companyId, status: { not: 'DRAFT' } },
      orderBy: { period: 'desc' },
      take: 6,
    });
    const lastApproved = runs.find((r) => r.status === 'APPROVED' || r.status === 'PAID');
    let monthlyPayrollCost: number;
    let monthlyPayrollCostSource: 'LAST_RUN' | 'ESTIMATE';
    if (lastApproved && u.role !== 'BRANCH_MANAGER') {
      monthlyPayrollCost = num(lastApproved.totalEmployerCost);
      monthlyPayrollCostSource = 'LAST_RUN';
    } else {
      const period = today.slice(0, 7);
      monthlyPayrollCost = r2(
        employees.reduce((s, e) => {
          const wage = num(e.basicSalary) + num(e.housingAllowance) + num(e.transportAllowance) + num(e.otherAllowances);
          const rates = gosiRatesFor({ isSaudi: e.isSaudi, firstRegisteredAt: e.gosiFirstRegisteredAt }, period);
          const gosi = e.gosiRegistered ? calculateGosi({ basic: num(e.basicSalary), housing: num(e.housingAllowance), isSaudi: e.isSaudi }, rates).employer : 0;
          return s + wage + gosi;
        }, 0),
      );
      monthlyPayrollCostSource = 'ESTIMATE';
    }
    const payrollTrend =
      u.role === 'BRANCH_MANAGER'
        ? []
        : runs
            .slice()
            .reverse()
            .map((r) => ({ period: r.period, gross: num(r.totalGross), net: num(r.totalNet), employerCost: num(r.totalEmployerCost) }));

    // Documents
    const docs = await this.prisma.employeeDocument.findMany({
      where: { companyId: u.companyId, expiryDate: { not: null, lte: addDays(today, 90) }, employee: empWhere },
      include: { employee: { select: { firstNameAr: true, lastNameAr: true } } },
      orderBy: { expiryDate: 'asc' },
      take: 20,
    });
    const expiringDocuments = docs.map((d) => ({
      id: d.id,
      employeeId: d.employeeId,
      employeeName: fullName(d.employee),
      type: d.type,
      expiryDate: d.expiryDate,
      status: expiryStatus(d.expiryDate, today),
    }));

    // Breakdown
    const [branches, departments] = await Promise.all([
      this.prisma.branch.findMany({ where: { companyId: u.companyId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.department.findMany({ where: { companyId: u.companyId }, orderBy: { createdAt: 'asc' } }),
    ]);
    const headcountByBranch = branches
      .filter((b) => u.role !== 'BRANCH_MANAGER' || b.id === u.branchId)
      .map((b) => {
        const list = employees.filter((e) => e.branchId === b.id);
        const s = list.filter((e) => e.isSaudi).length;
        return { branchId: b.id, branchName: b.nameAr, count: list.length, saudis: s, saudizationRate: saudizationRate(s, list.length) };
      });
    const headcountByDepartment = departments
      .map((d) => ({ departmentId: d.id, name: d.name, count: employees.filter((e) => e.departmentId === d.id).length }))
      .filter((d) => d.count > 0 || u.role !== 'BRANCH_MANAGER');

    // Attendance trend (last 14 days, persisted records)
    const from = addDays(today, -13);
    const recs = await this.prisma.attendanceRecord.groupBy({
      by: ['date', 'status'],
      where: { companyId: u.companyId, date: { gte: from }, employee: empRel },
      _count: { _all: true },
    });
    const attendanceTrend = eachDay(from, today).map((d) => {
      const ds = dayStr(d);
      const rs = recs.filter((r) => dayStr(r.date) === ds);
      const c = (st: string[]) => rs.filter((r) => st.includes(r.status)).reduce((s, r) => s + r._count._all, 0);
      if (ds === today) return { date: ds, present: presentToday, late: lateToday, absent: absentToday };
      return { date: ds, present: c(['PRESENT', 'LATE', 'INCOMPLETE']), late: c(['LATE']), absent: c(['ABSENT']) };
    });

    const logs = await this.prisma.auditLog.findMany({
      where: { companyId: u.companyId, ...(u.role === 'BRANCH_MANAGER' ? { userId: u.id } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      headcount,
      saudis,
      nonSaudis: headcount - saudis,
      saudizationRate: saudizationRateVal,
      nitaqatBand: nitaqatBand(saudizationRateVal),
      presentToday,
      lateToday,
      absentToday,
      onLeaveToday,
      pendingLeaves,
      pendingRequests,
      monthlyPayrollCost,
      monthlyPayrollCostSource,
      expiringDocuments,
      headcountByBranch,
      headcountByDepartment,
      payrollTrend,
      attendanceTrend,
      recentActivity: logs.map((l) => ({ id: l.id, action: l.action, entity: l.entity, entityId: l.entityId, createdAt: l.createdAt, userName: l.userName })),
    };
  }
}

@Module({ controllers: [DashboardController] })
export class DashboardModule {}
