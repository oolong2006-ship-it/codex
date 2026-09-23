import { z } from "zod";
import { CATEGORIES, CERTIFICATES, CITIES, DAYS, PAYMENT_TERMS, STATUSES } from "./constants";
import { digitsOnly } from "./normalize";
import type { SupplierInput } from "./types";

const opt = (max: number) =>
  z.string().trim().max(max, `الحد الأقصى ${max} حرف`).transform((v) => (v === "" ? null : v));

const digitsField = (len: number, msg: string, extra?: (d: string) => boolean) =>
  z.string().transform((v, ctx) => {
    const d = digitsOnly(v);
    if (d === "") return null;
    if (d.length !== len || (extra && !extra(d))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg });
      return z.NEVER;
    }
    return d;
  });

const inList = (list: readonly string[]) => z.array(z.string()).transform((a) =>
  [...new Set(a.map((x) => x.trim()).filter((x) => list.includes(x)))]);

const url = z.string().trim().max(300).transform((v, ctx) => {
  if (v === "") return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) throw new Error();
    return u.toString();
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "رابط غير صحيح" });
    return z.NEVER;
  }
});

const phone = z.string().trim().max(30).transform((v, ctx) => {
  if (v === "") return null;
  const d = digitsOnly(v);
  if (d.length < 9 || d.length > 15) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "رقم غير صحيح" });
    return z.NEVER;
  }
  return v.replace(/[^\d+]/g, "") || v;
});

/** مخطط المورد — نفس قيود قاعدة البيانات مع رسائل عربية */
export const supplierSchema = z.object({
  name: z.string().trim().min(2, "اكتب الاسم التجاري للمورد").max(200),
  legal_name: opt(200),
  cr: digitsField(10, "السجل التجاري 10 أرقام"),
  vat: digitsField(15, "الرقم الضريبي 15 رقماً يبدأ وينتهي بـ 3",
    (d) => d.startsWith("3") && d.endsWith("3")),
  city: z.string().trim().min(2, "اختر المدينة").max(60),
  district: opt(100),
  national_address: opt(40).transform((v) => v?.toUpperCase() ?? null),
  contact_name: opt(120),
  contact_role: opt(80),
  phone,
  whatsapp: phone,
  email: z.string().trim().max(200).transform((v, ctx) => {
    if (v === "") return null;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "بريد غير صحيح" });
      return z.NEVER;
    }
    return v.toLowerCase();
  }),
  website: url,
  categories: inList(CATEGORIES).refine((a) => a.length > 0, "اختر تصنيفاً واحداً على الأقل"),
  products: opt(4000),
  coverage: inList(CITIES),
  delivery_days: inList(DAYS),
  lead_time: opt(60),
  moq: opt(60),
  payment: z.enum(PAYMENT_TERMS).nullable(),
  credit_days: z.coerce.number().int("عدد صحيح").min(0).max(365, "365 يوماً كحد أقصى"),
  certificates: inList(CERTIFICATES),
  sfda_license: opt(60),
  status: z.enum(STATUSES),
  rating: z.coerce.number().int().min(0).max(5),
  notes: opt(4000),
  source: z.string().trim().min(2, "حدد مصدر البيانات").max(120),
}) satisfies z.ZodType<SupplierInput, z.ZodTypeDef, unknown>;

export type SupplierFormErrors = Partial<Record<keyof SupplierInput, string>>;

export function validateSupplier(raw: unknown):
  { ok: true; data: SupplierInput } | { ok: false; errors: SupplierFormErrors } {
  const r = supplierSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  const errors: SupplierFormErrors = {};
  for (const issue of r.error.issues) {
    const k = issue.path[0] as keyof SupplierInput;
    if (k && !errors[k]) errors[k] = issue.message;
  }
  return { ok: false, errors };
}

/** ترجمة أخطاء قاعدة البيانات لرسائل مفهومة */
export function dbErrorMessage(err: { code?: string; message?: string } | null | undefined): string {
  const m = err?.message ?? "";
  if (err?.code === "23505" || m.includes("duplicate key")) {
    return m.includes("cr") ? "يوجد مورد آخر بنفس رقم السجل التجاري"
      : "يوجد مورد بنفس الاسم في نفس المدينة";
  }
  if (err?.code === "42501" || m.includes("row-level security") || m.includes("FORBIDDEN")) {
    return "ليست لديك صلاحية لهذه العملية";
  }
  if (err?.code === "23514") return "بعض البيانات لا تطابق الشروط المطلوبة";
  if (m.includes("Failed to fetch") || m.includes("NetworkError")) return "تعذر الاتصال بالخادم، تحقق من الإنترنت";
  return "تعذر تنفيذ العملية، حاول مرة أخرى";
}
