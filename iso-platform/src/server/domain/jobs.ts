import { getAppPool, withTenant, type Db } from "../db";
import type { TenantCtx } from "./tenant";

export type JobHandler = (db: Db, job: { id: string; orgId: string; createdBy: string; payload: Record<string, unknown> }) => Promise<unknown>;

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(kind: string, handler: JobHandler) {
  handlers.set(kind, handler);
}

export async function enqueueJob(db: Db, ctx: TenantCtx, kind: string, payload: Record<string, unknown>): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO jobs (org_id, kind, payload, created_by) VALUES ($1,$2,$3,$4) RETURNING id`,
    [ctx.orgId, kind, JSON.stringify(payload), ctx.userId],
  );
  return rows[0].id;
}

/**
 * Claims and runs one job. Claiming crosses tenants via a SECURITY DEFINER function that returns only
 * (id, org_id, kind); the job body then runs inside withTenant so RLS applies to every query it makes.
 * Returns false when the queue is empty.
 */
export async function runNextJob(): Promise<boolean> {
  const claimed = (await getAppPool().query("SELECT * FROM claim_next_job()")).rows[0] as { id: string; org_id: string; kind: string } | undefined;
  if (!claimed) return false;
  const { id, org_id: orgId, kind } = claimed;

  const meta = await withTenant(orgId, "00000000-0000-0000-0000-000000000000", async (db) =>
    (await db.query("SELECT payload, created_by, attempts, max_attempts FROM jobs WHERE id = $1", [id])).rows[0],
  );
  const handler = handlers.get(kind);
  try {
    if (!handler) throw new Error(`NO_HANDLER:${kind}`);
    const result = await withTenant(orgId, meta.created_by, (db) =>
      handler(db, { id, orgId, createdBy: meta.created_by, payload: meta.payload }),
    );
    await withTenant(orgId, meta.created_by, (db) =>
      db.query("UPDATE jobs SET status='SUCCEEDED', result=$1, finished_at=now(), last_error=NULL WHERE id=$2", [JSON.stringify(result ?? null), id]),
    );
  } catch (e) {
    const msg = (e as Error).message.slice(0, 2000);
    const dead = meta.attempts >= meta.max_attempts;
    await withTenant(orgId, meta.created_by, (db) =>
      db.query(
        `UPDATE jobs SET status=$1, last_error=$2, locked_at=NULL,
           run_after = now() + make_interval(secs => 5 * power(2, attempts)), finished_at = CASE WHEN $1 = 'DEAD' THEN now() END
         WHERE id=$3`,
        [dead ? "DEAD" : "QUEUED", msg, id],
      ),
    );
  }
  return true;
}

let draining = false;
/** Drain the queue in-process (used after enqueue in the web app and by the standalone worker). */
export async function drainJobs(max = 50) {
  if (draining) return;
  draining = true;
  try {
    for (let i = 0; i < max && (await runNextJob()); i++);
  } finally {
    draining = false;
  }
}

export async function getJob(ctx: TenantCtx, jobId: string) {
  return withTenant(ctx.orgId, ctx.userId, async (db) => (await db.query("SELECT id, kind, status, attempts, last_error, result, created_at, finished_at FROM jobs WHERE id=$1", [jobId])).rows[0] ?? null);
}

export async function latestJob(ctx: TenantCtx, kind: string, projectId: string) {
  return withTenant(ctx.orgId, ctx.userId, async (db) =>
    (await db.query(
      "SELECT id, status, attempts, last_error, result, created_at, finished_at FROM jobs WHERE kind=$1 AND payload->>'projectId'=$2 ORDER BY created_at DESC LIMIT 1",
      [kind, projectId],
    )).rows[0] ?? null,
  );
}
