import { createDb, enqueueJob, piiKeysFromEnv } from "@majlis/db";
import { createProviders } from "@majlis/providers";
import { createObjectStore } from "@majlis/storage";
import { registerHandlers } from "./handlers.js";
import { JOBS, JobRegistry } from "./jobs.js";
import { drain, runLoop } from "./runner.js";

const handle = createDb(process.env.DATABASE_URL);
const providers = createProviders();
const recordings = process.env.STORAGE_ENCRYPTION_KEY ? createObjectStore() : undefined;
const whatsappEnabled = Boolean(process.env.PII_ENCRYPTION_KEY && recordings);
const registry = new JobRegistry();
registerHandlers(registry, {
  db: handle.db,
  embedding: providers.embedding,
  ...(process.env.LLM_PROVIDER && process.env.LLM_PROVIDER !== "mock"
    ? { llm: providers.llm }
    : {}),
  personaMinSessions: Number(process.env.PERSONA_MIN_SESSIONS ?? 3),
  ...(recordings ? { recordings } : {}),
  ...(whatsappEnabled
    ? {
        whatsapp: {
          provider: providers.whatsapp,
          asr: providers.asr,
          ...(process.env.WHATSAPP_VOICE_REPLIES === "true" ? { tts: providers.tts } : {}),
          keys: piiKeysFromEnv(),
        },
      }
    : {}),
});

if (recordings) {
  // The daily retention sweep keeps itself scheduled once it has run.
  await enqueueJob(handle.db, JOBS.retentionSweep, {}, { dedupeKey: JOBS.retentionSweep });
}

if (process.argv.includes("--once")) {
  const ran = await drain(handle.db, registry);
  console.log(`[worker] ran ${ran} jobs`);
  await handle.close();
} else {
  const controller = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => controller.abort());
  }
  console.log(
    `[worker] started (embedding: ${providers.embedding.name}, recordings: ${recordings ? "on" : "off"}, whatsapp: ${whatsappEnabled ? providers.whatsapp.name : "off"})`,
  );
  await runLoop(handle.db, registry, controller.signal, {
    onResult: (r) => r === "failed" && console.error("[worker] job failed; it will be retried"),
  });
  await handle.close();
}
