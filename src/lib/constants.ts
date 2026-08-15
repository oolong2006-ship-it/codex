import type {
  SupplierStatus,
  SupplierTypeEnum,
  DocumentStatus,
} from "@prisma/client";

// ── Saudi geography ───────────────────────────────────────────
export const SAUDI_REGIONS = [
  "Riyadh",
  "Makkah",
  "Madinah",
  "Eastern Province",
  "Asir",
  "Tabuk",
  "Qassim",
  "Hail",
  "Najran",
  "Jazan",
  "Al Bahah",
  "Al Jouf",
  "Northern Borders",
] as const;

export const SAUDI_CITIES = [
  "Riyadh",
  "Jeddah",
  "Makkah",
  "Madinah",
  "Dammam",
  "Khobar",
  "Dhahran",
  "Jubail",
  "Taif",
  "Tabuk",
  "Buraidah",
  "Hail",
  "Abha",
  "Najran",
  "Jazan",
  "Yanbu",
  "Al Ahsa",
  "Khamis Mushait",
] as const;

// ── Supplier types ────────────────────────────────────────────
export const SUPPLIER_TYPES: { value: SupplierTypeEnum; en: string; ar: string }[] = [
  { value: "MANUFACTURER", en: "Manufacturer", ar: "مصنّع" },
  { value: "AUTHORIZED_AGENT", en: "Authorized Agent", ar: "وكيل معتمد" },
  { value: "DISTRIBUTOR", en: "Distributor", ar: "موزّع" },
  { value: "WHOLESALER", en: "Wholesaler", ar: "تاجر جملة" },
  { value: "RETAILER", en: "Retailer", ar: "تاجر تجزئة" },
  { value: "SERVICE_PROVIDER", en: "Service Provider", ar: "مزوّد خدمة" },
  { value: "CONTRACTOR", en: "Contractor", ar: "مقاول" },
  { value: "IMPORTER", en: "Importer", ar: "مستورد" },
];

// ── Supplier status metadata (label + badge tone) ─────────────
export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

export const SUPPLIER_STATUS_META: Record<
  SupplierStatus,
  { en: string; ar: string; tone: BadgeTone }
> = {
  REGISTERED: { en: "Registered", ar: "مُسجّل", tone: "neutral" },
  PROFILE_INCOMPLETE: { en: "Profile Incomplete", ar: "ملف غير مكتمل", tone: "warning" },
  SUBMITTED: { en: "Submitted", ar: "تم الإرسال", tone: "info" },
  UNDER_REVIEW: { en: "Under Review", ar: "قيد المراجعة", tone: "info" },
  PREQUALIFIED: { en: "Prequalified", ar: "مؤهّل مبدئياً", tone: "info" },
  APPROVED: { en: "Approved", ar: "معتمد", tone: "success" },
  CONDITIONAL: { en: "Conditional", ar: "اعتماد مشروط", tone: "warning" },
  REJECTED: { en: "Rejected", ar: "مرفوض", tone: "danger" },
  SUSPENDED: { en: "Suspended", ar: "موقوف", tone: "danger" },
  BLACKLISTED: { en: "Blacklisted", ar: "قائمة سوداء", tone: "danger" },
};

export const DOCUMENT_STATUS_META: Record<
  DocumentStatus,
  { en: string; ar: string; tone: BadgeTone }
> = {
  PENDING_VERIFICATION: { en: "Pending Verification", ar: "بانتظار التحقق", tone: "neutral" },
  VALID: { en: "Valid", ar: "ساري", tone: "success" },
  EXPIRING_SOON: { en: "Expiring Soon", ar: "قارب على الانتهاء", tone: "warning" },
  EXPIRED: { en: "Expired", ar: "منتهي", tone: "danger" },
  REJECTED: { en: "Rejected", ar: "مرفوض", tone: "danger" },
};

// ── Document types (seeded per organization) ──────────────────
export const DOCUMENT_TYPES: {
  code: string;
  en: string;
  ar: string;
  hasExpiry: boolean;
}[] = [
  { code: "COMMERCIAL_REGISTRATION", en: "Commercial Registration", ar: "السجل التجاري", hasExpiry: true },
  { code: "VAT_CERTIFICATE", en: "VAT Certificate", ar: "شهادة ضريبة القيمة المضافة", hasExpiry: false },
  { code: "NATIONAL_ADDRESS", en: "National Address", ar: "العنوان الوطني", hasExpiry: false },
  { code: "IBAN_CERTIFICATE", en: "IBAN Certificate", ar: "شهادة الآيبان", hasExpiry: false },
  { code: "COMPANY_PROFILE", en: "Company Profile", ar: "الملف التعريفي", hasExpiry: false },
  { code: "PRODUCT_CATALOG", en: "Product Catalog", ar: "كتالوج المنتجات", hasExpiry: false },
  { code: "ISO_CERTIFICATE", en: "ISO Certificate", ar: "شهادة الأيزو", hasExpiry: true },
  { code: "SFDA_CERTIFICATE", en: "SFDA Certificate", ar: "شهادة الغذاء والدواء", hasExpiry: true },
  { code: "SASO_CERTIFICATE", en: "SASO Certificate", ar: "شهادة المواصفات والمقاييس", hasExpiry: true },
  { code: "MUNICIPALITY_LICENSE", en: "Municipality License", ar: "رخصة البلدية", hasExpiry: true },
  { code: "INSURANCE", en: "Insurance", ar: "التأمين", hasExpiry: true },
  { code: "AGENCY_CERTIFICATE", en: "Agency Certificate", ar: "شهادة الوكالة", hasExpiry: true },
  { code: "OTHER", en: "Other", ar: "أخرى", hasExpiry: false },
];

export const PAYMENT_TERMS = [
  "Prepaid",
  "Cash on Delivery",
  "Net 15",
  "Net 30",
  "Net 45",
  "Net 60",
  "Net 90",
] as const;

// Coverage risk thresholds (approved suppliers per category)
export const COVERAGE_RISK = {
  green: 10, // > 10 approved suppliers
  yellow: 5, // 5..10
} as const;

export function coverageTone(approved: number): BadgeTone {
  if (approved > COVERAGE_RISK.green) return "success";
  if (approved >= COVERAGE_RISK.yellow) return "warning";
  return "danger";
}
