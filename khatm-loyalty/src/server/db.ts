import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";

const g = globalThis as unknown as { __khatmPool?: Pool };

export function pool(): Pool {
  if (!g.__khatmPool) {
    g.__khatmPool = new Pool({ connectionString: env().DATABASE_URL, max: 10 });
  }
  return g.__khatmPool;
}

export type Db = Pick<PoolClient, "query">;

export async function q<T extends QueryResultRow>(sql: string, params: unknown[] = [], db: Db = pool()): Promise<T[]> {
  const res = await db.query<T>(sql, params);
  return res.rows;
}

export async function one<T extends QueryResultRow>(sql: string, params: unknown[] = [], db: Db = pool()): Promise<T | null> {
  const rows = await q<T>(sql, params, db);
  return rows[0] ?? null;
}

/** Runs fn inside a transaction. Callbacks registered with onCommit run after COMMIT. */
export async function tx<T>(fn: (db: PoolClient, onCommit: (cb: () => void) => void) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  const after: Array<() => void> = [];
  try {
    await client.query("BEGIN");
    const result = await fn(client, (cb) => after.push(cb));
    await client.query("COMMIT");
    for (const cb of after) cb();
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
