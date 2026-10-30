/* Durable job worker: polls the Postgres queue (SKIP LOCKED) and runs handlers under tenant RLS. */
import "../src/server/domain/documents"; // registers generate_documents
import { closePools } from "../src/server/db";
import { runNextJob } from "../src/server/domain/jobs";

let stop = false;
process.on("SIGTERM", () => (stop = true));
process.on("SIGINT", () => (stop = true));

(async () => {
  console.log("worker started");
  while (!stop) {
    const didWork = await runNextJob().catch((e) => (console.error("worker error", e), false));
    if (!didWork) await new Promise((r) => setTimeout(r, 1000));
  }
  await closePools();
  console.log("worker stopped");
})();
