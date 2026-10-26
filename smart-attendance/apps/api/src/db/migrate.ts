/**
 * مشغّل migrations بـ SQL صريح (CLAUDE.md §3).
 * 1. ينشئ دوري sa_app (خاضع لـ RLS) وsa_platform (BYPASSRLS) إن لم يوجدا.
 * 2. يطبّق db/migrations/*.sql بالترتيب، كلٌّ في معاملة، ويسجله في schema_migrations.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'db', 'migrations');

function credentials(url: string): { user: string; password: string } {
  const u = new URL(url);
  return { user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
}

async function ensureRole(client: Client, url: string, bypassRls: boolean): Promise<void> {
  const { user, password } = credentials(url);
  if (!/^[a-z_][a-z0-9_]*$/.test(user)) throw new Error(`Unsafe role name ${user}`);
  const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [user]);
  if (exists.rowCount) return;
  const lit = await client.query('SELECT quote_literal($1) AS p', [password]);
  await client.query(
    `CREATE ROLE ${user} LOGIN PASSWORD ${lit.rows[0].p} NOSUPERUSER NOCREATEDB NOCREATEROLE ${
      bypassRls ? 'BYPASSRLS' : 'NOBYPASSRLS'
    }`,
  );
}

export async function migrate(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  const ownerUrl = env.DATABASE_URL;
  const appUrl = env.DATABASE_APP_URL;
  const platformUrl = env.DATABASE_PLATFORM_URL;
  if (!ownerUrl || !appUrl || !platformUrl) {
    throw new Error('DATABASE_URL, DATABASE_APP_URL and DATABASE_PLATFORM_URL are required');
  }
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await ensureRole(client, appUrl, false);
    await ensureRole(client, platformUrl, true);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const done = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
    );
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

if (require.main === module) {
  migrate()
    .then((applied) => {
      process.stdout.write(applied.length ? `Applied: ${applied.join(', ')}\n` : 'Up to date\n');
    })
    .catch((err: Error) => {
      console.error(err.message);
      process.exit(1);
    });
}
