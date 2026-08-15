import { prisma } from "@/lib/prisma";
import { computeCompleteness } from "@/lib/completeness";
import type { SupplierStatus } from "@prisma/client";

const FULL_INCLUDE = {
  contacts: true,
  categories: true,
  products: true,
  documents: { include: { documentType: true } },
  certifications: true,
} as const;

/**
 * Recompute a supplier's completeness score and, when the supplier is still in a
 * pre-submission state, keep its status in sync (REGISTERED ↔ PROFILE_INCOMPLETE).
 * Post-submission statuses (SUBMITTED and beyond) are left untouched here.
 */
export async function recomputeSupplier(supplierId: string) {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: FULL_INCLUDE,
  });
  if (!supplier) return null;

  const { score } = computeCompleteness(supplier);

  let status: SupplierStatus = supplier.status;
  if (supplier.status === "REGISTERED" || supplier.status === "PROFILE_INCOMPLETE") {
    status = score >= 100 ? "REGISTERED" : "PROFILE_INCOMPLETE";
  }

  return prisma.supplier.update({
    where: { id: supplierId },
    data: { completeness: score, status },
  });
}

/** Fetch the supplier owned by a SUPPLIER user, scoped to their tenant. */
export async function getOwnedSupplier(userId: string, organizationId: string) {
  return prisma.supplier.findFirst({
    where: { ownerUserId: userId, organizationId },
    include: FULL_INCLUDE,
  });
}

export async function getOwnedSupplierId(userId: string, organizationId: string) {
  const s = await prisma.supplier.findFirst({
    where: { ownerUserId: userId, organizationId },
    select: { id: true },
  });
  return s?.id ?? null;
}
