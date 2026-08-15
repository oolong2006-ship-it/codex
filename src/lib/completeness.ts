import type { Prisma } from "@prisma/client";

/**
 * Weighted profile completeness score. Weights sum to 100.
 * Mirrors the business spec (Company 15, Contact 10, CR/VAT/IBAN/Profile/Catalog/
 * Categories/Products 10 each, Certificates 5).
 */
export const COMPLETENESS_WEIGHTS = {
  company: 15,
  contact: 10,
  cr: 10,
  vat: 10,
  iban: 10,
  companyProfile: 10,
  catalog: 10,
  categories: 10,
  products: 10,
  certificates: 5,
} as const;

export type CompletenessInput = Prisma.SupplierGetPayload<{
  include: {
    contacts: true;
    categories: true;
    products: true;
    documents: { include: { documentType: true } };
    certifications: true;
  };
}>;

export interface CompletenessResult {
  score: number;
  missing: { key: string; en: string; ar: string }[];
}

function hasDoc(s: CompletenessInput, code: string): boolean {
  return s.documents.some(
    (d) => d.documentType.code === code && d.status !== "REJECTED",
  );
}

export function computeCompleteness(s: CompletenessInput): CompletenessResult {
  const checks: {
    key: keyof typeof COMPLETENESS_WEIGHTS;
    ok: boolean;
    en: string;
    ar: string;
  }[] = [
    {
      key: "company",
      ok: Boolean(s.companyNameEn && s.companyNameAr && s.companyType && s.city),
      en: "Company Information",
      ar: "بيانات الشركة",
    },
    {
      key: "contact",
      ok: s.contacts.length > 0,
      en: "Contact Information",
      ar: "بيانات التواصل",
    },
    { key: "cr", ok: Boolean(s.crNumber) && hasDoc(s, "COMMERCIAL_REGISTRATION"), en: "Commercial Registration", ar: "السجل التجاري" },
    { key: "vat", ok: Boolean(s.vatNumber) && hasDoc(s, "VAT_CERTIFICATE"), en: "VAT Certificate", ar: "شهادة الضريبة" },
    { key: "iban", ok: Boolean(s.iban) && hasDoc(s, "IBAN_CERTIFICATE"), en: "Bank / IBAN Information", ar: "بيانات الآيبان" },
    { key: "companyProfile", ok: hasDoc(s, "COMPANY_PROFILE"), en: "Company Profile", ar: "الملف التعريفي" },
    { key: "catalog", ok: hasDoc(s, "PRODUCT_CATALOG"), en: "Product Catalog", ar: "كتالوج المنتجات" },
    { key: "categories", ok: s.categories.length > 0, en: "Categories", ar: "التصنيفات" },
    { key: "products", ok: s.products.length > 0, en: "Products", ar: "المنتجات" },
    { key: "certificates", ok: s.certifications.length > 0 || hasDoc(s, "ISO_CERTIFICATE"), en: "Certificates", ar: "الشهادات" },
  ];

  let score = 0;
  const missing: CompletenessResult["missing"] = [];
  for (const c of checks) {
    if (c.ok) score += COMPLETENESS_WEIGHTS[c.key];
    else missing.push({ key: c.key, en: c.en, ar: c.ar });
  }
  return { score: Math.min(100, score), missing };
}
