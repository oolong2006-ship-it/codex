import { sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { jobs } from "../schema.js";

export type JobRow = typeof jobs.$inferSelect;

/** A running job whose worker vanished is retried after this long. */
const STALE_AFTER = "10 minutes";
const MAX_ATTEMPTS = 5;

export async function enqueueJob(
  db: Db,
  kind: string,
  payload: Record<string, unknown>,
  options: {
    dedupeKey?: string;
    serialKey?: string;
    delaySeconds?: number;
    /** Never enqueue twice for the same dedupe key, even after it ran (webhook redeliveries). */
    once?: boolean;
  } = {},
): Promise<void> {
  if (options.once && options.dedupeKey) {
    const seen = await db.execute(
      sql`select 1 from jobs where dedupe_key = ${options.dedupeKey} limit 1`,
    );
    if (seen.rows.length) return;
  }
  await db
    .insert(jobs)
    .values({
      kind,
      payload,
      dedupeKey: options.dedupeKey ?? null,
      serialKey: options.serialKey ?? null,
      runAfter: new Date(Date.now() + (options.delaySeconds ?? 0) * 1000),
    })
    // A pending job with the same dedupe key already covers this request.
    .onConflictDoNothing();
}

/** Atomically takes the oldest ready job; concurrent workers never get the same one. */
export async function claimJob(db: Db): Promise<JobRow | null> {
  const result = await db.execute(sql`
    update jobs set status = 'running', locked_at = now(), attempts = attempts + 1
    where id = (
      select id from jobs
      where ((status = 'pending' and run_after <= now())
          or (status = 'running' and locked_at < now() - ${STALE_AFTER}::interval))
        -- One job per serial key at a time, and never ahead of an older one.
        and (serial_key is null or not exists (
          select 1 from jobs other
          where other.serial_key = jobs.serial_key and other.id <> jobs.id
            and (other.status = 'running' or (other.status = 'pending' and other.created_at < jobs.created_at))
        ))
      order by created_at
      for update skip locked
      limit 1
    )
    returning id, kind, payload, dedupe_key as "dedupeKey", status, attempts,
              run_after as "runAfter", locked_at as "lockedAt", last_error as "lastError",
              created_at as "createdAt"`);
  return (result.rows[0] as JobRow | undefined) ?? null;
}

export async function completeJob(db: Db, id: string): Promise<void> {
  await db.execute(sql`update jobs set status = 'done', locked_at = null where id = ${id}`);
}

/** Retries with exponential backoff, then gives up and keeps the error for review. */
export async function failJob(db: Db, id: string, error: string): Promise<void> {
  await db.execute(sql`
    update jobs set
      status = case when attempts >= ${MAX_ATTEMPTS} then 'failed'::job_status else 'pending'::job_status end,
      run_after = now() + make_interval(secs => power(2, attempts)),
      locked_at = null,
      last_error = ${error.slice(0, 2000)}
    where id = ${id}`);
}
