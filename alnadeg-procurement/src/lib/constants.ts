import type { ApprovalStage, UserRole } from "@/types/database";

/** مسار الاعتماد الخماسي بالترتيب المعتمد */
export const APPROVAL_FLOW: ApprovalStage[] = [
  "production_officer",
  "branch_manager",
  "production_manager",
  "procurement",
  "finance",
];

/** الدور المخوَّل بكل مرحلة */
export const STAGE_ROLE: Record<ApprovalStage, UserRole> = {
  production_officer: "production_officer",
  branch_manager: "branch_manager",
  production_manager: "production_manager",
  procurement: "procurement",
  finance: "finance",
};

/** الأدوار التي ترى جميع المواقع */
export const GLOBAL_SCOPE_ROLES: UserRole[] = [
  "super_admin", "production_manager", "procurement", "finance",
];

export const ALL_ROLES: UserRole[] = [
  "super_admin", "requester", "production_officer",
  "branch_manager", "production_manager", "procurement", "finance",
];

/** الأدوار المخوَّلة بإنشاء طلب شراء */
export const REQUESTER_ROLES: UserRole[] = [
  "requester", "production_officer", "branch_manager", "super_admin",
];

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_MIME = [
  "application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp",
];

export const ACCEPTED_ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.webp";

export const VAT_RATE = 0.15;
