-- CreateEnum
CREATE TYPE "EmployeeDeviceStatus" AS ENUM ('ACTIVE', 'PENDING', 'REJECTED', 'REVOKED');

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "checkInReceivedAt" TIMESTAMP(3),
ADD COLUMN     "checkOutReceivedAt" TIMESTAMP(3),
ADD COLUMN     "flags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable: per-branch rotating-code secret (32 random bytes as 64 hex chars).
-- gen_random_uuid() is built into PostgreSQL 13+ (no pgcrypto needed) and draws from the OS CSPRNG;
-- two v4 UUIDs without dashes = 64 hex chars. Backfill each existing branch with its own secret,
-- then require it and keep the same expression as the default for new branches.
ALTER TABLE "Branch" ADD COLUMN     "codeSecret" TEXT;
UPDATE "Branch" SET "codeSecret" = replace(((gen_random_uuid())::text || (gen_random_uuid())::text), '-'::text, ''::text);
ALTER TABLE "Branch" ALTER COLUMN "codeSecret" SET NOT NULL,
ALTER COLUMN "codeSecret" SET DEFAULT replace(((gen_random_uuid())::text || (gen_random_uuid())::text), '-'::text, ''::text);

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "deviceBinding" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requireBranchCode" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EmployeeDevice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" "EmployeeDeviceStatus" NOT NULL DEFAULT 'PENDING',
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeDevice_companyId_status_idx" ON "EmployeeDevice"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDevice_employeeId_deviceId_key" ON "EmployeeDevice"("employeeId", "deviceId");

-- AddForeignKey
ALTER TABLE "EmployeeDevice" ADD CONSTRAINT "EmployeeDevice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDevice" ADD CONSTRAINT "EmployeeDevice_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
