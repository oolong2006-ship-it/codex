import { STATUSES } from "./constants";
import { normalizeAr } from "./normalize";
import type { Supplier, SupplierInput } from "./types";

type Key = keyof SupplierInput;

/** أعمدة الاستيراد والتصدير: [الحقل، العنوان العربي، أسماء بديلة] */
export const COLUMNS: [Key, string, string[]][] = [
  ["name", "الاسم التجاري", ["الاسم", "اسم المورد", "المورد", "supplier", "supplier name", "trade name"]],
  ["legal_name", "الاسم النظامي", ["الاسم حسب السجل", "legal name", "legalname"]],
  ["cr", "السجل التجاري", ["رقم السجل التجاري", "رقم السجل", "سجل تجاري", "cr", "cr number", "commercial registration"]],
  ["vat", "الرقم الضريبي", ["رقم ضريبي", "الرقم الضريبي للمنشأة", "vat", "vat number", "tax number", "trn"]],
  ["city", "المدينة", ["المدينة الرئيسية", "city"]],
  ["district", "الحي", ["district"]],
  ["national_address", "العنوان الوطني", ["العنوان المختصر", "national address", "nationaladdress", "short address"]],
  ["contact_name", "مسؤول المبيعات", ["اسم المسؤول", "المسؤول", "جهة الاتصال", "contact", "contact name", "contactname"]],
  ["contact_role", "المسمى", ["المسمى الوظيفي", "contact role", "contactrole", "title"]],
  ["phone", "الجوال", ["رقم الجوال", "الهاتف", "هاتف", "جوال", "phone", "mobile"]],
  ["whatsapp", "واتساب", ["الواتساب", "رقم الواتساب", "whatsapp"]],
  ["email", "البريد", ["البريد الإلكتروني", "الايميل", "email", "e-mail"]],
  ["website", "الموقع", ["الموقع الإلكتروني", "website", "web", "url"]],
  ["categories", "التصنيفات", ["التصنيف", "الفئة", "الفئات", "categories", "category"]],
  ["products", "المنتجات", ["أهم المنتجات", "المنتجات والعلامات", "products"]],
  ["coverage", "التغطية", ["مدن التغطية", "coverage"]],
  ["delivery_days", "أيام التوريد", ["أيام التوصيل", "delivery days", "deliverydays"]],
  ["lead_time", "مدة التوريد", ["مدة التوصيل", "lead time", "leadtime"]],
  ["moq", "الحد الأدنى", ["الحد الأدنى للطلب", "moq", "minimum order"]],
  ["payment", "الدفع", ["شروط الدفع", "طريقة الدفع", "payment", "payment terms"]],
  ["credit_days", "أيام الآجل", ["مدة الآجل", "مدة الاجل (يوم)", "credit days", "creditdays"]],
  ["certificates", "الشهادات", ["certificates", "certifications"]],
  ["sfda_license", "ترخيص الغذاء والدواء", ["رقم ترخيص الغذاء والدواء", "sfda", "sfda license", "sfdalicense"]],
  ["status", "التوثيق", ["حالة التوثيق", "الحالة", "status"]],
  ["rating", "التقييم", ["rating"]],
  ["notes", "ملاحظات", ["ملاحظات المشتريات", "notes"]],
  ["source", "المصدر", ["مصدر البيانات", "source"]],
];

export const MULTI_FIELDS = new Set<Key>(["categories", "coverage", "delivery_days", "certificates"]);

const headerKey = (h: string) => normalizeAr(h).replace(/[\s_\-()]/g, "");

const HEADER_MAP = new Map<string, Key>();
for (const [key, label, aliases] of COLUMNS) {
  for (const h of [key, label, ...aliases]) HEADER_MAP.set(headerKey(h), key);
}

/** يطابق عنوان عمود (عربي/إنجليزي، بأي همزة أو مسافات) مع حقل المورد */
export function matchHeader(header: string): Key | undefined {
  return HEADER_MAP.get(headerKey(header));
}

/** يطابق قيمة نصية مع أقرب عنصر في قائمة ثابتة بعد التطبيع (مثال: «لحوم و دواجن») */
function matchList(value: string, list: readonly string[]): string {
  const n = normalizeAr(value).replace(/\s/g, "");
  return list.find((x) => normalizeAr(x).replace(/\s/g, "") === n) ?? value.trim();
}

export function splitMulti(v: unknown): string[] {
  return String(v ?? "").split(/[|،,;؛\n]/).map((x) => x.trim()).filter(Boolean);
}

function normalizePayment(v: string): string | null {
  const n = normalizeAr(v);
  if (!n) return null;
  const cash = /نقد|كاش|cash/.test(n);
  const credit = /اجل|ائتمان|credit/.test(n);
  if (cash && credit) return "نقدي وآجل";
  if (credit) return "آجل";
  if (cash) return "نقدي";
  return v;
}

/** «موثّق» يُقبل فقط إذا نصّ الملف عليه صراحة؛ أي شيء آخر = قيد التحقق (قاعدة المنتج) */
function normalizeStatus(v: string): string {
  const n = normalizeAr(v);
  if (STATUSES.includes(v as never)) return v;
  if (/غير/.test(n)) return "غير موثّق";
  if (/^موثق$|^verified$/.test(n)) return "موثّق";
  return "قيد التحقق";
}

export interface ListLookup {
  categories: readonly string[];
  cities: readonly string[];
  days: readonly string[];
  certificates: readonly string[];
}

/** يحوّل صف ملف (أي عناوين أعمدة) إلى كائن خام جاهز للتحقق بـ supplierSchema */
export function rowToRawSupplier(row: Record<string, unknown>, lists: ListLookup): Record<string, unknown> {
  const picked: Partial<Record<Key, unknown>> = {};
  for (const [h, v] of Object.entries(row)) {
    const k = matchHeader(h);
    if (k && (picked[k] === undefined || String(picked[k]).trim() === "")) picked[k] = v;
  }
  const str = (k: Key) => String(picked[k] ?? "").trim();
  const listFor: Partial<Record<Key, readonly string[]>> = {
    categories: lists.categories, coverage: lists.cities,
    delivery_days: lists.days, certificates: lists.certificates,
  };
  const out: Record<string, unknown> = {};
  for (const [k] of COLUMNS) {
    if (MULTI_FIELDS.has(k)) out[k] = splitMulti(picked[k]).map((x) => matchList(x, listFor[k]!));
    else if (k === "credit_days" || k === "rating") {
      const n = Number(String(picked[k] ?? "").replace(/[^\d.]/g, "")) || 0;
      out[k] = k === "rating" ? Math.min(5, Math.round(n)) : Math.round(n);
    } else if (k === "payment") out[k] = normalizePayment(str(k));
    else if (k === "status") out[k] = normalizeStatus(str(k));
    else if (k === "city") out[k] = str(k) ? matchList(str(k), lists.cities) : "";
    else out[k] = str(k);
  }
  return out;
}

/** قيمة خلية للتصدير */
export function exportCell(s: Supplier | Partial<SupplierInput>, k: Key): string | number {
  const v = s[k as keyof typeof s];
  if (Array.isArray(v)) return v.join(" | ");
  if (typeof v === "number") return v;
  return v == null ? "" : String(v);
}
