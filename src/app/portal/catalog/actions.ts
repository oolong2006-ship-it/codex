"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthorizationError } from "@/lib/session";
import { storeFile } from "@/lib/storage";
import { extractText } from "@/lib/text-extract";
import { extractProductsFromText, aiEnabled } from "@/lib/ai";
import { recomputeSupplier } from "@/lib/supplier-service";
import { logActivity } from "@/lib/activity";

async function requireOwnedSupplier() {
  const user = await requireUser();
  if (user.role !== "SUPPLIER") throw new AuthorizationError("Supplier account required");
  const supplier = await prisma.supplier.findFirst({ where: { ownerUserId: user.id, organizationId: user.organizationId } });
  if (!supplier) throw new AuthorizationError("No supplier profile found");
  return { user, supplier };
}

/**
 * Upload a catalog (or paste text), run AI extraction, and persist the results
 * to an AiExtractionJob in NEEDS_REVIEW state. Extracted products are NOT written
 * to the live catalog until a human approves them.
 */
export async function runCatalogExtractionAction(fd: FormData) {
  const { user, supplier } = await requireOwnedSupplier();
  const pastedText = String(fd.get("text") || "").trim();
  const file = fd.get("file");

  let text = pastedText;
  let uploadId: string | null = null;

  if (file instanceof File && file.size > 0) {
    try {
      const stored = await storeFile(supplier.id, file);
      const upload = await prisma.catalogUpload.create({
        data: { supplierId: supplier.id, fileName: stored.fileName, filePath: stored.filePath, mimeType: stored.mimeType },
      });
      uploadId = upload.id;
      const buf = Buffer.from(await file.arrayBuffer());
      const extracted = extractText(buf, stored.mimeType, stored.fileName);
      if (extracted.trim().length > text.length) text = extracted;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Upload failed" };
    }
  }

  if (text.trim().length < 10) {
    return { ok: false, error: "Provide catalog text or a readable file." };
  }

  const job = await prisma.aiExtractionJob.create({
    data: { supplierId: supplier.id, catalogUploadId: uploadId, type: "CATALOG_EXTRACTION", status: "PROCESSING", model: aiEnabled() ? (process.env.ANTHROPIC_MODEL || "claude") : "heuristic" },
  });

  try {
    const products = await extractProductsFromText(text);
    await prisma.$transaction([
      prisma.aiExtractionJob.update({ where: { id: job.id }, data: { status: "NEEDS_REVIEW", rawResult: products as unknown as object } }),
      ...products.map((p) =>
        prisma.aiExtractedProduct.create({
          data: {
            jobId: job.id,
            nameEn: p.nameEn ?? null,
            nameAr: p.nameAr ?? null,
            brand: p.brand ?? null,
            model: p.model ?? null,
            category: p.category ?? null,
            subcategory: p.subcategory ?? null,
            description: p.description ?? null,
            specifications: p.specifications ?? null,
            countryOfOrigin: p.countryOfOrigin ?? null,
            unit: p.unit ?? null,
            confidence: p.confidence ?? null,
          },
        }),
      ),
    ]);
    await logActivity({ organizationId: user.organizationId, actorId: user.id, supplierId: supplier.id, action: "CATALOG_UPLOADED", detail: `${products.length} products extracted for review` });
    revalidatePath("/portal/catalog");
    return { ok: true, jobId: job.id, count: products.length };
  } catch (e) {
    await prisma.aiExtractionJob.update({ where: { id: job.id }, data: { status: "FAILED", error: e instanceof Error ? e.message : "AI error" } });
    return { ok: false, error: "Extraction failed" };
  }
}

/** Human approval: promote a reviewed AI product into the live catalog. */
export async function approveExtractedProductAction(id: string) {
  const { supplier } = await requireOwnedSupplier();
  const ep = await prisma.aiExtractedProduct.findFirst({ where: { id, job: { supplierId: supplier.id } } });
  if (!ep) return { ok: false, error: "Not found" };
  if (!ep.approved) {
    await prisma.$transaction([
      prisma.product.create({
        data: {
          supplierId: supplier.id,
          nameEn: ep.nameEn || "Untitled product",
          nameAr: ep.nameAr,
          brand: ep.brand,
          model: ep.model,
          countryOfOrigin: ep.countryOfOrigin,
          description: ep.description,
          specifications: ep.specifications,
          unitOfMeasure: ep.unit,
          source: "AI",
        },
      }),
      prisma.aiExtractedProduct.update({ where: { id }, data: { approved: true } }),
    ]);
    await recomputeSupplier(supplier.id);
  }
  revalidatePath("/portal/catalog");
  return { ok: true };
}

export async function discardExtractedProductAction(id: string) {
  const { supplier } = await requireOwnedSupplier();
  await prisma.aiExtractedProduct.deleteMany({ where: { id, job: { supplierId: supplier.id } } });
  revalidatePath("/portal/catalog");
  return { ok: true };
}
