-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "kioskFailCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "kioskFirstFailAt" TIMESTAMP(3),
ADD COLUMN     "kioskLockedUntil" TIMESTAMP(3),
ADD COLUMN     "kioskPinHash" TEXT;

-- CreateTable
CREATE TABLE "KioskDevice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KioskDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KioskDevice_tokenHash_key" ON "KioskDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "KioskDevice_companyId_revokedAt_idx" ON "KioskDevice"("companyId", "revokedAt");

-- CreateIndex
CREATE INDEX "KioskDevice_branchId_idx" ON "KioskDevice"("branchId");

-- AddForeignKey
ALTER TABLE "KioskDevice" ADD CONSTRAINT "KioskDevice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskDevice" ADD CONSTRAINT "KioskDevice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
