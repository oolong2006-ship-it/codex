import type {
  ApprovalDecision, ApprovalStage, DocumentType,
  PriorityLevel, PurchaseType, RequestStatus, UserRole,
} from "@/types/database";

export const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: "مدير النظام",
  requester: "مقدم طلب شراء",
  production_officer: "مسؤول الإنتاج",
  branch_manager: "مدير الفرع",
  production_manager: "مدير الإنتاج",
  procurement: "إدارة المشتريات",
  finance: "الإدارة المالية",
};

export const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: "مسودة",
  submitted: "مرسل",
  pending_production_officer: "بانتظار اعتماد مسؤول الإنتاج",
  pending_branch_manager: "بانتظار اعتماد مدير الفرع",
  pending_production_manager: "بانتظار اعتماد مدير الإنتاج",
  pending_procurement: "بانتظار إدارة المشتريات",
  pending_finance: "بانتظار الإدارة المالية",
  returned: "معاد للتعديل",
  rejected: "مرفوض",
  completed: "مكتمل",
  cancelled: "ملغى",
};

export const STAGE_LABEL: Record<ApprovalStage, string> = {
  production_officer: "مسؤول الإنتاج",
  branch_manager: "مدير الفرع",
  production_manager: "مدير الإنتاج",
  procurement: "إدارة المشتريات",
  finance: "الإدارة المالية",
};

export const DECISION_LABEL: Record<ApprovalDecision, string> = {
  approved: "اعتماد",
  rejected: "رفض",
  returned: "إعادة للتعديل",
  submitted: "إرسال",
  cancelled: "إلغاء",
};

export const PURCHASE_TYPE_LABEL: Record<PurchaseType, string> = {
  operational: "تشغيلي",
  direct: "مباشر",
  emergency: "طارئ",
};

export const PRIORITY_LABEL: Record<PriorityLevel, string> = {
  low: "منخفضة", normal: "عادية", high: "عالية", urgent: "عاجلة",
};

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  supplier_invoice: "فاتورة المورد",
  erp_document: "مستند إدخال الفاتورة في ERP",
  other: "مستند إضافي",
};

export const CATEGORY_LABEL: Record<string, string> = {
  food: "مواد غذائية", packaging: "تغليف ومستهلكات", maintenance: "صيانة وإصلاح",
  equipment: "معدات وأجهزة", services: "خدمات", cleaning: "مواد نظافة",
  transport: "نقل وشحن", other: "أخرى",
};

export const UNIT_LABEL: Record<string, string> = {
  piece: "حبة", kg: "كيلوجرام", carton: "كرتون",
  liter: "لتر", pack: "عبوة", service: "خدمة",
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "auth.login": "تسجيل دخول",
  "user.created": "إنشاء مستخدم",
  "user.updated": "تعديل مستخدم",
  "user.password_reset": "إعادة تعيين كلمة المرور",
  "request.submitted": "إرسال طلب",
  "request.approved": "اعتماد طلب",
  "request.rejected": "رفض طلب",
  "request.returned": "إعادة طلب للتعديل",
  "request.cancelled": "إلغاء طلب",
  "request.stage_overridden": "تجاوز مرحلة اعتماد",
  "request.admin_note": "ملاحظة إدارية",
  "document.uploaded": "رفع مرفق",
  "report.exported": "تصدير تقرير",
  "activation.token_created": "إنشاء رمز تفعيل",
  "activation.completed": "تفعيل حساب",
};

/** ألوان شارة الحالة */
export const STATUS_TONE: Record<RequestStatus, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  submitted: "bg-sky-50 text-sky-700 ring-sky-200",
  pending_production_officer: "bg-amber-50 text-amber-800 ring-amber-200",
  pending_branch_manager: "bg-amber-50 text-amber-800 ring-amber-200",
  pending_production_manager: "bg-amber-50 text-amber-800 ring-amber-200",
  pending_procurement: "bg-amber-50 text-amber-800 ring-amber-200",
  pending_finance: "bg-amber-50 text-amber-800 ring-amber-200",
  returned: "bg-orange-50 text-orange-800 ring-orange-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  completed: "bg-brand-50 text-brand-700 ring-brand-200",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
};
