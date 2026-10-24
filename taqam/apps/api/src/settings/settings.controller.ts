import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcryptjs';
import { validateSaudiIban, bankCodeFromIban } from '@taqam/core';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../shared/audit.service';
import { ADMIN, ALL_ROLES, CurrentUser, Roles, STAFF } from '../common/decorators';
import { AuthUser } from '../common/types';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { day } from '../common/dates';
import { pageParams } from '../common/pagination';
import { CreateUserDto, HolidayDto, LeaveTypeDto, UpdateCompanyDto, UpdateLeaveTypeDto, UpdateUserDto } from './settings.dto';

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  employeeId: true,
  lastLoginAt: true,
  createdAt: true,
  employee: { select: { id: true, firstNameAr: true, lastNameAr: true, branchId: true } },
} as const;

/** Company as the tenant sees it: internal platform admin notes are never exposed. */
function tenantCompany<T extends { adminNotes?: string | null }>(c: T): Omit<T, 'adminNotes'> {
  const { adminNotes: _n, ...rest } = c;
  return rest;
}

@ApiTags('settings')
@ApiBearerAuth()
@Controller()
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Company ----------
  @Roles(...STAFF)
  @Get('company')
  async company(@CurrentUser() u: AuthUser) {
    return tenantCompany(await this.prisma.company.findUniqueOrThrow({ where: { id: u.companyId } }));
  }

  @Roles(...ADMIN)
  @Patch('company')
  async updateCompany(@CurrentUser() u: AuthUser, @Body() dto: UpdateCompanyDto) {
    if (dto.iban) {
      dto.iban = dto.iban.replace(/\s+/g, '').toUpperCase();
      if (!validateSaudiIban(dto.iban)) throw badRequest('Invalid Saudi IBAN', 'رقم الآيبان غير صالح');
      dto.bankCode = dto.bankCode || bankCodeFromIban(dto.iban);
    }
    const c = await this.prisma.company.update({ where: { id: u.companyId }, data: dto });
    await this.audit.log(u, 'UPDATE', 'Company', c.id, dto);
    return tenantCompany(c);
  }

  // ---------- Users ----------
  @Roles(...ADMIN)
  @Get('users')
  users(@CurrentUser() u: AuthUser) {
    return this.prisma.user.findMany({ where: { companyId: u.companyId }, select: userSelect, orderBy: { createdAt: 'asc' } });
  }

  private async checkEmployee(u: AuthUser, employeeId?: string | null) {
    if (!employeeId) return;
    const e = await this.prisma.employee.findFirst({ where: { id: employeeId, companyId: u.companyId } });
    if (!e) throw notFound('Employee', 'الموظف غير موجود');
  }

  @Roles(...ADMIN)
  @Post('users')
  async createUser(@CurrentUser() u: AuthUser, @Body() dto: CreateUserDto) {
    if (dto.role === 'OWNER' && u.role !== 'OWNER') throw forbidden('Only owners can create owners', 'فقط المالك يمكنه إنشاء مالك');
    if (await this.prisma.user.findUnique({ where: { email: dto.email } })) {
      throw conflict('Email already in use', 'البريد الإلكتروني مستخدم مسبقاً');
    }
    await this.checkEmployee(u, dto.employeeId);
    const user = await this.prisma.user.create({
      data: {
        companyId: u.companyId,
        email: dto.email,
        name: dto.name,
        role: dto.role,
        employeeId: dto.employeeId || null,
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
      select: userSelect,
    });
    await this.audit.log(u, 'CREATE', 'User', user.id, { email: dto.email, role: dto.role });
    return user;
  }

  @Roles(...ADMIN)
  @Patch('users/:id')
  async updateUser(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    const target = await this.prisma.user.findFirst({ where: { id, companyId: u.companyId } });
    if (!target) throw notFound('User', 'المستخدم غير موجود');
    if ((target.role === 'OWNER' || dto.role === 'OWNER') && u.role !== 'OWNER') {
      throw forbidden('Only owners can modify owners', 'فقط المالك يمكنه تعديل حساب مالك');
    }
    if (target.id === u.id && (dto.isActive === false || (dto.role && dto.role !== u.role))) {
      throw badRequest('You cannot deactivate or demote yourself', 'لا يمكنك تعطيل حسابك أو تغيير دورك');
    }
    await this.checkEmployee(u, dto.employeeId);
    const { password, ...rest } = dto;
    const user = await this.prisma.user.update({
      where: { id },
      data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
      select: userSelect,
    });
    await this.audit.log(u, 'UPDATE', 'User', id, rest);
    return user;
  }

  @Roles(...ADMIN)
  @Delete('users/:id')
  async deleteUser(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const target = await this.prisma.user.findFirst({ where: { id, companyId: u.companyId } });
    if (!target) throw notFound('User', 'المستخدم غير موجود');
    if (target.id === u.id) throw badRequest('You cannot delete yourself', 'لا يمكنك حذف حسابك');
    if (target.role === 'OWNER' && u.role !== 'OWNER') throw forbidden();
    await this.prisma.user.delete({ where: { id } });
    await this.audit.log(u, 'DELETE', 'User', id, { email: target.email });
    return { ok: true };
  }

  // ---------- Leave types ----------
  @Roles(...ALL_ROLES)
  @Get('leave-types')
  leaveTypes(@CurrentUser() u: AuthUser) {
    return this.prisma.leaveType.findMany({ where: { companyId: u.companyId }, orderBy: { createdAt: 'asc' } });
  }

  @Roles(...ADMIN)
  @Post('leave-types')
  async createLeaveType(@CurrentUser() u: AuthUser, @Body() dto: LeaveTypeDto) {
    const t = await this.prisma.leaveType.create({ data: { ...dto, maxDaysPerYear: dto.maxDaysPerYear ?? null, companyId: u.companyId } });
    await this.audit.log(u, 'CREATE', 'LeaveType', t.id, dto);
    return t;
  }

  @Roles(...ADMIN)
  @Patch('leave-types/:id')
  async updateLeaveType(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateLeaveTypeDto) {
    const t = await this.prisma.leaveType.findFirst({ where: { id, companyId: u.companyId } });
    if (!t) throw notFound('Leave type', 'نوع الإجازة غير موجود');
    const updated = await this.prisma.leaveType.update({ where: { id }, data: dto });
    await this.audit.log(u, 'UPDATE', 'LeaveType', id, dto);
    return updated;
  }

  @Roles(...ADMIN)
  @Delete('leave-types/:id')
  async deleteLeaveType(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const t = await this.prisma.leaveType.findFirst({ where: { id, companyId: u.companyId } });
    if (!t) throw notFound('Leave type', 'نوع الإجازة غير موجود');
    const used = await this.prisma.leaveRequest.count({ where: { leaveTypeId: id } });
    if (used) throw conflict('Leave type is in use', 'لا يمكن حذف نوع إجازة مستخدم في طلبات');
    await this.prisma.leaveType.delete({ where: { id } });
    await this.audit.log(u, 'DELETE', 'LeaveType', id, { code: t.code });
    return { ok: true };
  }

  // ---------- Holidays ----------
  @Roles(...STAFF)
  @Get('holidays')
  holidays(@CurrentUser() u: AuthUser, @Query('year') year?: string) {
    const y = Number(year);
    return this.prisma.publicHoliday.findMany({
      where: {
        companyId: u.companyId,
        ...(y ? { date: { gte: day(`${y}-01-01`), lte: day(`${y}-12-31`) } } : {}),
      },
      orderBy: { date: 'asc' },
    });
  }

  @Roles(...ADMIN)
  @Post('holidays')
  async createHoliday(@CurrentUser() u: AuthUser, @Body() dto: HolidayDto) {
    const h = await this.prisma.publicHoliday.create({ data: { ...dto, date: day(dto.date), companyId: u.companyId } });
    await this.audit.log(u, 'CREATE', 'PublicHoliday', h.id, dto);
    return h;
  }

  @Roles(...ADMIN)
  @Delete('holidays/:id')
  async deleteHoliday(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const h = await this.prisma.publicHoliday.findFirst({ where: { id, companyId: u.companyId } });
    if (!h) throw notFound('Holiday', 'العطلة غير موجودة');
    await this.prisma.publicHoliday.delete({ where: { id } });
    await this.audit.log(u, 'DELETE', 'PublicHoliday', id);
    return { ok: true };
  }

  // ---------- Audit logs ----------
  @Roles(...ADMIN)
  @Get('audit-logs')
  async auditLogs(
    @CurrentUser() u: AuthUser,
    @Query() q: { page?: string; pageSize?: string; entity?: string; action?: string; search?: string },
  ) {
    const { page, pageSize, skip, take } = pageParams(q);
    const where = {
      companyId: u.companyId,
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.search ? { OR: [{ userName: { contains: q.search, mode: 'insensitive' as const } }, { entity: { contains: q.search, mode: 'insensitive' as const } }] } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      data: data.map((a) => ({ id: a.id, action: a.action, entity: a.entity, entityId: a.entityId, userName: a.userName, createdAt: a.createdAt, data: a.data })),
      total,
      page,
      pageSize,
    };
  }
}
