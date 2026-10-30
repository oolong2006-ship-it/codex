-- v2.1 review fixes (docs/ADMIN_PORTAL.md "v2.1 — Review fixes"):
--   tax-invoice compliance (document types, seller/buyer snapshots, issuedAt), credit notes instead of VOID,
--   never-reused numbering (InvoiceCounter), invoices retained (FK RESTRICT), anchored periods.
-- Safe on existing production data: every new NOT NULL column is backfilled before the constraint is added,
-- VOID invoices become CREDITED with a matching credit note, and the counters start after the highest number used.

-- CreateEnum
CREATE TYPE "InvoiceDocumentType" AS ENUM ('TAX_INVOICE', 'INVOICE', 'CREDIT_NOTE');

-- AlterEnum (the new value is not used in this migration)
ALTER TYPE "CompanyEventType" ADD VALUE IF NOT EXISTS 'INVOICE_CREDITED';

-- New columns (nullable first; constraints after the backfill)
ALTER TABLE "Invoice"
  ADD COLUMN "documentType" "InvoiceDocumentType" NOT NULL DEFAULT 'TAX_INVOICE',
  ADD COLUMN "anchorDay" INTEGER,
  ADD COLUMN "issuedAt" TIMESTAMP(3),
  ADD COLUMN "seller" JSONB,
  ADD COLUMN "buyer" JSONB,
  ADD COLUMN "reason" TEXT,
  ADD COLUMN "creditsInvoiceId" TEXT,
  ADD COLUMN "creditsNumber" TEXT,
  ADD COLUMN "creditedByNumber" TEXT,
  ADD COLUMN "creditedAt" TIMESTAMP(3);

-- documentType: invoices that charged VAT were printed as tax invoices; 0% ones become plain invoices
UPDATE "Invoice" SET "documentType" = CASE WHEN "vatRate" > 0 THEN 'TAX_INVOICE'::"InvoiceDocumentType" ELSE 'INVOICE'::"InvoiceDocumentType" END;

-- issuedAt: the creation instant
UPDATE "Invoice" SET "issuedAt" = "createdAt";

-- seller snapshot: current billing settings merged with the v2 defaults (what the documents were printed with)
WITH s AS (
  SELECT COALESCE((SELECT "billing" FROM "PlatformSettings" WHERE "id" = 1), '{}'::jsonb) AS b
)
UPDATE "Invoice" SET "seller" = jsonb_build_object(
  'name',      COALESCE(CASE WHEN jsonb_typeof(s.b->'sellerName') = 'string' THEN s.b->>'sellerName' END, 'شؤون لتقنية المعلومات'),
  'nameEn',    COALESCE(CASE WHEN jsonb_typeof(s.b->'sellerNameEn') = 'string' THEN s.b->>'sellerNameEn' END, 'Shuoon IT'),
  'vatNumber', COALESCE(CASE WHEN jsonb_typeof(s.b->'sellerVatNumber') = 'string' THEN s.b->>'sellerVatNumber' END, ''),
  'crNumber',  COALESCE(CASE WHEN jsonb_typeof(s.b->'sellerCrNumber') = 'string' THEN s.b->>'sellerCrNumber' END, ''),
  'address',   COALESCE(CASE WHEN jsonb_typeof(s.b->'sellerAddress') = 'string' THEN s.b->>'sellerAddress' END, 'الرياض، المملكة العربية السعودية'),
  'email',     COALESCE(CASE WHEN jsonb_typeof(s.b->'sellerEmail') = 'string' THEN s.b->>'sellerEmail' END, 'hello@shuoon.net'),
  'phone',     COALESCE(CASE WHEN jsonb_typeof(s.b->'sellerPhone') = 'string' THEN s.b->>'sellerPhone' END, '+966 55 042 1235'),
  'bankName',  COALESCE(CASE WHEN jsonb_typeof(s.b->'bankName') = 'string' THEN s.b->>'bankName' END, ''),
  'iban',      COALESCE(CASE WHEN jsonb_typeof(s.b->'iban') = 'string' THEN s.b->>'iban' END, '')
) FROM s;

-- buyer snapshot: the name stored at issue + the company's current registration data
UPDATE "Invoice" i SET "buyer" = jsonb_build_object(
  'nameAr',    i."companyName",
  'nameEn',    c."nameEn",
  'vatNumber', c."vatNumber",
  'crNumber',  c."crNumber",
  'address',   NULL,
  'city',      c."city"
) FROM "Company" c WHERE c."id" = i."companyId";
UPDATE "Invoice" SET "buyer" = jsonb_build_object('nameAr', "companyName", 'nameEn', NULL, 'vatNumber', NULL, 'crNumber', NULL, 'address', NULL, 'city', NULL)
WHERE "buyer" IS NULL;

