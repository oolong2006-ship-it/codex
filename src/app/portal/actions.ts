"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthorizationError } from "@/lib/session";
import {
  companySchema,
  contactSchema,
  productSchema,
  serviceSchema,
  brandSchema,
  locationSchema,
  commercialTermsSchema,
} from "@/lib/validators";
import { recomputeSupplier } from "@/lib/supplier-service";
import { logActivity, notify } from "@/lib/activity";
import { storeFile } from "@/lib/storage";
import type { SupplierTypeEnum } from "@prisma/client";

async function requireOwnedSupplier() {
  const user = await requireUser();
  if (user.role !== "SUPPLIER") throw new AuthorizationError("Supplier account required");
  const supplier = await prisma.supplier.findFirst({
    where: { ownerUserId: user.id, organizationId: user.organizationId },
  });
  if (!supplier) throw new AuthorizationError("No supplier profile found");
  return { user, supplier };
}

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (v instanceof File) continue;
    obj[k] = v;
  }
  return obj;
}

async function refresh(supplierId: string) {
  await recomputeSupplier(supplierId);
  revalidatePath("/portal");
  revalidatePath("/portal/profile");
  revalidatePath("/portal/documents");
}

// ── Company ───────────────────────────────────────────────────
export async function updateCompanyAction(fd: FormData) {
  const { supplier, user } = await requireOwnedSupplier();
  const obj = formToObject(fd);
  obj.supplierTypes = fd.getAll("supplierTypes").map(String);
  const parsed = companySchema.safeParse(obj);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  await prisma.supplier.update({
    where: { id: supplier.id },
    data: {
      companyNameEn: d.companyNameEn,
      companyNameAr: d.companyNameAr,
      crNumber: d.crNumber || null,
      vatNumber: d.vatNumber || null,
      iban: d.iban || null,
      companyType: d.companyType || null,
      yearEstablished: d.yearEstablished ?? null,
      country: d.country,
      city: d.city || null,
      headquarters: d.headquarters || null,
      website: d.website || null,
      employeeCount: d.employeeCount || null,
      annualRevenue: d.annualRevenue || null,
      primaryPhone: d.primaryPhone || null,
      supplierTypes: d.supplierTypes as SupplierTypeEnum[],
    },
  });
  await logActivity({ organizationId: user.organizationId, actorId: user.id, supplierId: supplier.id, action: "PROFILE_EDITED", detail: "Company information" });
  await refresh(supplier.id);
  return { ok: true };
}

// ── Contacts ──────────────────────────────────────────────────
export async function addContactAction(fd: FormData) {
  const { supplier } = await requireOwnedSupplier();
  const parsed = contactSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  await prisma.supplierContact.create({ data: { supplierId: supplier.id, ...cleanContact(parsed.data) } });
  await refresh(supplier.id);
  return { ok: true };
}
export async function deleteContactAction(id: string) {
  const { supplier } = await requireOwnedSupplier();
  await prisma.supplierContact.deleteMany({ where: { id, supplierId: supplier.id } });
  await refresh(supplier.id);
  return { ok: true };
}
function cleanContact(d: { name: string; jobTitle?: string; mobile?: string; whatsapp?: string; email?: string }) {
  return { name: d.name, jobTitle: d.jobTitle || null, mobile: d.mobile || null, whatsapp: d.whatsapp || null, email: d.email || null };
}

// ── Categories ────────────────────────────────────────────────
export async function setCategoriesAction(categoryIds: string[]) {
  const { supplier, user } = await requireOwnedSupplier();
  const valid = await prisma.category.findMany({
    where: { id: { in: categoryIds }, organizationId: user.organizationId },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.supplierCategory.deleteMany({ where: { supplierId: supplier.id } }),
    ...valid.map((c, i) =>
      prisma.supplierCategory.create({ data: { supplierId: supplier.id, categoryId: c.id, isPrimary: i === 0 } }),
    ),
  ]);
  await refresh(supplier.id);
  return { ok: true };
}

