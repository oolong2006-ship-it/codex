import { z } from "zod";
import { ACCEPTED_MIME, MAX_FILE_BYTES } from "./constants";

/**
 * تطبيع رقم الجوال السعودي إلى الصيغة الموحدة 9665XXXXXXXX.
 * يقبل: 05xxxxxxxx | 5xxxxxxxx | 9665xxxxxxxx | +9665xxxxxxxx | 009665xxxxxxxx
 * وكذلك الأرقام العربية-الهندية والفارسية.
 */
export function normalizeSaudiPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const latin = input
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06F0));
  let d = latin.replace(/[^0-9]/g, "");
  if (d.startsWith("00966")) d = d.slice(2);
  if (d.startsWith("966")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  return /^5[0-9]{8}$/.test(d) ? `966${d}` : null;
}

/** صيغة العرض: 05X XXX XXXX */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone) return "—";
  const m = /^966(5\d{8})$/.exec(phone);
  if (!m) return phone;
  const local = `0${m[1]}`;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/** الرقم الضريبي السعودي: 15 رقمًا يبدأ وينتهي بالرقم 3 */
export function isValidSaudiVat(vat: string | null | undefined): boolean {
  if (!vat) return false;
  return /^3[0-9]{13}3$/.test(vat.replace(/\s/g, ""));
}

export interface PasswordCheck { ok: boolean; problems: string[]; score: number }

/** سياسة كلمة المرور — مطابقة تمامًا لما يفرضه الخادم */
export function checkPassword(pw: string, phone?: string | null): PasswordCheck {
  const problems: string[] = [];
  if (!pw || pw.length < 12) problems.push("يجب ألا تقل كلمة المرور عن 12 حرفًا");
  if (!/[a-z]/.test(pw)) problems.push("يجب أن تحتوي على حرف إنجليزي صغير");
  if (!/[A-Z]/.test(pw)) problems.push("يجب أن تحتوي على حرف إنجليزي كبير");
  if (!/[0-9]/.test(pw)) problems.push("يجب أن تحتوي على رقم واحد على الأقل");
  if (!/[^A-Za-z0-9]/.test(pw)) problems.push("يجب أن تحتوي على رمز خاص مثل !@#$");
  if (/(.)\1{3,}/.test(pw)) problems.push("لا يجوز تكرار المحرف نفسه أكثر من ثلاث مرات");
  const weak = ["password", "123456", "qwerty", "alnadeg", "admin", "welcome"];
  if (weak.some((w) => pw.toLowerCase().includes(w))) {
    problems.push("كلمة المرور شائعة جدًا، اختر كلمة أقوى");
  }
  if (phone) {
    const digits = phone.replace(/[^0-9]/g, "");
    if (digits.length >= 6 && pw.includes(digits.slice(-6))) {
      problems.push("لا يجوز أن تحتوي كلمة المرور على رقم جوالك");
    }
  }
  const score = Math.max(0, 5 - problems.length);
  return { ok: problems.length === 0, problems, score };
}

export interface FileCheck { ok: boolean; error?: string }

