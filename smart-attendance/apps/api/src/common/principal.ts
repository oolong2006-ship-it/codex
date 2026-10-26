import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@sa/domain';
import type { Request } from 'express';

export interface RoleGrant {
  role: Role;
  branchId: string | null;
}

/** هوية الطلب بعد التحقق من JWT. */
export interface Principal {
  userId: string;
  /** null لمسؤول المنصة. */
  tenantId: string | null;
  employeeId: string | null;
  roles: RoleGrant[];
  permissions: string[];
}

export type AuthedRequest = Request & { principal?: Principal; requestId?: string };

export const CurrentPrincipal = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.principal) throw new Error('Principal missing: route is not protected by AuthGuard');
  return req.principal;
});

export const PUBLIC_ROUTE = 'sa:public';
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

export const REQUIRED_PERMISSION = 'sa:permission';
export const RequirePermission = (permission: string) => SetMetadata(REQUIRED_PERMISSION, permission);

export function roleCodes(p: Principal): Role[] {
  return [...new Set(p.roles.map((r) => r.role))];
}

/**
 * نطاق الفروع (ABAC). null = كل فروع العميل (tenant_admin، hr).
 * مدير الفرع: فروعه المعيّنة فقط. غير ذلك: لا فروع.
 */
export function branchScope(p: Principal): string[] | null {
  const codes = roleCodes(p);
  if (codes.includes('tenant_admin') || codes.includes('hr')) return null;
  return p.roles.filter((r) => r.role === 'branch_manager' && r.branchId).map((r) => r.branchId as string);
}