// ── Products ──────────────────────────────────────────────────
export async function addProductAction(fd: FormData) {
  const { supplier } = await requireOwnedSupplier();
  const parsed = productSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  await prisma.product.create({
    data: {
      supplierId: supplier.id,
      nameEn: d.nameEn,
      nameAr: d.nameAr || null,
      sku: d.sku || null,
      brand: d.brand || null,
      model: d.model || null,
      countryOfOrigin: d.countryOfOrigin || null,
      categoryId: d.categoryId || null,
      description: d.description || null,
      specifications: d.specifications || null,
      unitOfMeasure: d.unitOfMeasure || null,
      minOrderQty: d.minOrderQty ?? null,
      leadTime: d.leadTime || null,
      warranty: d.warranty || null,
    },
  });
  await refresh(supplier.id);
  return { ok: true };
}
export async function deleteProductAction(id: string) {
  const { supplier } = await requireOwnedSupplier();
  await prisma.product.deleteMany({ where: { id, supplierId: supplier.id } });
  await refresh(supplier.id);
  return { ok: true };
}

// ── Services ──────────────────────────────────────────────────
export async function addServiceAction(fd: FormData) {
  const { supplier } = await requireOwnedSupplier();
  const obj = formToObject(fd);
  obj.citiesCovered = fd.getAll("citiesCovered").map(String);
  const parsed = serviceSchema.safeParse(obj);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  await prisma.service.create({
    data: {
      supplierId: supplier.id,
      name: d.name,
      category: d.category || null,
      description: d.description || null,
      citiesCovered: d.citiesCovered,
      sla: d.sla || null,
      experienceYears: d.experienceYears ?? null,
    },
  });
  await refresh(supplier.id);
  return { ok: true };
}
export async function deleteServiceAction(id: string) {
  const { supplier } = await requireOwnedSupplier();
  await prisma.service.deleteMany({ where: { id, supplierId: supplier.id } });
  await refresh(supplier.id);
  return { ok: true };
}

// ── Brands ────────────────────────────────────────────────────
export async function addBrandAction(fd: FormData) {
  const { supplier, user } = await requireOwnedSupplier();
  const parsed = brandSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const brand = await prisma.brand.upsert({
    where: { organizationId_name: { organizationId: user.organizationId, name: d.name } },
    update: { country: d.country || undefined },
    create: { organizationId: user.organizationId, name: d.name, country: d.country || null },
  });
  await prisma.supplierBrand.upsert({
    where: { supplierId_brandId: { supplierId: supplier.id, brandId: brand.id } },
    update: { relationship: d.relationship },
    create: { supplierId: supplier.id, brandId: brand.id, relationship: d.relationship },
  });
  await refresh(supplier.id);
  return { ok: true };
}
export async function deleteBrandAction(brandId: string) {
  const { supplier } = await requireOwnedSupplier();
  await prisma.supplierBrand.deleteMany({ where: { supplierId: supplier.id, brandId } });
  await refresh(supplier.id);
  return { ok: true };
}

// ── Locations ─────────────────────────────────────────────────
export async function addLocationAction(fd: FormData) {
  const { supplier } = await requireOwnedSupplier();
  const parsed = locationSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  await prisma.supplierLocation.create({
    data: { supplierId: supplier.id, country: d.country, region: d.region || null, city: d.city || null },
  });
  await refresh(supplier.id);
  return { ok: true };
}
export async function deleteLocationAction(id: string) {
  const { supplier } = await requireOwnedSupplier();
  await prisma.supplierLocation.deleteMany({ where: { id, supplierId: supplier.id } });
  await refresh(supplier.id);
  return { ok: true };
}