-- InvoiceStatus: VOID → CREDITED
CREATE TYPE "InvoiceStatus_new" AS ENUM ('ISSUED', 'PAID', 'CREDITED');
ALTER TABLE "Invoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "status" TYPE "InvoiceStatus_new"
  USING (CASE WHEN "status"::text = 'VOID' THEN 'CREDITED' ELSE "status"::text END)::"InvoiceStatus_new";
ALTER TYPE "InvoiceStatus" RENAME TO "InvoiceStatus_old";
ALTER TYPE "InvoiceStatus_new" RENAME TO "InvoiceStatus";
DROP TYPE "InvoiceStatus_old";
ALTER TABLE "Invoice" ALTER COLUMN "status" SET DEFAULT 'ISSUED';

-- A credit note (SHC-<year>-<seq>) for every formerly VOID invoice, numbered in void order per Riyadh year
CREATE TEMP TABLE "_v21_credits" AS
SELECT
  i."id" AS orig_id,
  gen_random_uuid()::text AS cn_id,
  GREATEST(COALESCE(i."voidedAt", i."updatedAt"), i."createdAt") AS at,
  EXTRACT(YEAR FROM (GREATEST(COALESCE(i."voidedAt", i."updatedAt"), i."createdAt") AT TIME ZONE 'UTC' + INTERVAL '3 hours'))::int AS yr,
  ((GREATEST(COALESCE(i."voidedAt", i."updatedAt"), i."createdAt") AT TIME ZONE 'UTC' + INTERVAL '3 hours'))::date AS issue_day
FROM "Invoice" i
WHERE i."status" = 'CREDITED' AND i."documentType" <> 'CREDIT_NOTE';

ALTER TABLE "_v21_credits" ADD COLUMN seq int;
UPDATE "_v21_credits" t SET seq = r.rn
FROM (SELECT orig_id, row_number() OVER (PARTITION BY yr ORDER BY at, orig_id) AS rn FROM "_v21_credits") r
WHERE r.orig_id = t.orig_id;

INSERT INTO "Invoice" (
  "id", "number", "documentType", "companyId", "companyName", "status", "plan", "billingCycle",
  "periodStart", "periodEnd", "anchorDay", "months", "employees", "unitPrice", "subtotal", "discountRate", "discount",
  "taxable", "vatRate", "vat", "total", "issueDate", "issuedAt", "dueDate", "seller", "buyer", "notes", "reason",
  "creditsInvoiceId", "creditsNumber", "createdById", "createdByName", "createdAt", "updatedAt"
)
SELECT
  t.cn_id, 'SHC-' || t.yr || '-' || lpad(t.seq::text, 4, '0'), 'CREDIT_NOTE', i."companyId", i."companyName", 'ISSUED', i."plan", i."billingCycle",
  i."periodStart", i."periodEnd", i."anchorDay", i."months", i."employees", i."unitPrice", i."subtotal", i."discountRate", i."discount",
  i."taxable", i."vatRate", i."vat", i."total", t.issue_day, t.at, t.issue_day, i."seller", i."buyer", NULL,
  COALESCE(NULLIF(btrim(i."voidReason"), ''), 'إلغاء سابق (قبل v2.1)'),
  i."id", i."number", NULL, 'ترحيل النظام', t.at, CURRENT_TIMESTAMP
FROM "_v21_credits" t JOIN "Invoice" i ON i."id" = t.orig_id;

UPDATE "Invoice" i SET
  "creditedByNumber" = 'SHC-' || t.yr || '-' || lpad(t.seq::text, 4, '0'),
  "creditedAt" = t.at,
  "reason" = COALESCE(NULLIF(btrim(i."voidReason"), ''), 'إلغاء سابق (قبل v2.1)')
FROM "_v21_credits" t WHERE i."id" = t.orig_id;

DROP TABLE "_v21_credits";

-- Drop the v2 void columns (moved to reason / creditedAt)
ALTER TABLE "Invoice" DROP COLUMN "voidReason", DROP COLUMN "voidedAt";

-- Constraints after the backfill
ALTER TABLE "Invoice" ALTER COLUMN "issuedAt" SET NOT NULL, ALTER COLUMN "issuedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Invoice" ALTER COLUMN "seller" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "buyer" SET NOT NULL;

-- CreateTable: per-series, per-year counters
CREATE TABLE "InvoiceCounter" (
    "series" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("series","year")
);

-- Seed the counters from the highest numbers already used, so no number is ever reused
INSERT INTO "InvoiceCounter" ("series", "year", "last")
SELECT m[1], m[2]::int, MAX(m[3]::int)
FROM (SELECT regexp_match("number", '^(SH|SHC)-([0-9]{4})-([0-9]+)$') AS m FROM "Invoice") x
WHERE m IS NOT NULL
GROUP BY m[1], m[2];

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_creditsInvoiceId_key" ON "Invoice"("creditsInvoiceId");

-- Foreign keys: invoices are retained (a company with invoices cannot be deleted)
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_companyId_fkey";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_creditsInvoiceId_fkey" FOREIGN KEY ("creditsInvoiceId") REFERENCES "Invoice"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
