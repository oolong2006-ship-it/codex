import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Company, Employee, User } from '@prisma/client';
import { SAUDI_LEAVE_POLICIES } from '@taqam/core';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../shared/audit.service';
import { AuthUser, JwtPayload } from '../common/types';
import { badRequest, conflict } from '../common/errors';
import { ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto';

type UserWithRel = User & { company: Company; employee: Employee | null };

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

  private response(u: UserWithRel) {
    const user = this.userView(u);
    const payload: JwtPayload = {
      sub: u.id,
      companyId: u.companyId,
      role: u.role,
      employeeId: u.employeeId,
      branchId: user.branchId,
    };
    return {
      accessToken: this.jwt.sign(payload),
      user,
      company: { id: u.company.id, nameAr: u.company.nameAr, nameEn: u.company.nameEn },
    };
  }

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw conflict('Email already registered', 'البريد الإلكتروني مسجل مسبقاً');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          nameAr: dto.companyNameAr,
          nameEn: dto.companyNameEn,
          sector: dto.sector,
          employeesCount: dto.employeesCount,
        },
      });
      await tx.leaveType.createMany({ data: defaultLeaveTypes(company.id) });
      return tx.user.create({
        data: { companyId: company.id, email: dto.email, name: dto.ownerName, role: 'OWNER', passwordHash },
        include: { company: true, employee: true },
      });
    });
    await this.audit.log({ id: user.id, name: user.name, companyId: user.companyId }, 'REGISTER', 'Company', user.companyId);
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
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.response(user);
  }

  async me(authUser: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: authUser.id },
      include: { company: true, employee: true },
    });
    return {
      ...this.userView(u),
      company: { id: u.company.id, nameAr: u.company.nameAr, nameEn: u.company.nameEn },
    };
  }

  async changePassword(authUser: AuthUser, dto: ChangePasswordDto) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: authUser.id } });
    if (!(await bcrypt.compare(dto.currentPassword, u.passwordHash))) {
      throw badRequest('Current password is incorrect', 'كلمة المرور الحالية غير صحيحة');
    }
    await this.prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) },
    });
    await this.audit.log(authUser, 'CHANGE_PASSWORD', 'User', u.id);
    return { ok: true };
  }

  /** Resolve the request user from a verified JWT payload (re-checks the DB so deactivation is immediate). */
  async resolve(payload: JwtPayload): Promise<AuthUser | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { employee: { select: { branchId: true } } },
    });
    if (!u || !u.isActive || u.companyId !== payload.companyId) return null;
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
}
