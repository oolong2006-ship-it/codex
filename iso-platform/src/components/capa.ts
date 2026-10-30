export const SEV_TONE = { MINOR: "gray", MAJOR: "amber", CRITICAL: "red" } as const;
export const NC_TONE: Record<string, "amber" | "blue" | "teal" | "green" | "red"> = { OPEN: "red", CONTAINED: "amber", ACTION_PLANNED: "blue", IMPLEMENTED: "teal", CLOSED: "green" };
export const EVENT_AR: Record<string, string> = {
  "nc.reported": "تسجيل الحالة",
  "nc.contained": "الاحتواء الفوري",
  "nc.analyzed": "تحليل السبب الجذري",
  "capa.action_added": "إضافة إجراء تصحيحي",
  "capa.action_done": "تنفيذ إجراء",
  "capa.action_cancelled": "إلغاء إجراء",
  "capa.verified_effective": "تحقق: فعّال — إغلاق",
  "capa.verified_ineffective": "تحقق: غير فعّال — إعادة فتح",
  "nc.closed_correction_only": "إغلاق بالتصحيح فقط",
};