/** التحقق من المرفق قبل الرفع — الخادم يعيد التحقق بعد الرفع */
export function checkFile(file: { name: string; type: string; size: number }): FileCheck {
  if (!ACCEPTED_MIME.includes(file.type)) {
    return { ok: false, error: "نوع الملف غير مسموح. المسموح: PDF و JPG و PNG و WEBP" };
  }
  if (file.size <= 0) return { ok: false, error: "الملف فارغ" };
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "حجم الملف يتجاوز الحد الأقصى 10 ميجابايت" };
  }
  if (/\.(exe|sh|bat|cmd|js|php|jar|msi|scr|com|dll|svg|html?)(\.|$)/i.test(file.name)) {
    return { ok: false, error: "اسم الملف يحتوي على امتداد غير مسموح" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------
// مخططات Zod
// ---------------------------------------------------------------------

const phoneSchema = z.string().min(1, "رقم الجوال مطلوب")
  .refine((v) => normalizeSaudiPhone(v) !== null,
    "رقم الجوال غير صحيح. مثال: 0551234567");

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const activationSchema = z.object({
  full_name: z.string().trim().min(4, "يرجى إدخال الاسم الكامل"),
  phone: phoneSchema,
  password: z.string().refine((v) => checkPassword(v).ok,
    (v) => ({ message: checkPassword(v).problems[0] ?? "كلمة المرور ضعيفة" })),
  password_confirm: z.string().min(1, "تأكيد كلمة المرور مطلوب"),
}).refine((d) => d.password === d.password_confirm, {
  message: "كلمة المرور وتأكيدها غير متطابقين",
  path: ["password_confirm"],
});
export type ActivationInput = z.infer<typeof activationSchema>;

export const changePasswordSchema = z.object({
  password: z.string().refine((v) => checkPassword(v).ok,
    (v) => ({ message: checkPassword(v).problems[0] ?? "كلمة المرور ضعيفة" })),
  password_confirm: z.string().min(1, "تأكيد كلمة المرور مطلوب"),
}).refine((d) => d.password === d.password_confirm, {
  message: "كلمة المرور وتأكيدها غير متطابقين",
  path: ["password_confirm"],
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

const moneySchema = z.coerce.number({ invalid_type_error: "يجب إدخال قيمة رقمية" })
  .min(0, "لا يمكن أن تكون القيمة سالبة")
  .max(99_999_999, "القيمة تتجاوز الحد المسموح");

export const purchaseRequestSchema = z.object({
  location_id: z.string().uuid("يجب اختيار الموقع أو الفرع"),
  purchase_date: z.string().min(1, "تاريخ الشراء مطلوب"),
  purchase_type: z.enum(["operational", "direct", "emergency"], {
    errorMap: () => ({ message: "يجب اختيار نوع الشراء" }),
  }),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  supplier_name: z.string().trim().min(3, "اسم المورد مطلوب"),
  supplier_vat: z.string().trim().optional()
    .refine((v) => !v || isValidSaudiVat(v),
      "الرقم الضريبي غير صحيح: 15 رقمًا يبدأ وينتهي بالرقم 3"),
  invoice_number: z.string().trim().min(1, "رقم الفاتورة مطلوب"),
  invoice_date: z.string().min(1, "تاريخ الفاتورة مطلوب"),
  amount_before_vat: moneySchema,
  vat_amount: moneySchema,
  total_amount: moneySchema,
  category: z.string().min(1, "فئة المشتريات مطلوبة"),
  items_description: z.string().trim().min(3, "وصف الأصناف أو الخدمة مطلوب"),
  quantity: z.coerce.number().min(0).optional().or(z.literal("").transform(() => undefined)),
  unit: z.string().optional(),
  justification: z.string().trim().min(5, "سبب ومبرر الشراء مطلوب"),
  notes: z.string().optional(),
}).refine(
  (d) => Math.abs(d.total_amount - (d.amount_before_vat + d.vat_amount)) <= 0.01,
  { message: "الإجمالي لا يساوي المبلغ قبل الضريبة + الضريبة", path: ["total_amount"] },
).refine(
  (d) => !d.invoice_date || !d.purchase_date || d.invoice_date >= d.purchase_date,
  { message: "تاريخ الفاتورة لا يمكن أن يسبق تاريخ الشراء", path: ["invoice_date"] },
);
export type PurchaseRequestInput = z.infer<typeof purchaseRequestSchema>;

export const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "returned"]),
  note: z.string().trim().optional(),
}).refine((d) => d.decision === "approved" || (d.note && d.note.length >= 3), {
  message: "يجب كتابة سبب الرفض أو الإعادة",
  path: ["note"],
});

export const userSchema = z.object({
  full_name: z.string().trim().min(4, "يرجى إدخال الاسم الكامل"),
  phone: phoneSchema,
  role: z.enum(["super_admin", "requester", "production_officer",
    "branch_manager", "production_manager", "procurement", "finance"], {
    errorMap: () => ({ message: "يجب اختيار الدور" }),
  }),
  location_id: z.string().uuid("يجب اختيار الموقع أو الفرع"),
  job_title: z.string().optional(),
});
export type UserInput = z.infer<typeof userSchema>;
