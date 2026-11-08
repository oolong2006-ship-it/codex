import { one, type Db, pool } from "./db";
import { AppError } from "./errors";

/**
 * Fixed-window rate limiter stored in Postgres so it holds across instances.
 * Throws errors.rateLimited when the window budget is exhausted.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number, db: Db = pool()): Promise<void> {
  const row = await one<{ count: number }>(
    `INSERT INTO rate_limits(key, window_start, count)
     VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / $2) * $2), 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`,
    [key, windowSeconds],
    db,
  );
  if (row && row.count > limit) throw new AppError("errors.rateLimited", 429);
}

export async function pruneRateLimits(db: Db = pool()) {
  await db.query(`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`);
}
