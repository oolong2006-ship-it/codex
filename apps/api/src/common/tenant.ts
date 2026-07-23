import { AuthenticatedUser } from './types';
import { ForbiddenException } from '@nestjs/common';

/**
 * Produces a Prisma `where` fragment enforcing tenant isolation.
 * Super admins see all tenants; everyone else is pinned to their organization.
 */
export function tenantWhere<T extends Record<string, unknown>>(
  user: AuthenticatedUser,
  extra: T = {} as T,
): T & { organizationId?: string } {
  if (user.isSuperAdmin) return { ...extra };
  if (!user.organizationId) {
    throw new ForbiddenException('User is not attached to an organization');
  }
  return { ...extra, organizationId: user.organizationId };
}

/**
 * Resolves the organization id a write should be attributed to.
 * Super admins may target any org via `requestedOrgId`; others are forced to their own.
 */
export function resolveOrgId(
  user: AuthenticatedUser,
  requestedOrgId?: string,
): string {
  if (user.isSuperAdmin) {
    const org = requestedOrgId ?? user.organizationId;
    if (!org) {
      throw new ForbiddenException('organizationId is required for super admin writes');
    }
    return org;
  }
  if (!user.organizationId) {
    throw new ForbiddenException('User is not attached to an organization');
  }
  return user.organizationId;
}
