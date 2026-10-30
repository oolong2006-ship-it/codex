export const STATUS_AR: Record<string, string> = {
  DRAFT: "مسودة",
  IN_REVIEW: "قيد المراجعة",
  APPROVED: "معتمدة",
  EFFECTIVE: "سارية",
  SUPERSEDED: "ملغاة بإصدار أحدث",
  REJECTED: "مرفوضة",
};

export const CLASS_AR: Record<string, string> = {
  REQUIRED_VERIFIED: "مطلوبة (متحقق منها بمرجع مرخّص)",
  REQUIRED_UNVERIFIED: "مطلوبة (بانتظار التحقق بمرجع مرخّص)",
  SUGGESTED: "وسيلة تطبيق مقترحة",
  OPTIONAL: "اختيارية",
};

export const DOC_TYPE_AR: Record<string, string> = {
  SCOPE: "نطاق", POLICY: "سياسة", OBJECTIVES: "أهداف", PROCEDURE: "إجراء", WORK_INSTRUCTION: "تعليمات عمل",
  PROCESS_MAP: "خريطة عمليات", RACI: "مصفوفة مسؤوليات", RISK_REGISTER: "سجل مخاطر", FORM: "نموذج", PLAN: "خطة",
  MANUAL: "دليل", REPORT: "تقرير",
};

export interface RenderMeta {
  orgName: string;
  code: string;
  title: string;
  versionNo: number;
  status: string;
  classification: string;
  author: string;
  approver: string | null;
  approvedAt: string | null;
  effectiveAt: string | null;
  history: { versionNo: number; status: string; summary: string; date: string }[];
}

export function controlRows(meta: RenderMeta): string[][] {
  return [
    ["رمز الوثيقة", meta.code],
    ["رقم الإصدار", String(meta.versionNo)],
    ["الحالة", STATUS_AR[meta.status] ?? meta.status],
    ["التصنيف", CLASS_AR[meta.classification] ?? meta.classification],
    ["أعدّها", meta.author],
    ["اعتمدها", meta.approver ?? "— لم تُعتمد بعد —"],
    ["تاريخ الاعتماد", meta.approvedAt ?? "—"],
    ["تاريخ السريان", meta.effectiveAt ?? "—"],
  ];
}
