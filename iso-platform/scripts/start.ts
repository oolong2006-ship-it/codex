/**
 * Production entrypoint (Render / any Docker host).
 * 1. Connects with the database OWNER url (DATABASE_OWNER_URL).
 * 2. Ensures the restricted application role `iso_app` exists (LOGIN, NOBYPASSRLS) with APP_DB_PASSWORD.
 * 3. Applies migrations as the owner.
 * 4. Starts Next.js with DATABASE_URL pointing at iso_app, so Row-Level Security always applies.
 * Refuses to start if the app role could bypass RLS.
 */
import { spawn } from "node:child_process";
import { Client } from "pg";
import { migrate } from "./migrate";

const ownerUrl = process.env.DATABASE_OWNER_URL ?? process.env.MIGRATION_DATABASE_URL;
const appPassword = process.env.APP_DB_PASSWORD;

function fail(msg: string): never {
  console.error(`[start] FATAL: ${msg}`);
  process.exit(1);
}

async function ensureAppRole(url: string, password: string) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const exists = (await c.query("SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'iso_app'")).rows[0];
    // Role names and passwords cannot be bound parameters in DDL; quote the literal safely.
    const pw = (await c.query("SELECT quote_literal($1) AS q", [password])).rows[0].q;
    try {
      if (!exists) await c.query(`CREATE ROLE iso_app LOGIN PASSWORD ${pw} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
      else await c.query(`ALTER ROLE iso_app WITH LOGIN PASSWORD ${pw}`);
    } catch (e) {
      fail(
        `cannot create/alter role iso_app (${(e as Error).message}). The database user needs CREATEROLE, ` +
          `or create the role manually: CREATE ROLE iso_app LOGIN PASSWORD '<APP_DB_PASSWORD>' NOBYPASSRLS;`,
      );
    }
    const r = (await c.query("SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'iso_app'")).rows[0];
    if (!r || r.rolbypassrls || r.rolsuper) fail("role iso_app can bypass RLS — refusing to start");
    const db = (await c.query("SELECT current_database() AS d")).rows[0].d;
    await c.query(`GRANT CONNECT ON DATABASE ${(await c.query("SELECT quote_ident($1) AS q", [db])).rows[0].q} TO iso_app`);
    const owner = (await c.query("SELECT current_user AS u")).rows[0].u;
    if (owner === "iso_app") fail("DATABASE_OWNER_URL must not use the iso_app role");
  } finally {
    await c.end();
  }
}

(async () => {
  if (!ownerUrl) fail("DATABASE_OWNER_URL is not set");
  if (!appPassword || appPassword.length < 16) fail("APP_DB_PASSWORD must be set (16+ chars)");
  await ensureAppRole(ownerUrl, appPassword);
  await migrate(ownerUrl);

  const appUrl = new URL(ownerUrl);
  appUrl.username = "iso_app";
  appUrl.password = appPassword;

  const port = process.env.PORT ?? "10000";
  console.log(`[start] migrations applied; starting web on :${port} as iso_app`);
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port, "-H", "0.0.0.0"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: appUrl.toString(), DATABASE_OWNER_URL: "", MIGRATION_DATABASE_URL: "" },
  });
  for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => child.kill(sig));
  child.on("exit", (code) => process.exit(code ?? 0));
})().catch((e) => fail((e as Error).stack ?? String(e)));
