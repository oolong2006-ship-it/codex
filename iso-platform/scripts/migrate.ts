/* Applies db/migrations/*.sql in order, as the owner role, recording each in schema_migrations. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Client } from "pg";

export async function migrate(url = process.env.MIGRATION_DATABASE_URL) {
  if (!url) throw new Error("MIGRATION_DATABASE_URL is not set");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const dir = join(__dirname, "..", "db", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const applied = new Map<string, string>(
      (await client.query("SELECT name, sha256 FROM schema_migrations")).rows.map((r) => [r.name, r.sha256]),
    );
    for (const f of files) {
      const sql = readFileSync(join(dir, f), "utf8");
      const sha = createHash("sha256").update(sql).digest("hex");
      if (applied.has(f)) {
        if (applied.get(f) !== sha) throw new Error(`Migration ${f} was modified after being applied`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name, sha256) VALUES ($1, $2)", [f, sha]);
        await client.query("COMMIT");
        console.log(`applied ${f}`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  migrate().then(
    () => console.log("migrations up to date"),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
