import { AppError } from "./errors";
import { can, type Permission, type Role } from "./rbac";

/**
 * The authenticated principal. Built only on the server from the session row;
 * merchantId and role never come from the request body.
 */
export type Actor = {
  staffUserId: string;
  merchantId: string;
  role: Role;
  name: string;
  /** Branch the device session is bound to (staff PWA). */
  branchId: string | null;
};

export function requirePermission(actor: Actor, permission: Permission): void {
  if (!can(actor.role, permission)) throw new AppError("errors.forbidden", 403);
}
