import { pool, type Db } from "./db";

/**
 * Transactional outbox. enqueue() runs inside the caller's transaction, so a
 * wallet push is only ever sent for state that actually committed. Jobs are
 * drained right after commit (best effort) and by `npm run worker` (retries).
 */
export type JobKind = "wallet.card_changed" | "wallet.program_changed" | "message.send";

type Handler = (payload: Record<string, unknown>) => Promise<void>;
const handlers = new Map<JobKind, Handler>();

export function registerHandler(kind: JobKind, h: Handler) {
  handlers.set(kind, h);
}

export async function enqueue(db: Db, kind: JobKind, payload: Record<string, unknown>) {
  await db.query(`INSERT INTO outbox_jobs(kind, payload) VALUES ($1,$2)`, [kind, JSON.stringify(payload)]);
}

let draining: Promise<number> | null = null;

export function scheduleDrain() {
  if (process.env.OUTBOX_AUTODRAIN === "0") return;
  if (draining) return;
  draining = drainOutbox()
    .catch((e) => {
      console.error("[outbox] drain failed", e);
      return 0;
    })
    .finally(() => {
      draining = null;
    });
}

export async function drainOutbox(limit = 50): Promise<number> {
  await import("./jobs"); // registers handlers lazily (avoids import cycles)
  const client = await pool().connect();
  let processed = 0;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string; kind: JobKind; payload: Record<string, unknown>; attempts: number }>(
      `SELECT id, kind, payload, attempts FROM outbox_jobs
       WHERE done_at IS NULL AND run_after <= now() AND attempts < 8
       ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [limit],
    );
    for (const job of rows) {
      const h = handlers.get(job.kind);
      try {
        if (!h) throw new Error(`no handler for ${job.kind}`);
        await h(job.payload);
        await client.query(`UPDATE outbox_jobs SET done_at = now(), attempts = attempts + 1 WHERE id = $1`, [job.id]);
      } catch (e) {
        const backoff = Math.min(3600, 15 * 2 ** job.attempts);
        await client.query(
          `UPDATE outbox_jobs SET attempts = attempts + 1, last_error = $2, run_after = now() + make_interval(secs => $3) WHERE id = $1`,
          [job.id, String(e instanceof Error ? e.message : e).slice(0, 500), backoff],
        );
      }
      processed++;
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return processed;
}
