import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { forbidden, unauthenticated } from '../common/errors';
import { AuthedRequest, PUBLIC_ROUTE, REQUIRED_PERMISSION } from '../common/principal';
import { AuthService } from './auth.service';

/** كل المسارات محمية افتراضيًا؛ المسار العام يُعلّم بـ @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthenticated();
    req.principal = await this.auth.verifyAccessToken(token);
    return true;
  }
}

/** RBAC: الصلاحية المطلوبة يجب أن تكون ضمن صلاحيات أدوار المستخدم. */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string | undefined>(REQUIRED_PERMISSION, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.principal?.permissions.includes(required)) throw forbidden();
    return true;
  }
}
