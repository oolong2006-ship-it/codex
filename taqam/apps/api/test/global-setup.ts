import 'dotenv/config';
import { execSync } from 'child_process';
import * as path from 'path';

/** Creates (if needed) and resets the e2e database, then applies all migrations. */
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL || 'postgresql://taqam:taqam_dev@localhost:5432/taqam_test?schema=public';
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
