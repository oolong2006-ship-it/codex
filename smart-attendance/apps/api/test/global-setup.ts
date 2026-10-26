import { Client } from 'pg';
import { migrate } from '../src/db/migrate';
import { seed } from '../src/db/seed';
import { adminUrl, testDbName, testEnv } from './env';

/** قاعدة نظيفة لكل تشغيل: drop → create → migrations → seed. */
export default async function globalSetup(): Promise<void> {
  const name = testDbName();
  if (!/^[a-z0-9_]+_test$/.test(name)) throw new Error(`Refusing to reset non-test database ${name}`);
  const admin = new Client({ connectionString: adminUrl() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  const env = testEnv();
  await migrate(env);
  await seed(env);
}
