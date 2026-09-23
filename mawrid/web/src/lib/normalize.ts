// تطبيع النص العربي — نفس قواعد app.normalize_ar في قاعدة البيانات حرفياً.
// أي تعديل هنا يجب أن ينعكس في supabase/migrations/*_core_schema.sql.

const HARAKAT = /[ً-ٰٟـ]/g;
const MAP: Record<string, string> = {
  "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};
const MAP_RE = new RegExp(`[${Object.keys(MAP).join("")}]`, "g");

export function normalizeAr(value: unknown): string {
  return String(value ?? "")
    .replace(HARAKAT, "")
    .replace(MAP_RE, (c) => MAP[c])
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** الأرقام فقط (مع تحويل الأرقام العربية) */
export function digitsOnly(value: unknown): string {
  return normalizeAr(value).replace(/\D/g, "");
}

/** مفتاح منع التكرار — مطابق لـ app.supplier_dedup_key */
export function dedupKey(cr: unknown, name: unknown, city: unknown): string {
  const d = digitsOnly(cr);
  return d.length >= 7 ? `cr-${d}` : `n-${normalizeAr(name)}|${normalizeAr(city)}`;
}
