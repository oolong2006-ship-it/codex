import { createDb } from "@majlis/db";
import { loadConfig } from "./config.js";
import { DbSessionStore } from "./db-store.js";
import { buildServer } from "./server.js";
import { InMemorySessionStore } from "./sessions.js";

const config = loadConfig();
const store = process.env.DATABASE_URL
  ? new DbSessionStore(createDb(process.env.DATABASE_URL).db)
  : new InMemorySessionStore();
const app = await buildServer({ logger: true, store });
await app.listen({ port: config.port, host: "0.0.0.0" });
if (!process.env.DATABASE_URL) app.log.warn("DATABASE_URL not set: sessions are kept in memory");
if (config.devPage) app.log.warn(`dev page enabled at http://localhost:${config.port}/dev`);
