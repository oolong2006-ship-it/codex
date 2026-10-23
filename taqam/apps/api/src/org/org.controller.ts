import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { nitaqatBand, saudizationRate } from '@taqam/core';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../shared/audit.service';
import { ADMIN, CurrentUser, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/types';
import { badRequest, conflict, notFound } from '../common/errors';
import { BranchDto, DepartmentDto, UpdateBranchDto, UpdateDepartmentDto } from './org.dto';

@ApiTags('organization')
@ApiBearerAuth()
@Controller()
export class OrgController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Roles(...STAFF)
  @Get('branches')
  async branches(@CurrentUser() u: AuthUser) {
    const branches = await this.prisma.branch.findMany({
      where: { companyId: u.companyId },
      include: { manager: { select: { id: true, firstNameAr: true, lastNameAr: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const counts = await this.prisma.employee.groupBy({
      by: ['branchId', 'isSaudi'],
      where: { companyId: u.companyId, status: { not: 'TERMINATED' } },
      _count: { _all: true },
    });
    return branches.map((b) => {
      const total = counts.filter((c) => c.branchId === b.id).reduce((s, c) => s + c._count._all, 0);
      const saudis = counts.find((c) => c.branchId === b.id && c.isSaudi)?._count._all ?? 0;
      const rate = saudizationRate(saudis, total);
      const { manager, ...rest } = b;
      return {
        ...rest,
        employeesCount: total,
        saudis,
        saudizationRate: rate,
        nitaqatBand: nitaqatBand(rate),
        managerName: manager ? `${manager.firstNameAr} ${manager.lastNameAr}` : null,
        manager: manager ? { id: manager.id, name: `${manager.firstNameAr} ${manager.lastNameAr}` } : null,
      };
    });
  }

  private async checkManager(u: AuthUser, id?: string | null) {
    if (!id) return;
    const e = await this.prisma.employee.findFirst({ where: { id, companyId: u.companyId } });
    if (!e) throw badRequest('Invalid managerEmployeeId', 'المدير المحدد غير موجود');
  }

  @Roles(...ADMIN)
  @Post('branches')
  async createBranch(@CurrentUser() u: AuthUser, @Body() dto: BranchDto) {
    await this.checkManager(u, dto.managerEmployeeId);
    const b = await this.prisma.branch.create({ data: { ...dto, radiusMeters: dto.radiusMeters ?? 150, companyId: u.companyId } });
    await this.audit.log(u, 'CREATE', 'Branch', b.id, dto);
    return b;
  }

  @Roles(...ADMIN)
  @Patch('branches/:id')
  async updateBranch(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateBranchDto) {
    const b = await this.prisma.branch.findFirst({ where: { id, companyId: u.companyId } });
    if (!b) throw notFound('Branch', 'الفرع غير موجود');
    await this.checkManager(u, dto.managerEmployeeId);
    const updated = await this.prisma.branch.update({ where: { id }, data: dto });
    await this.audit.log(u, 'UPDATE', 'Branch', id, dto);
    return updated;
  }

  @Roles(...ADMIN)
  @Delete('branches/:id')
  async deleteBranch(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const b = await this.prisma.branch.findFirst({ where: { id, companyId: u.companyId } });
    if (!b) throw notFound('Branch', 'الفرع غير موجود');
    const emps = await this.prisma.employee.count({ where: { branchId: id, status: { not: 'TERMINATED' } } });
    if (emps) throw conflict('Branch has active employees', 'لا يمكن حذف فرع به موظفون نشطون');
    await this.prisma.branch.delete({ where: { id } });
    await this.audit.log(u, 'DELETE', 'Branch', id, { nameAr: b.nameAr });
    return { ok: true };
  }

  @Roles(...STAFF)
  @Get('departments')
  async departments(@CurrentUser() u: AuthUser) {
    const deps = await this.prisma.department.findMany({
      where: { companyId: u.companyId },
      include: { _count: { select: { employees: { where: { status: { not: 'TERMINATED' } } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return deps.map((d) => ({ id: d.id, name: d.name, parentId: d.parentId, employeesCount: d._count.employees, createdAt: d.createdAt }));
  }

  private async checkParent(u: AuthUser, parentId?: string | null, selfId?: string) {
    if (!parentId) return;
    if (parentId === selfId) throw badRequest('Department cannot be its own parent', 'لا يمكن أن يكون القسم أباً لنفسه');
    const p = await this.prisma.department.findFirst({ where: { id: parentId, companyId: u.companyId } });
    if (!p) throw badRequest('Invalid parentId', 'القسم الأب غير موجود');
  }

  @Roles(...ADMIN)
  @Post('departments')
  async createDepartment(@CurrentUser() u: AuthUser, @Body() dto: DepartmentDto) {
    await this.checkParent(u, dto.parentId);
    const d = await this.prisma.department.create({ data: { name: dto.name, parentId: dto.parentId || null, companyId: u.companyId } });
    await this.audit.log(u, 'CREATE', 'Department', d.id, dto);
    return { ...d, employeesCount: 0 };
  }

  @Roles(...ADMIN)
  @Patch('departments/:id')
  async updateDepartment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    const d = await this.prisma.department.findFirst({ where: { id, companyId: u.companyId } });
    if (!d) throw notFound('Department', 'القسم غير موجود');
    await this.checkParent(u, dto.parentId, id);
    const updated = await this.prisma.department.update({ where: { id }, data: dto });
    await this.audit.log(u, 'UPDATE', 'Department', id, dto);
    return updated;
  }

  @Roles(...ADMIN)
  @Delete('departments/:id')
  async deleteDepartment(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const d = await this.prisma.department.findFirst({ where: { id, companyId: u.companyId } });
    if (!d) throw notFound('Department', 'القسم غير موجود');
    await this.prisma.department.delete({ where: { id } });
    await this.audit.log(u, 'DELETE', 'Department', id, { name: d.name });
    return { ok: true };
  }
}
