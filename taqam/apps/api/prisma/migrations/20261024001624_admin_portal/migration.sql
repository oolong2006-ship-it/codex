-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('PENDING', 'TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('ESSENTIALS', 'GROWTH', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "CompanyEventType" AS ENUM ('REGISTERED', 'ACTIVATED', 'SUSPENDED', 'REACTIVATED', 'PLAN_CHANGED', 'EXTENDED', 'NOTE', 'IMPERSONATED', 'EXPIRED', 'DELETED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'LOST');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "adminNotes" TEXT,
ADD COLUMN     "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "maxEmployees" INTEGER,
ADD COLUMN     "plan" "Plan" NOT NULL DEFAULT 'GROWTH',
ADD COLUMN     "pricePerEmployee" DECIMAL(10,2),
ADD COLUMN     "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "subscriptionEndsAt" TIMESTAMP(3),
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspensionReason" TEXT,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT,
ALTER COLUMN "companyId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CompanyEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyName" TEXT,
    "type" "CompanyEventType" NOT NULL,
    "fromStatus" "CompanyStatus",
    "toStatus" "CompanyStatus",
    "data" JSONB,
    "adminId" TEXT,
    "adminName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "trialDays" INTEGER NOT NULL DEFAULT 14,
    "prices" JSONB NOT NULL DEFAULT '{"ESSENTIALS":19,"GROWTH":29,"ENTERPRISE":null}',
    "annualDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyEvent_companyId_createdAt_idx" ON "CompanyEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CompanyEvent_createdAt_idx" ON "CompanyEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- Platform admins have no company; every company role must have one.
ALTER TABLE "User" ADD CONSTRAINT "User_company_role_check" CHECK (("role"::text = 'SUPER_ADMIN') = ("companyId" IS NULL));
