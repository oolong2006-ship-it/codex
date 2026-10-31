-- Since 15 Apr 2026 only Saudis whose contracts are documented in Qiwa count for Nitaqat.
-- Existing employees start as NOT documented: the owner confirms each one (the UI explains why).
-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "qiwaDocumented" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qiwaDocumentedAt" TIMESTAMP(3);
