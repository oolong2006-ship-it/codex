-- Sector documents compliance (spec §4).
-- PostgreSQL 12+ allows ALTER TYPE ... ADD VALUE inside the migration's transaction; the new values are
-- not used in this migration (the column default is an empty array), so it applies cleanly with
-- `prisma migrate deploy` on a database holding the previous migrations + seed.
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'HEALTH_CERTIFICATE';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'PROFESSIONAL_LICENSE';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'DRIVER_CARD';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'DRIVING_LICENSE';

-- Per-employee exemptions (existing rows: none)
ALTER TABLE "Employee" ADD COLUMN     "docExemptions" "DocumentType"[] DEFAULT ARRAY[]::"DocumentType"[];
