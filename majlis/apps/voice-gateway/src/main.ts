import { createDb } from "@majlis/db";
import { createObjectStore } from "@majlis/storage";
import { loadConfig } from "./config.js";
import { DbSessionStore } from "./db-store.js";
import { buildServer } from "./server.js";
import { InMemorySessionStore } from "./sessions.js";

const config = loadConfig();
// Recordings are kept only when encrypted storage is configured.
const recordings = process.env.STORAGE_ENCRYPTION_KEY ? createObjectStore() : undefined;
const store = process.env.DATABASE_URL
  ? new DbSessionStore(createDb(process.env.DATABASE_URL).db, recordings)
  : new InMemorySessionStore();
const app = await buildServer({ logger: true, store });
await app.listen({ port: config.port, host: "0.0.0.0" });
if (!process.env.DATABASE_URL) app.log.warn("DATABASE_URL not set: sessions are kept in memory");
if (!recordings)
  app.log.warn("STORAGE_ENCRYPTION_KEY not set: voice is transcribed but not recorded");
if (config.devPage) app.log.warn(`dev page enabled at http://localhost:${config.port}/dev`);
