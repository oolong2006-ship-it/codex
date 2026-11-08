import { existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Client } from "pg";

export default async function setup() {
  const envFile = path.join(__dirname, "..", ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.TEST_DATABASE_URL ?? (process.env.DATABASE_URL ?? "").replace(/\/khatm(\?|$)/, "/khatm_test$1");
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await c.end();
  execFileSync("npx", ["tsx", "scripts/migrate.ts"], { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit", cwd: path.join(__dirname, "..") });
}
