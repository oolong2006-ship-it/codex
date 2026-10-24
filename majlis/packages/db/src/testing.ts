import pg from "pg";
import { createDb, runMigrations, type DbHandle } from "./client.js";

/**
 * Creates (or recreates) a dedicated, migrated database for one test suite, so
 * suites running in parallel never wipe each other's data. Test use only: it
 * refuses database names that do not end in "_test".
 */
export async function isolatedTestDb(
  baseUrl: string,
  suffix: string,
): Promise<DbHandle & { url: string }> {
  const url = new URL(baseUrl);
  const name =
    `${url.pathname.slice(1)}_${suffix}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase() + "_test";
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await admin.query(`drop database if exists "${name}" with (force)`);
    await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  url.pathname = `/${name}`;
  const handle = createDb(url.toString());
  await runMigrations(handle);
  return { ...handle, url: url.toString() };
}
