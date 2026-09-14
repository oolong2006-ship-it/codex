// التحقق من المدخلات — مشترك بين الخادم والواجهة

/** تطبيع رقم الجوال السعودي إلى 9665XXXXXXXX */
export function normalizeSaudiPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const latin = input
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660)) // عربية-هندية
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0)); // فارسية
  let d = latin.replace(/[^0-9]/g, "");
  if (d.startsWith("00966")) d = d.slice(2);
  if (d.startsWith("966")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  return /^5[0-9]{8}$/.test(d) ? `966${d}` : null;
}

/** الرقم الضريبي السعودي: 15 رقمًا يبدأ وينتهي بـ 3 */
export function isValidSaudiVat(vat: string | null | undefined): boolean {
  if (!vat) return false;
  return /^3[0-9]{13}3$/.test(vat.replace(/\s/g, ""));
}

export interface PasswordCheck { ok: boolean; problems: string[] }

/** سياسة كلمة المرور: 12 حرفًا على الأقل مع تنوّع في المحارف */
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
  return { ok: problems.length === 0, problems };
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export const ALLOWED_MIME: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/jpg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

export interface FileCheck { ok: boolean; error?: string; ext?: string }

/** يتحقق من النوع والحجم وتطابق الامتداد مع نوع المحتوى */
export function checkFile(name: string, mime: string, size: number): FileCheck {
  const exts = ALLOWED_MIME[mime];
  if (!exts) {
    return { ok: false, error: "نوع الملف غير مسموح. المسموح: PDF و JPG و PNG و WEBP" };
  }
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: "حجم الملف غير صحيح" };
  }
  if (size > MAX_FILE_BYTES) {
    return { ok: false, error: "حجم الملف يتجاوز الحد الأقصى 10 ميجابايت" };
  }
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!exts.includes(ext)) {
    return { ok: false, error: "امتداد الملف لا يطابق نوعه" };
  }
  // منع الامتدادات المزدوجة مثل ملف.pdf.exe
  const dangerous = /\.(exe|sh|bat|cmd|js|php|jar|msi|scr|com|dll|svg|html?)(\.|$)/i;
  if (dangerous.test(name)) {
    return { ok: false, error: "اسم الملف يحتوي على امتداد غير مسموح" };
  }
  return { ok: true, ext };
}

export const DOCUMENT_TYPES = ["supplier_invoice", "erp_document", "other"] as const;
export type DocumentType = typeof DOCUMENT_TYPES[number];
