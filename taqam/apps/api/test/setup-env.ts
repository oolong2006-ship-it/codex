import 'dotenv/config';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://taqam:taqam_dev@localhost:5432/taqam_test?schema=public';
process.env.JWT_SECRET = 'e2e-secret';
process.env.RATE_LIMIT_MAX = '100000';
// Platform admin bootstrap (PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD) is exercised by admin.e2e-spec.ts.
process.env.PLATFORM_ADMIN_EMAIL = 'Platform@Test.sa';
process.env.PLATFORM_ADMIN_PASSWORD = 'Admin@2026!';
