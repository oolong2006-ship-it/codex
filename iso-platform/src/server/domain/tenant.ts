import { withGlobal, withTenant, type Db } from "../db";
import { DomainError } from "../errors";
import { assertCan, type Permission, type Role } from "../rbac";

export interface TenantCtx {
  orgId: string;
  userId: string;
  role: Role;
}

/** Resolve role from the database — never trust a role sent by the client. */
export async function resolveCtx(userId: string, orgId: string): Promise<TenantCtx> {
  const role = await withGlobal(async (db) => {
    const { rows } = await db.query("SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2", [orgId, userId]);
    return rows[0]?.role as Role | undefined;
  }, userId);
  if (!role) throw new DomainError("FORBIDDEN", "ليست لديك عضوية في هذه المنشأة");
  return { orgId, userId, role };
}

/** Permission-checked tenant transaction. */
export function tx<T>(ctx: TenantCtx, permission: Permission, fn: (db: Db) => Promise<T>): Promise<T> {
  assertCan(ctx.role, permission);
  return withTenant(ctx.orgId, ctx.userId, fn);
}

export async function audit(
  db: Db,
  ctx: Pick<TenantCtx, "orgId" | "userId">,
  action: string,
  entityType: string,
  entityId: string | null,
  data: Record<string, unknown> = {},
) {
  await db.query(
    `INSERT INTO tenant_audit_logs (org_id, actor_id, action, entity_type, entity_id, data) VALUES ($1,$2,$3,$4,$5,$6)`,
    [ctx.orgId, ctx.userId, action, entityType, entityId, JSON.stringify(data)],
  );
}
