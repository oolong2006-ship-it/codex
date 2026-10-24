import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { IS_PUBLIC_KEY, ROLES_KEY, STAFF } from '../common/decorators';
import { forbidden } from '../common/errors';
import { JwtPayload, RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformService } from '../platform/platform.service';
import { AuthService } from './auth.service';

/** Controller path prefixes a platform admin (SUPER_ADMIN) may reach. */
const PLATFORM_PREFIXES = ['auth', 'admin'];

const unauthorized = (message: string, messageAr: string) => new UnauthorizedException({ message, messageAr });

/**
 * Authenticates the bearer token and enforces company lifecycle (PENDING / SUSPENDED / EXPIRED → 403)
 * on every authenticated company request. Impersonation tokens bypass the status check (support use).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly platform: PlatformService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw unauthorized('Missing bearer token', 'يجب تسجيل الدخول');
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7));
    } catch {
      throw unauthorized('Invalid or expired token', 'انتهت الجلسة، سجّل الدخول مجدداً');
    }
    const resolved = await this.auth.resolve(payload);
    if (!resolved) throw unauthorized('User inactive', 'الحساب غير مفعّل');
    const { user, company } = resolved;

    if (user.role !== 'SUPER_ADMIN') {
      if (!company) throw unauthorized('User inactive', 'الحساب غير مفعّل');
      if (payload.impersonatedBy) {
        const admin = await this.prisma.user.findUnique({ where: { id: payload.impersonatedBy }, select: { role: true, isActive: true } });
        if (!admin || admin.role !== 'SUPER_ADMIN' || !admin.isActive) throw unauthorized('Invalid or expired token', 'انتهت الجلسة، سجّل الدخول مجدداً');
      } else {
        await this.platform.assertCompanyAccess(company);
        this.platform.touchActivity(company.id, company.lastActivityAt);
      }
    }
    req.authUser = user;
    return true;
  }
}

/**
 * Role check. Endpoints without @Roles are open to company staff roles only (never EMPLOYEE / SUPER_ADMIN).
 * SUPER_ADMIN may only reach /auth/* and /admin/*; company roles never reach SUPER_ADMIN-only endpoints.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]) ?? STAFF;
    const user: RequestUser | undefined = ctx.switchToHttp().getRequest().authUser;
    if (!user || !roles.includes(user.role)) throw forbidden();
    const ctrlPath = String(this.reflector.get<string>(PATH_METADATA, ctx.getClass()) ?? '').replace(/^\/+/, '');
    const prefix = ctrlPath.split('/')[0];
    if (user.role === 'SUPER_ADMIN') {
      if (user.companyId !== null || !PLATFORM_PREFIXES.includes(prefix)) throw forbidden();
    } else {
      if (!user.companyId || prefix === 'admin') throw forbidden();
    }
    return true;
  }
}
