import { Client } from "pg";
import { migrate } from "../scripts/migrate";

export default async function setup() {
  const url = process.env.TEST_MIGRATION_DATABASE_URL ?? "postgresql://iso_owner:iso_owner_dev@localhost:5432/iso_platform_test";
  await migrate(url);
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query("TRUNCATE users, organizations, login_attempts, license_grants RESTART IDENTITY CASCADE");
  await c.end();
}
