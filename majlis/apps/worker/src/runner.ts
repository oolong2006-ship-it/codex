import { claimJob, completeJob, failJob, type Db } from "@majlis/db";
import type { JobName, JobRegistry } from "./jobs.js";

export type RunResult = "idle" | "done" | "failed";

/** Claims and runs one job. Unknown or failing jobs are retried with backoff. */
export async function runOnce(db: Db, registry: JobRegistry): Promise<RunResult> {
  const job = await claimJob(db);
  if (!job) return "idle";
  try {
    await registry.run(job.kind as JobName, job.payload);
    await completeJob(db, job.id);
    return "done";
  } catch (err) {
    await failJob(db, job.id, err instanceof Error ? (err.stack ?? err.message) : String(err));
    return "failed";
  }
}

/** Runs jobs until the signal aborts; sleeps only when the queue is empty. */
export async function runLoop(
  db: Db,
  registry: JobRegistry,
  signal: AbortSignal,
  options: { idleMs?: number; onResult?: (r: RunResult) => void } = {},
): Promise<void> {
  while (!signal.aborted) {
    const result = await runOnce(db, registry);
    options.onResult?.(result);
    if (result === "idle") {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, options.idleMs ?? 1000);
        signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
      });
    }
  }
}

/** Drains everything that is ready now (tests, one-off runs). */
export async function drain(db: Db, registry: JobRegistry, max = 100): Promise<number> {
  let ran = 0;
  while (ran < max && (await runOnce(db, registry)) !== "idle") ran++;
  return ran;
}
