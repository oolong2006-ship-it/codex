import { Pool, type PoolClient } from "pg";

/**
 * Two connection pools:
 *  - app: role iso_app, subject to RLS. Used for all request handling.
 *  - owner: role iso_owner, used ONLY by migrations / seeding / platform admin scripts.
 */
let appPool: Pool | null = null;

export function getAppPool(): Pool {
  if (!appPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    appPool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) });
  }
  return appPool;
}

export async function closePools() {
  if (appPool) {
    await appPool.end();
    appPool = null;
  }
}

export type Db = PoolClient;

/** Run fn in a transaction with no tenant context (only global tables are reachable). */
export async function withGlobal<T>(fn: (db: Db) => Promise<T>, userId?: string): Promise<T> {
  const client = await getAppPool().connect();
  try {
    await client.query("BEGIN");
    if (userId) await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Run fn in a transaction scoped to a tenant. RLS policies read app.org_id / app.user_id,
 * so any query (even one missing a WHERE org_id clause) only sees this tenant's rows.
 */
export async function withTenant<T>(orgId: string, userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getAppPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.org_id', $1, true), set_config('app.user_id', $2, true)", [orgId, userId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
