import type { Db } from "./db";
import type { Actor } from "./actor";

export async function audit(
  db: Db,
  actor: Pick<Actor, "merchantId" | "staffUserId"> | { merchantId: string; staffUserId: null },
  action: string,
  entity?: string,
  entityId?: string,
  meta: Record<string, unknown> = {},
) {
  await db.query(
    `INSERT INTO audit_log(merchant_id, staff_user_id, action, entity, entity_id, meta) VALUES ($1,$2,$3,$4,$5,$6)`,
    [actor.merchantId, actor.staffUserId, action, entity ?? null, entityId ?? null, JSON.stringify(meta)],
  );
}
