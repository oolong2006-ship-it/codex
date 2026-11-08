import "./load-env";
import { drainOutbox } from "../src/server/outbox";
import { pruneRateLimits } from "../src/server/rate-limit";
import { pool } from "../src/server/db";

/**
 * Background worker: retries outbox jobs (wallet pushes, WhatsApp messages)
 * that failed or were not drained after commit, and prunes old rate-limit rows.
 * Run one instance alongside the web app: `npm run worker`.
 */
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

async function loop() {
  let tick = 0;
  while (!stopping) {
    try {
      const n = await drainOutbox();
      if (n > 0) console.log(`[worker] processed ${n} job(s)`);
      if (++tick % 720 === 0) await pruneRateLimits();
    } catch (e) {
      console.error("[worker]", e);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  await pool().end();
}

void loop();
