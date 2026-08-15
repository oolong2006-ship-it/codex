"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getDefaultOrganization, nextSupplierCode } from "@/lib/tenant";
import { registerSchema } from "@/lib/validators";
import { detectDuplicates } from "@/lib/duplicate";
import { recomputeSupplier } from "@/lib/supplier-service";
import { logActivity } from "@/lib/activity";
import type { SupplierTypeEnum } from "@prisma/client";

export interface RegisterResult {
  ok: boolean;
  error?: string;
  supplierCode?: string;
  duplicates?: { companyName: string; supplierCode: string; score: number; reasons: string[] }[];
}

/**
 * Public supplier self-registration. Creates the SUPPLIER user + supplier
 * profile in one transaction, after screening for duplicates. Returns the
 * detected duplicates (without blocking) so the UI can warn — mirroring the
 * "do not auto-create duplicates" rule while still letting genuine new
 * suppliers through.
 */
export async function registerSupplierAction(
  raw: unknown,
  force = false,
): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  const email = data.email.toLowerCase().trim();
  const emailDomain = email.split("@")[1] ?? null;

  const org = await getDefaultOrganization();

  // Unique email within tenant
  const existingUser = await prisma.user.findFirst({
    where: { organizationId: org.id, email },
  });
  if (existingUser) {
    return { ok: false, error: "An account with this email already exists." };
  }

  // Duplicate supplier screening
  const duplicates = await detectDuplicates({
    organizationId: org.id,
    companyNameEn: data.companyNameEn,
    companyNameAr: data.companyNameAr,
    crNumber: data.crNumber || null,
    vatNumber: data.vatNumber || null,
    emailDomain,
    primaryPhone: data.mobile,
  });
  const hardBlock = duplicates.some((d) => d.score >= 100);
  if (duplicates.length > 0 && !force && hardBlock) {
    return {
      ok: false,
      error: "A supplier with the same CR/VAT already exists.",
      duplicates: duplicates.map((d) => ({
        companyName: d.companyName,
        supplierCode: d.supplierCode,
        score: d.score,
        reasons: d.reasons,
      })),
    };
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const code = await nextSupplierCode(org.id);

  const supplier = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        organizationId: org.id,
        email,
        passwordHash,
        name: data.contactName,
        role: "SUPPLIER",
      },
    });

    const created = await tx.supplier.create({
      data: {
        organizationId: org.id,
        ownerUserId: user.id,
        supplierCode: code,
        companyNameEn: data.companyNameEn,
        companyNameAr: data.companyNameAr,
        crNumber: data.crNumber || null,
        vatNumber: data.vatNumber || null,
        companyType: data.companyType || null,
        yearEstablished: data.yearEstablished ?? null,
        city: data.city || null,
        website: data.website || null,
        employeeCount: data.employeeCount || null,
        emailDomain,
        primaryPhone: data.mobile,
        supplierTypes: (data.supplierTypes as SupplierTypeEnum[]) ?? [],
        status: "REGISTERED",
        contacts: {
          create: {
            name: data.contactName,
            jobTitle: data.contactJobTitle || null,
            email: data.contactEmail || email,
            mobile: data.mobile,
            isPrimary: true,
          },
        },
        ...(data.categoryIds.length
          ? {
              categories: {
                create: data.categoryIds.map((categoryId, i) => ({
                  categoryId,
                  isPrimary: i === 0,
                })),
              },
            }
          : {}),
      },
    });
    return created;
  });

  await recomputeSupplier(supplier.id);
  await logActivity({
    organizationId: org.id,
    supplierId: supplier.id,
    action: "SUPPLIER_REGISTERED",
    detail: `${data.companyNameEn} (${code})`,
  });

  return { ok: true, supplierCode: code };
}
