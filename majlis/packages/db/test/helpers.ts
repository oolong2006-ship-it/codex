import { sql } from "drizzle-orm";
import { createDb, runMigrations, type DbHandle } from "../src/index.js";

export const TEST_URL = process.env.DATABASE_URL_TEST;

/** A clean, migrated database. Requires DATABASE_URL_TEST (CI provides one). */
export async function freshDb(): Promise<DbHandle> {
  const handle = createDb(TEST_URL);
  await handle.db.execute(sql`drop schema if exists public cascade`);
  await handle.db.execute(sql`drop schema if exists drizzle cascade`);
  await handle.db.execute(sql`create schema public`);
  await runMigrations(handle);
  return handle;
}