// ── Commercial terms ──────────────────────────────────────────
export async function saveCommercialTermsAction(fd: FormData) {
  const { supplier } = await requireOwnedSupplier();
  const obj = formToObject(fd);
  for (const k of ["deliveryCapability", "warehouseAvailable", "fleetAvailable", "importCapability"]) {
    obj[k] = fd.get(k) === "on" || fd.get(k) === "true";
  }
  const parsed = commercialTermsSchema.safeParse(obj);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  await prisma.supplierCommercialTerms.upsert({
    where: { supplierId: supplier.id },
    update: { ...d, paymentTerms: d.paymentTerms || null, minimumOrder: d.minimumOrder || null, deliveryLeadTime: d.deliveryLeadTime || null, creditDays: d.creditDays ?? null },
    create: { supplierId: supplier.id, ...d, paymentTerms: d.paymentTerms || null, minimumOrder: d.minimumOrder || null, deliveryLeadTime: d.deliveryLeadTime || null, creditDays: d.creditDays ?? null },
  });
  await refresh(supplier.id);
  return { ok: true };
}

// ── Documents ─────────────────────────────────────────────────
export async function uploadDocumentAction(fd: FormData) {
  const { supplier, user } = await requireOwnedSupplier();
  const file = fd.get("file");
  const documentTypeId = String(fd.get("documentTypeId") || "");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No file selected" };
  const dt = await prisma.documentType.findFirst({ where: { id: documentTypeId, organizationId: user.organizationId } });
  if (!dt) return { ok: false, error: "Invalid document type" };

  try {
    const stored = await storeFile(supplier.id, file);
    const issueDate = fd.get("issueDate") ? new Date(String(fd.get("issueDate"))) : null;
    const expiryDate = fd.get("expiryDate") ? new Date(String(fd.get("expiryDate"))) : null;
    await prisma.document.create({
      data: {
        supplierId: supplier.id,
        documentTypeId,
        fileName: stored.fileName,
        filePath: stored.filePath,
        fileSize: stored.fileSize,
        mimeType: stored.mimeType,
        documentNumber: String(fd.get("documentNumber") || "") || null,
        issueDate,
        expiryDate,
        status: "PENDING_VERIFICATION",
      },
    });
    await logActivity({ organizationId: user.organizationId, actorId: user.id, supplierId: supplier.id, action: "DOCUMENT_UPLOADED", detail: dt.nameEn });
    await refresh(supplier.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed" };
  }
}
export async function deleteDocumentAction(id: string) {
  const { supplier } = await requireOwnedSupplier();
  await prisma.document.deleteMany({ where: { id, supplierId: supplier.id } });
  await refresh(supplier.id);
  return { ok: true };
}

// ── Submit application ────────────────────────────────────────
export async function submitApplicationAction() {
  const { supplier, user } = await requireOwnedSupplier();
  if (!["REGISTERED", "PROFILE_INCOMPLETE", "REJECTED", "CONDITIONAL"].includes(supplier.status)) {
    return { ok: false, error: "Application already submitted." };
  }
  await prisma.$transaction([
    prisma.supplier.update({ where: { id: supplier.id }, data: { status: "SUBMITTED" } }),
    prisma.supplierStatusHistory.create({
      data: { supplierId: supplier.id, fromStatus: supplier.status, toStatus: "SUBMITTED", changedById: user.id, reason: "Submitted by supplier" },
    }),
  ]);
  await logActivity({ organizationId: user.organizationId, actorId: user.id, supplierId: supplier.id, action: "APPLICATION_SUBMITTED" });

  // Notify procurement admins.
  const admins = await prisma.user.findMany({
    where: { organizationId: user.organizationId, role: { in: ["SUPER_ADMIN", "PROCUREMENT_ADMIN"] } },
    select: { id: true },
  });
  await Promise.all(
    admins.map((a) =>
      notify({ organizationId: user.organizationId, userId: a.id, type: "APPLICATION_SUBMITTED", title: `New application: ${supplier.companyNameEn}`, body: supplier.supplierCode }),
    ),
  );
  revalidatePath("/portal");
  return { ok: true };
}
