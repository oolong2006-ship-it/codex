import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Company, Employee, User } from '@prisma/client';
import { SAUDI_LEAVE_POLICIES } from '@taqam/core';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../shared/audit.service';
import { AuthUser, JwtPayload, RequestUser } from '../common/types';
import { badRequest, conflict } from '../common/errors';
import { extendFrom, PlatformService } from '../platform/platform.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto';

type UserWithRel = User & { company: Company | null; employee: Employee | null };

export function defaultLeaveTypes(companyId: string) {
  return SAUDI_LEAVE_POLICIES.map((p) => ({
    companyId,
    code: p.code,
    nameAr: p.nameAr,
    nameEn: p.nameEn,
    paid: p.paid,
    maxDaysPerYear: p.maxDaysPerYear,
  }));
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly platform: PlatformService,
  ) {}

  private userView(u: UserWithRel) {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      companyId: u.companyId,
      employeeId: u.employeeId,
      branchId: u.employee?.branchId ?? null,
    };
  }

  companyView(c: Company | null) {
    return c ? { id: c.id, nameAr: c.nameAr, nameEn: c.nameEn, status: c.status } : null;
  }

  /** AuthResponse. `opts` is used for impersonation tokens (1h, `impersonatedBy`). */
  response(u: UserWithRel, opts: { impersonatedBy?: string; expiresIn?: string } = {}) {
    const user = this.userView(u);
    const payload: JwtPayload = {
      sub: u.id,
      companyId: u.companyId,
      role: u.role,
      employeeId: u.employeeId,
      branchId: user.branchId,
      ...(opts.impersonatedBy ? { impersonatedBy: opts.impersonatedBy } : {}),
    };
    return {
      accessToken: opts.expiresIn ? this.jwt.sign(payload, { expiresIn: opts.expiresIn }) : this.jwt.sign(payload),
      user,
      company: this.companyView(u.company),
    };
  }

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw conflict('Email already registered', 'البريد الإلكتروني مسجل مسبقاً');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const settings = await this.platform.getSettings();
    const now = new Date();
    const status = settings.requireApproval ? 'PENDING' : 'TRIAL';
    const user = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          nameAr: dto.companyNameAr,
          nameEn: dto.companyNameEn,
          sector: dto.sector,
          employeesCount: dto.employeesCount,
          status,
          trialEndsAt: status === 'TRIAL' ? extendFrom(null, settings.trialDays, now) : null,
          activatedAt: status === 'TRIAL' ? now : null,
        },
      });
      await tx.leaveType.createMany({ data: defaultLeaveTypes(company.id) });
      await this.platform.logEvent(
        { companyId: company.id, companyName: company.nameAr, type: 'REGISTERED', toStatus: status, data: { sector: dto.sector, employeesCount: dto.employeesCount ?? null, email: dto.email } },
        tx,
      );
      return tx.user.create({
        data: { companyId: company.id, email: dto.email, name: dto.ownerName, phone: dto.phone, role: 'OWNER', passwordHash },
        include: { company: true, employee: true },
      });
    });
    await this.audit.log({ id: user.id, name: user.name, companyId: user.companyId! }, 'REGISTER', 'Company', user.companyId);
    return this.response(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { company: true, employee: true },
    });
    if (!user || !user.isActive || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException({
        message: 'Invalid email or password',
        messageAr: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      });
    }
    if (user.role === 'SUPER_ADMIN') {
      if (user.companyId) throw new UnauthorizedException({ message: 'Invalid account', messageAr: 'الحساب غير مفعّل' });
    } else {
      if (!user.company) throw new UnauthorizedException({ message: 'Invalid account', messageAr: 'الحساب غير مفعّل' });
      user.company.status = await this.platform.assertCompanyAccess(user.company);
      this.platform.touchActivity(user.company.id, user.company.lastActivityAt);
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.response(user);
  }

  async me(authUser: RequestUser) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: authUser.id },
      include: { company: true, employee: true },
    });
    return { ...this.userView(u), company: this.companyView(u.company) };
  }

  async changePassword(authUser: RequestUser, dto: ChangePasswordDto) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: authUser.id } });
    if (!(await bcrypt.compare(dto.currentPassword, u.passwordHash))) {
      throw badRequest('Current password is incorrect', 'كلمة المرور الحالية غير صحيحة');
    }
    await this.prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) },
    });
    if (authUser.companyId) await this.audit.log(authUser as AuthUser, 'CHANGE_PASSWORD', 'User', u.id);
    return { ok: true };
  }

  /**
   * Resolve the request user from a verified JWT payload (re-checks the DB so deactivation is immediate).
   * Also returns the company lifecycle fields so the guard can enforce company status.
   */
  async resolve(payload: JwtPayload): Promise<{ user: RequestUser; company: Company | null } | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { employee: { select: { branchId: true } }, company: true },
    });
    if (!u || !u.isActive || u.companyId !== (payload.companyId ?? null) || u.role !== payload.role) return null;
    if (u.role === 'SUPER_ADMIN') {
      if (u.companyId || payload.impersonatedBy) return null;
      return {
        user: { id: u.id, email: u.email, name: u.name, role: 'SUPER_ADMIN', companyId: null, employeeId: null, branchId: null },
        company: null,
      };
    }
    if (!u.companyId || !u.company) return null;
    return {
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        companyId: u.companyId,
        employeeId: u.employeeId,
        branchId: u.employee?.branchId ?? null,
        impersonatedBy: payload.impersonatedBy ?? null,
      },
      company: u.company,
    };
  }
}
