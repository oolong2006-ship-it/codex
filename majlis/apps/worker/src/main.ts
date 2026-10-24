import { createDb } from "@majlis/db";
import { createProviders } from "@majlis/providers";
import { registerHandlers } from "./handlers.js";
import { JobRegistry } from "./jobs.js";
import { drain, runLoop } from "./runner.js";

const handle = createDb(process.env.DATABASE_URL);
const providers = createProviders();
const registry = new JobRegistry();
registerHandlers(registry, {
  db: handle.db,
  embedding: providers.embedding,
  ...(process.env.LLM_PROVIDER && process.env.LLM_PROVIDER !== "mock"
    ? { llm: providers.llm }
    : {}),
  personaMinSessions: Number(process.env.PERSONA_MIN_SESSIONS ?? 3),
});

if (process.argv.includes("--once")) {
  const ran = await drain(handle.db, registry);
  console.log(`[worker] ran ${ran} jobs`);
  await handle.close();
} else {
  const controller = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => controller.abort());
  }
  console.log(`[worker] started (embedding: ${providers.embedding.name})`);
  await runLoop(handle.db, registry, controller.signal, {
    onResult: (r) => r === "failed" && console.error("[worker] job failed; it will be retried"),
  });
  await handle.close();
}
