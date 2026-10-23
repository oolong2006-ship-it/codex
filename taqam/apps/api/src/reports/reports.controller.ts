import { Controller, Get, Module, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../shared/audit.service';
import { AttendanceModule } from '../attendance/attendance.module';
import { AttendanceService } from '../attendance/attendance.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { addMonths, periodOf, todayStr } from '../common/dates';
import { notFound } from '../common/errors';
import { num, r2 } from '../common/money';
import { toCsv } from '../common/csv';
import { fullName } from '../employees/employee.view';

@ApiTags('reports')
@ApiBearerAuth()
@Roles('OWNER', 'HR_ADMIN', 'PAYROLL')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly audit: AuditService,
  ) {}

  @Get('headcount')
  async headcount(@CurrentUser() u: AuthUser) {
    const emps = await this.prisma.employee.findMany({
      where: { companyId: u.companyId },
      select: { isSaudi: true, nationality: true, gender: true, branchId: true, departmentId: true, status: true, hireDate: true, terminationDate: true },
    });
    const active = emps.filter((e) => e.status !== 'TERMINATED');
    const [branches, departments] = await Promise.all([
      this.prisma.branch.findMany({ where: { companyId: u.companyId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.department.findMany({ where: { companyId: u.companyId }, orderBy: { createdAt: 'asc' } }),
    ]);
    const group = <K extends string>(arr: typeof active, key: (e: (typeof active)[number]) => K) => {
      const m = new Map<K, number>();
      arr.forEach((e) => m.set(key(e), (m.get(key(e)) ?? 0) + 1));
      return m;
    };
    const nat = group(active, (e) => e.nationality);
    const gen = group(active, (e) => e.gender);
    const thisPeriod = periodOf(todayStr());
    const months = Array.from({ length: 12 }, (_, i) => addMonths(thisPeriod, i - 11));
    return {
      total: active.length,
      byBranch: branches.map((b) => ({
        branchId: b.id,
        branchName: b.nameAr,
        count: active.filter((e) => e.branchId === b.id).length,
        saudis: active.filter((e) => e.branchId === b.id && e.isSaudi).length,
      })),
      byDepartment: departments.map((d) => ({ departmentId: d.id, name: d.name, count: active.filter((e) => e.departmentId === d.id).length })),
      byNationality: [...nat.entries()].map(([nationality, count]) => ({ nationality, count })).sort((a, b) => b.count - a.count),
      byGender: [...gen.entries()].map(([gender, count]) => ({ gender, count })),
      joinersByMonth: months.map((p) => ({ period: p, count: emps.filter((e) => periodOf(e.hireDate) === p).length })),
      leaversByMonth: months.map((p) => ({ period: p, count: emps.filter((e) => e.terminationDate && periodOf(e.terminationDate) === p).length })),
    };
  }

  @Get('payroll-cost')
  async payrollCost(@CurrentUser() u: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const runs = await this.prisma.payrollRun.findMany({
      where: {
        companyId: u.companyId,
        status: { not: 'DRAFT' },
        period: { gte: from || '0000-00', lte: to || '9999-99' },
      },
      orderBy: { period: 'asc' },
    });
    return runs.map((r) => ({
      period: r.period,
      status: r.status,
      employeesCount: r.employeesCount,
      gross: num(r.totalGross),
      net: num(r.totalNet),
      deductions: num(r.totalDeductions),
      gosiEmployer: num(r.totalGosiEmployer),
      employerCost: num(r.totalEmployerCost),
    }));
  }

  @Get('attendance')
  async attendanceReport(@CurrentUser() u: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const rows = await this.attendance.summary(u, { from, to });
    const map = new Map<string, { branchId: string | null; branchName: string | null; employees: number; presentDays: number; lateDays: number; absentDays: number; lateMinutes: number; overtimeMinutes: number; workedHours: number }>();
    for (const r of rows) {
      const k = r.branchId ?? 'none';
      const agg = map.get(k) ?? { branchId: r.branchId, branchName: r.branchName, employees: 0, presentDays: 0, lateDays: 0, absentDays: 0, lateMinutes: 0, overtimeMinutes: 0, workedHours: 0 };
      agg.employees++;
      agg.presentDays += r.presentDays;
      agg.lateDays += r.lateDays;
      agg.absentDays += r.absentDays;
      agg.lateMinutes += r.lateMinutes;
      agg.overtimeMinutes += r.overtimeMinutes;
      agg.workedHours = r2(agg.workedHours + r.workedHours);
      map.set(k, agg);
    }
    return [...map.values()];
  }

  @ApiProduces('text/csv')
  @Get(':name/export')
  async export(@CurrentUser() u: AuthUser, @Param('name') name: string, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    let csv: string;
    switch (name) {
      case 'headcount': {
        const h = await this.headcount(u);
        csv = toCsv(h.byBranch.map((b) => ({ branch: b.branchName, employees: b.count, saudis: b.saudis, nonSaudis: b.count - b.saudis })));
        break;
      }
      case 'payroll-cost':
        csv = toCsv(await this.payrollCost(u, q.from, q.to));
        break;
      case 'attendance':
        csv = toCsv(await this.attendanceReport(u, q.from, q.to));
        break;
      case 'employees': {
        const emps = await this.prisma.employee.findMany({
          where: { companyId: u.companyId },
          include: { branch: { select: { nameAr: true } }, department: { select: { name: true } } },
          orderBy: { employeeNumber: 'asc' },
        });
        csv = toCsv(
          emps.map((e) => ({
            employeeNumber: e.employeeNumber,
            name: fullName(e),
            nameEn: e.fullNameEn,
            nationality: e.nationality,
            gender: e.gender,
            nationalId: e.nationalId,
            branch: e.branch?.nameAr,
            department: e.department?.name,
            jobTitle: e.jobTitle,
            hireDate: e.hireDate,
            status: e.status,
            basicSalary: num(e.basicSalary),
            housingAllowance: num(e.housingAllowance),
            transportAllowance: num(e.transportAllowance),
            otherAllowances: num(e.otherAllowances),
            iban: e.iban,
          })),
        );
        break;
      }
      default:
        throw notFound('Report', 'التقرير غير موجود');
    }
    await this.audit.log(u, 'EXPORT', 'Report', name, q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}-${todayStr()}.csv"`);
    return csv;
  }
}

@Module({ imports: [AttendanceModule], controllers: [ReportsController] })
export class ReportsModule {}

