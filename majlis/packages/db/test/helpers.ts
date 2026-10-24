import type { DbHandle } from "../src/index.js";
import { isolatedTestDb } from "../src/testing.js";

export const TEST_URL = process.env.DATABASE_URL_TEST;

/** A clean, migrated database of its own. Requires DATABASE_URL_TEST (CI provides one). */
export async function freshDb(): Promise<DbHandle> {
  return isolatedTestDb(TEST_URL!, "db");
}
