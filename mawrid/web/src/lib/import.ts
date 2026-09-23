import { CATEGORIES, CERTIFICATES, CITIES, DAYS } from "./constants";
import { matchHeader, rowToRawSupplier } from "./columns";
import { dedupKey } from "./normalize";
import type { SupplierInput } from "./types";
import { validateSupplier } from "./validation";

export interface ImportRowError {
  /** رقم الصف كما يظهر في Excel (الصف 1 = العناوين) */
  row: number;
  name: string;
  messages: string[];
}

export interface ImportPlan {
  /** صفوف صالحة بعد دمج المكرر داخل الملف، مفتاحها مفتاح منع التكرار */
  valid: { key: string; row: number; data: SupplierInput }[];
  errors: ImportRowError[];
  /** صفوف فارغة تماماً تم تجاهلها */
  blank: number;
  /** صفوف مكررة داخل الملف نفسه (يُعتمد آخر صف) */
  merged: number;
  /** أعمدة الملف التي لم تُطابق أي حقل */
  unknownHeaders: string[];
}

const LISTS = { categories: CATEGORIES, cities: CITIES, days: DAYS, certificates: CERTIFICATES };

/**
 * يحوّل صفوف الملف إلى خطة استيراد: تحقق كل صف، دمج المكرر، وتقرير أخطاء.
 * defaultSource يُستخدم للصفوف التي لا تحدد مصدرها (قاعدة: لا بيانات بلا مصدر).
 */
export function planImport(rows: Record<string, unknown>[], defaultSource: string): ImportPlan {
  const byKey = new Map<string, { key: string; row: number; data: SupplierInput }>();
  const errors: ImportRowError[] = [];
  let blank = 0;
  let merged = 0;

  const headers = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((h) => headers.add(h)));
  const unknownHeaders = [...headers].filter((h) => !/^__EMPTY/.test(h) && !matchHeader(h));

  rows.forEach((raw, i) => {
    const rowNo = i + 2;
    if (Object.values(raw).every((v) => String(v ?? "").trim() === "")) { blank++; return; }
    const obj = rowToRawSupplier(raw, LISTS);
    if (!String(obj.source ?? "").trim()) obj.source = defaultSource;

    const unknownLists: string[] = [];
    const check = (field: string, list: readonly string[], label: string) => {
      const bad = (obj[field] as string[]).filter((x) => !list.includes(x));
      if (bad.length) unknownLists.push(`${label} غير معروفة: ${bad.join("، ")}`);
    };
    check("categories", CATEGORIES, "تصنيفات");
    check("coverage", CITIES, "مدن تغطية");
    check("delivery_days", DAYS, "أيام توريد");
    check("certificates", CERTIFICATES, "شهادات");
    if (obj.city && !CITIES.includes(obj.city as never)) unknownLists.push(`مدينة غير مدرجة: ${obj.city}`);

    const r = validateSupplier(obj);
    if (!r.ok || unknownLists.length) {
      const messages = r.ok ? [] : Object.values(r.errors).filter(Boolean) as string[];
      // القيم غير المعروفة في القوائم تُحذف بصمت عند التحقق؛ نبلغ عنها كتحذير يمنع الاستيراد
      // حتى لا يُفقد تصنيف أو مدينة دون علم المستخدم.
      errors.push({ row: rowNo, name: String(obj.name ?? ""), messages: [...messages, ...unknownLists] });
      return;
    }
    const key = dedupKey(r.data.cr, r.data.name, r.data.city);
    if (byKey.has(key)) merged++;
    byKey.set(key, { key, row: rowNo, data: r.data });
  });

  return { valid: [...byKey.values()], errors, blank, merged, unknownHeaders };
}
