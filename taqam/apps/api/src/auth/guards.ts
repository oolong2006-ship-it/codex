import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { IS_PUBLIC_KEY, ROLES_KEY, STAFF } from '../common/decorators';
import { forbidden } from '../common/errors';
import { JwtPayload } from '../common/types';
import { AuthService } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ message: 'Missing bearer token', messageAr: 'يجب تسجيل الدخول' });
    }
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7));
    } catch {
      throw new UnauthorizedException({ message: 'Invalid or expired token', messageAr: 'انتهت الجلسة، سجّل الدخول مجدداً' });
    }
    const user = await this.auth.resolve(payload);
    if (!user) throw new UnauthorizedException({ message: 'User inactive', messageAr: 'الحساب غير مفعّل' });
    req.authUser = user;
    return true;
  }
}

/** Role check. Endpoints without @Roles are open to staff roles only (never EMPLOYEE). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]) ?? STAFF;
    const user = ctx.switchToHttp().getRequest().authUser;
    if (!user || !roles.includes(user.role)) throw forbidden();
    return true;
  }
}
