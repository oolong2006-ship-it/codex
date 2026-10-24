import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';
import { forbidden } from './errors';
import { AuthUser, PlatformUser, RequestUser } from './types';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restrict an endpoint to the given roles. No decorator = any authenticated non-EMPLOYEE company role. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const ADMIN: Role[] = ['OWNER', 'HR_ADMIN'];
export const STAFF: Role[] = ['OWNER', 'HR_ADMIN', 'PAYROLL', 'BRANCH_MANAGER'];
/** Every company (tenant) role. Never includes SUPER_ADMIN. */
export const ALL_ROLES: Role[] = ['OWNER', 'HR_ADMIN', 'PAYROLL', 'BRANCH_MANAGER', 'EMPLOYEE'];
export const PLATFORM: Role[] = ['SUPER_ADMIN'];

/**
 * The tenant user of the request. Throws 403 if the request user has no company (platform admin),
 * so tenant-scoped code can never run with a null companyId.
 */
export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => {
  const u: RequestUser | undefined = ctx.switchToHttp().getRequest().authUser;
  if (!u || u.role === 'SUPER_ADMIN' || !u.companyId) throw forbidden();
  return u as AuthUser;
});

/** The platform admin of the request (403 for anyone else). */
export const CurrentAdmin = createParamDecorator((_d: unknown, ctx: ExecutionContext): PlatformUser => {
  const u: RequestUser | undefined = ctx.switchToHttp().getRequest().authUser;
  if (!u || u.role !== 'SUPER_ADMIN') throw forbidden();
  return u as PlatformUser;
});

/** Any authenticated user — company or platform (used only by /auth/*). */
export const CurrentRequestUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): RequestUser => {
  return ctx.switchToHttp().getRequest().authUser;
});
