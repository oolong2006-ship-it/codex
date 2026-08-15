-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'PROCUREMENT_ADMIN', 'PROCUREMENT_USER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('REGISTERED', 'PROFILE_INCOMPLETE', 'SUBMITTED', 'UNDER_REVIEW', 'PREQUALIFIED', 'APPROVED', 'CONDITIONAL', 'REJECTED', 'SUSPENDED', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "SupplierTypeEnum" AS ENUM ('MANUFACTURER', 'AUTHORIZED_AGENT', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER', 'SERVICE_PROVIDER', 'CONTRACTOR', 'IMPORTER');

-- CreateEnum
CREATE TYPE "BrandRelationship" AS ENUM ('MANUFACTURER', 'AGENT', 'DISTRIBUTOR', 'RESELLER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING_VERIFICATION', 'VALID', 'EXPIRING_SOON', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EvaluationOutcome" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "AiJobType" AS ENUM ('CATALOG_EXTRACTION', 'SUPPLIER_CLASSIFICATION');

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'NEEDS_REVIEW', 'APPROVED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('APPLICATION_SUBMITTED', 'APPLICATION_APPROVED', 'APPLICATION_REJECTED', 'DOCUMENT_EXPIRING', 'MISSING_DOCUMENTS', 'PROFILE_INCOMPLETE', 'DOCUMENT_REJECTED', 'REQUEST_FOR_INFORMATION');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentId" TEXT,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierCode" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "companyNameEn" TEXT NOT NULL,
    "companyNameAr" TEXT NOT NULL,
    "crNumber" TEXT,
    "vatNumber" TEXT,
    "iban" TEXT,
    "companyType" TEXT,
    "yearEstablished" INTEGER,
    "country" TEXT NOT NULL DEFAULT 'Saudi Arabia',
    "city" TEXT,
    "headquarters" TEXT,
    "website" TEXT,
    "employeeCount" TEXT,
    "annualRevenue" TEXT,
    "logoUrl" TEXT,
    "emailDomain" TEXT,
    "primaryPhone" TEXT,
    "supplierTypes" "SupplierTypeEnum"[],
    "status" "SupplierStatus" NOT NULL DEFAULT 'REGISTERED',
    "completeness" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION,
    "aiPrimaryCategory" TEXT,
    "aiKeywords" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_contacts" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobTitle" TEXT,
    "mobile" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "supplier_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_categories" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "supplier_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "categoryId" TEXT,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT,
    "sku" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "countryOfOrigin" TEXT,
    "description" TEXT,
    "specifications" TEXT,
    "unitOfMeasure" TEXT,
    "minOrderQty" INTEGER,
    "leadTime" TEXT,
    "warranty" TEXT,
    "imageUrl" TEXT,
    "catalogRef" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "citiesCovered" TEXT[],
    "sla" TEXT,
    "experienceYears" INTEGER,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_brands" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "relationship" "BrandRelationship" NOT NULL,
    "certificateDocId" TEXT,

    CONSTRAINT "supplier_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_locations" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "city" TEXT,

    CONSTRAINT "supplier_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "hasExpiry" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "documentNumber" TEXT,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_certifications" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "number" TEXT,
    "expiryDate" TIMESTAMP(3),

    CONSTRAINT "supplier_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_commercial_terms" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "paymentTerms" TEXT,
    "creditDays" INTEGER,
    "minimumOrder" TEXT,
    "deliveryLeadTime" TEXT,
    "deliveryCapability" BOOLEAN NOT NULL DEFAULT false,
    "warehouseAvailable" BOOLEAN NOT NULL DEFAULT false,
    "fleetAvailable" BOOLEAN NOT NULL DEFAULT false,
    "importCapability" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "supplier_commercial_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_status_history" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "fromStatus" "SupplierStatus",
    "toStatus" "SupplierStatus" NOT NULL,
    "reason" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_notes" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_evaluations" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "outcome" "EvaluationOutcome" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "supplierId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_uploads" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_extraction_jobs" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "catalogUploadId" TEXT,
    "type" "AiJobType" NOT NULL DEFAULT 'CATALOG_EXTRACTION',
    "status" "AiJobStatus" NOT NULL DEFAULT 'PENDING',
    "model" TEXT,
    "rawResult" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_extraction_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_extracted_products" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "nameEn" TEXT,
    "nameAr" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "category" TEXT,
    "subcategory" TEXT,
    "description" TEXT,
    "specifications" TEXT,
    "countryOfOrigin" TEXT,
    "unit" TEXT,
    "confidence" DOUBLE PRECISION,
    "approved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ai_extracted_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlists" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "project" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shortlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlist_suppliers" (
    "id" TEXT NOT NULL,
    "shortlistId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,

    CONSTRAINT "shortlist_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "requirement_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "users_organizationId_email_key" ON "users"("organizationId", "email");

-- CreateIndex
CREATE INDEX "categories_organizationId_parentId_idx" ON "categories"("organizationId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_organizationId_slug_key" ON "categories"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_ownerUserId_key" ON "suppliers"("ownerUserId");

-- CreateIndex
CREATE INDEX "suppliers_organizationId_status_idx" ON "suppliers"("organizationId", "status");

-- CreateIndex
CREATE INDEX "suppliers_organizationId_crNumber_idx" ON "suppliers"("organizationId", "crNumber");

-- CreateIndex
CREATE INDEX "suppliers_organizationId_vatNumber_idx" ON "suppliers"("organizationId", "vatNumber");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_organizationId_supplierCode_key" ON "suppliers"("organizationId", "supplierCode");

-- CreateIndex
CREATE INDEX "supplier_contacts_supplierId_idx" ON "supplier_contacts"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_categories_categoryId_idx" ON "supplier_categories"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_categories_supplierId_categoryId_key" ON "supplier_categories"("supplierId", "categoryId");

-- CreateIndex
CREATE INDEX "products_supplierId_idx" ON "products"("supplierId");

-- CreateIndex
CREATE INDEX "services_supplierId_idx" ON "services"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "brands_organizationId_name_key" ON "brands"("organizationId", "name");

-- CreateIndex
CREATE INDEX "supplier_brands_brandId_idx" ON "supplier_brands"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_brands_supplierId_brandId_key" ON "supplier_brands"("supplierId", "brandId");

-- CreateIndex
CREATE INDEX "supplier_locations_supplierId_idx" ON "supplier_locations"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_organizationId_code_key" ON "document_types"("organizationId", "code");

-- CreateIndex
CREATE INDEX "documents_supplierId_idx" ON "documents"("supplierId");

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- CreateIndex
CREATE INDEX "documents_expiryDate_idx" ON "documents"("expiryDate");

-- CreateIndex
CREATE INDEX "supplier_certifications_supplierId_idx" ON "supplier_certifications"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_commercial_terms_supplierId_key" ON "supplier_commercial_terms"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_status_history_supplierId_idx" ON "supplier_status_history"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_notes_supplierId_idx" ON "supplier_notes"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_evaluations_supplierId_idx" ON "supplier_evaluations"("supplierId");

-- CreateIndex
CREATE INDEX "activity_logs_organizationId_createdAt_idx" ON "activity_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_supplierId_idx" ON "activity_logs"("supplierId");

-- CreateIndex
CREATE INDEX "catalog_uploads_supplierId_idx" ON "catalog_uploads"("supplierId");

-- CreateIndex
CREATE INDEX "ai_extraction_jobs_supplierId_idx" ON "ai_extraction_jobs"("supplierId");

-- CreateIndex
CREATE INDEX "ai_extracted_products_jobId_idx" ON "ai_extracted_products"("jobId");

-- CreateIndex
CREATE INDEX "shortlists_organizationId_idx" ON "shortlists"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "shortlist_suppliers_shortlistId_supplierId_key" ON "shortlist_suppliers"("shortlistId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_rules_categoryId_documentTypeId_key" ON "requirement_rules"("categoryId", "documentTypeId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_contacts" ADD CONSTRAINT "supplier_contacts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_categories" ADD CONSTRAINT "supplier_categories_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_categories" ADD CONSTRAINT "supplier_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_brands" ADD CONSTRAINT "supplier_brands_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_brands" ADD CONSTRAINT "supplier_brands_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_locations" ADD CONSTRAINT "supplier_locations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_types" ADD CONSTRAINT "document_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_certifications" ADD CONSTRAINT "supplier_certifications_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_commercial_terms" ADD CONSTRAINT "supplier_commercial_terms_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_status_history" ADD CONSTRAINT "supplier_status_history_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_status_history" ADD CONSTRAINT "supplier_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_notes" ADD CONSTRAINT "supplier_notes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_notes" ADD CONSTRAINT "supplier_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_evaluations" ADD CONSTRAINT "supplier_evaluations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_evaluations" ADD CONSTRAINT "supplier_evaluations_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_uploads" ADD CONSTRAINT "catalog_uploads_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_extraction_jobs" ADD CONSTRAINT "ai_extraction_jobs_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_extraction_jobs" ADD CONSTRAINT "ai_extraction_jobs_catalogUploadId_fkey" FOREIGN KEY ("catalogUploadId") REFERENCES "catalog_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_extracted_products" ADD CONSTRAINT "ai_extracted_products_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ai_extraction_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_suppliers" ADD CONSTRAINT "shortlist_suppliers_shortlistId_fkey" FOREIGN KEY ("shortlistId") REFERENCES "shortlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_suppliers" ADD CONSTRAINT "shortlist_suppliers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_rules" ADD CONSTRAINT "requirement_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_rules" ADD CONSTRAINT "requirement_rules_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_rules" ADD CONSTRAINT "requirement_rules_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "document_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
