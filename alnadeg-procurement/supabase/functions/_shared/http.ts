// أدوات HTTP مشتركة: CORS، الاستجابات، ورسائل الأخطاء العربية

const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
];

/** النطاقات المسموح بها تُضبط عبر متغير البيئة ALLOWED_ORIGINS */
export function allowedOrigins(): string[] {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return [...configured, ...DEFAULT_DEV_ORIGINS];
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const list = allowedOrigins();
  const allow = origin && list.includes(origin) ? origin : list[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** خطأ يحمل رسالة عربية آمنة للعرض */
export class AppError extends Error {
  constructor(
    public code: string,
    public arabic: string,
    public status = 400,
  ) {
    super(code);
  }
}

/** ترجمة أكواد أخطاء قاعدة البيانات إلى رسائل عربية دون كشف تفاصيل تقنية */
const DB_ERROR_AR: Record<string, string> = {
  INVALID_PHONE: "رقم الجوال غير صحيح",
  TOKEN_INVALID: "رابط التفعيل غير صالح أو منتهي الصلاحية أو مستخدم مسبقًا",
  ACCOUNT_INACTIVE: "الحساب غير مفعّل، يرجى مراجعة مدير النظام",
  REQUEST_NOT_FOUND: "الطلب غير موجود",
  FORBIDDEN: "لا تملك صلاحية تنفيذ هذه العملية",
  INVALID_STATUS: "لا يمكن تنفيذ العملية في حالة الطلب الحالية",
  INCOMPLETE_REQUEST: "يجب استكمال بيانات الطلب الإلزامية قبل الإرسال",
  INVOICE_REQUIRED: "يجب إرفاق فاتورة المورد قبل الإرسال",
  NOTE_REQUIRED: "يجب كتابة سبب الرفض أو الإعادة",
  OVERRIDE_NOTE_REQUIRED: "يجب تسجيل سبب التجاوز",
  WRONG_STAGE_ROLE: "لا تملك صلاحية اعتماد هذه المرحلة",
  WRONG_LOCATION: "لا تملك صلاحية على طلبات موقع آخر",
  ERP_DOCUMENT_REQUIRED: "لا يمكن الإقفال المالي قبل إرفاق مستند إدخال الفاتورة في ERP",
  STAGE_ALREADY_PROCESSED: "تمت معالجة هذه المرحلة بالفعل",
  VERSION_CONFLICT: "تم تعديل الطلب من مستخدم آخر، يرجى إعادة تحميل الصفحة",
  NOT_IN_WORKFLOW: "الطلب ليس ضمن مسار اعتماد نشط",
};

export function arabicFor(raw: string): string {
  for (const [code, msg] of Object.entries(DB_ERROR_AR)) {
    if (raw.includes(code)) return msg;
  }
  if (raw.includes("duplicate key")) {
    if (raw.includes("supplier_invoice")) {
      return "توجد فاتورة مسجّلة مسبقًا لنفس المورد بنفس رقم الفاتورة";
    }
    if (raw.includes("phone")) return "رقم الجوال مسجّل مسبقًا لمستخدم آخر";
    return "القيمة المدخلة مسجّلة مسبقًا";
  }
  if (raw.includes("row-level security")) return "لا تملك صلاحية تنفيذ هذه العملية";
  return "تعذر تنفيذ العملية، يرجى المحاولة لاحقًا";
}

/** يسجّل التفاصيل التقنية في سجل الخادم ويعيد رسالة عربية فقط للواجهة */
export function handleError(err: unknown, origin: string | null): Response {
  if (err instanceof AppError) {
    console.warn(`[app] ${err.code}`);
    return json({ error: err.arabic, code: err.code }, err.status, origin);
  }
  const raw = err instanceof Error ? err.message : String(err);
  console.error("[unhandled]", raw);
  return json({ error: arabicFor(raw), code: "OPERATION_FAILED" }, 400, origin);
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("cf-connecting-ip") ?? "unknown";
}
