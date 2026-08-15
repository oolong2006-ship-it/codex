import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can, isProcurement, type Permission } from "@/lib/rbac";
import type { UserRole } from "@prisma/client";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
}

/** Returns the current user or null (no throw). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const u = session.user;
  return {
    id: u.id,
    email: u.email ?? "",
    name: u.name ?? "",
    role: u.role,
    organizationId: u.organizationId,
    organizationName: u.organizationName,
  };
}

export class AuthorizationError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Throws if unauthenticated. Use inside server actions / route handlers. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError("Authentication required");
  return user;
}

/** Throws unless the user holds the given permission. */
export async function requirePermission(
  permission: Permission,
): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    throw new AuthorizationError(`Missing permission: ${permission}`);
  }
  return user;
}

/** Throws unless the user is a procurement-side role. */
export async function requireProcurement(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isProcurement(user.role)) {
    throw new AuthorizationError("Procurement access required");
  }
  return user;
}
