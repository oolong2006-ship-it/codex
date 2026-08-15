import { prisma } from "@/lib/prisma";

/**
 * Dynamic supplier requirements. Required documents depend on the categories a
 * supplier selects, resolved through RequirementRule rows. A baseline set of
 * documents is always required regardless of category.
 */
export const BASELINE_REQUIRED_DOCS = [
  "COMMERCIAL_REGISTRATION",
  "VAT_CERTIFICATE",
  "NATIONAL_ADDRESS",
  "IBAN_CERTIFICATE",
];

export interface RequiredDoc {
  code: string;
  nameEn: string;
  nameAr: string;
  provided: boolean;
  mandatory: boolean;
}

/**
 * Given a supplier, compute the effective required-document checklist by union
 * of baseline docs and category-driven rules.
 */
export async function requiredDocumentsForSupplier(
  organizationId: string,
  supplierId: string,
): Promise<RequiredDoc[]> {
  const [supplier, docTypes] = await Promise.all([
    prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
      include: {
        categories: true,
        documents: { select: { documentTypeId: true, documentType: { select: { code: true } }, status: true } },
      },
    }),
    prisma.documentType.findMany({ where: { organizationId } }),
  ]);
  if (!supplier) return [];

  const categoryIds = supplier.categories.map((c) => c.categoryId);
  const rules = categoryIds.length
    ? await prisma.requirementRule.findMany({
        where: { organizationId, categoryId: { in: categoryIds } },
        include: { documentType: true },
      })
    : [];

  const byCode = new Map(docTypes.map((d) => [d.code, d]));
  const requiredCodes = new Map<string, boolean>(); // code -> mandatory

  for (const code of BASELINE_REQUIRED_DOCS) requiredCodes.set(code, true);
  for (const r of rules) {
    const existing = requiredCodes.get(r.documentType.code);
    requiredCodes.set(r.documentType.code, (existing ?? false) || r.mandatory);
  }

  const providedCodes = new Set(
    supplier.documents
      .filter((d) => d.status !== "REJECTED")
      .map((d) => d.documentType.code),
  );

  return [...requiredCodes.entries()].map(([code, mandatory]) => {
    const dt = byCode.get(code);
    return {
      code,
      nameEn: dt?.nameEn ?? code,
      nameAr: dt?.nameAr ?? code,
      provided: providedCodes.has(code),
      mandatory,
    };
  });
}

/**
 * Default category → required-document mapping used by the seed script to build
 * RequirementRule rows. Keyed by category slug.
 */
export const DEFAULT_CATEGORY_RULES: Record<string, string[]> = {
  "food-beverage": ["SFDA_CERTIFICATE", "ISO_CERTIFICATE", "MUNICIPALITY_LICENSE"],
  construction: ["INSURANCE", "MUNICIPALITY_LICENSE"],
  "kitchen-equipment": ["AGENCY_CERTIFICATE", "PRODUCT_CATALOG"],
  maintenance: ["INSURANCE", "MUNICIPALITY_LICENSE"],
  it: ["PRODUCT_CATALOG"],
  cleaning: ["SFDA_CERTIFICATE", "SASO_CERTIFICATE"],
  packaging: ["SASO_CERTIFICATE"],
};
