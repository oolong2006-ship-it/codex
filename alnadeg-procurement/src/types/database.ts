// أنواع TypeScript مطابقة لمخطط قاعدة البيانات.
// لإعادة توليدها من المشروع الحيّ:
//   npx supabase gen types typescript --project-id wdtylpgeyjuetarwtbev > src/types/database.ts

export type UserRole =
  | "super_admin" | "requester" | "production_officer"
  | "branch_manager" | "production_manager" | "procurement" | "finance";

export type LocationKind = "branch" | "central";

export type RequestStatus =
  | "draft" | "submitted"
  | "pending_production_officer" | "pending_branch_manager"
  | "pending_production_manager" | "pending_procurement" | "pending_finance"
  | "returned" | "rejected" | "completed" | "cancelled";

export type ApprovalStage =
  | "production_officer" | "branch_manager"
  | "production_manager" | "procurement" | "finance";

export type ApprovalDecision =
  | "approved" | "rejected" | "returned" | "submitted" | "cancelled";

export type PurchaseType = "operational" | "direct" | "emergency";
export type PriorityLevel = "low" | "normal" | "high" | "urgent";
export type DocumentType = "supplier_invoice" | "erp_document" | "other";

export interface LocationRow {
  id: string;
  code: string | null;
  name_ar: string | null;
  kind: LocationKind;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  location_id: string | null;
  job_title: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface PurchaseRequestRow {
  id: string;
  request_number: string | null;
  location_id: string | null;
  requester_id: string | null;
  status: RequestStatus;
  current_stage: ApprovalStage | null;
  request_date: string | null;
  purchase_date: string | null;
  purchase_type: PurchaseType | null;
  priority: PriorityLevel;
  supplier_name: string | null;
  supplier_vat: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  amount_before_vat: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  category: string | null;
  items_description: string | null;
  quantity: number | null;
  unit: string | null;
  justification: string | null;
  notes: string | null;
  admin_note: string | null;
  version: number;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface RequestDocumentRow {
  id: string;
  request_id: string;
  location_id: string;
  document_type: DocumentType;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface ApprovalRow {
  id: string;
  request_id: string;
  stage: ApprovalStage | null;
  decision: ApprovalDecision | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: UserRole | null;
  note: string | null;
  previous_status: string | null;
  new_status: string | null;
  location_id: string | null;
  is_override: boolean;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: number;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  location_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface RefValueRow {
  domain: string;
  code: string;
  name_ar: string;
  sort_order: number;
}

export interface DashboardMetrics {
  total: number;
  pending: number;
  completed: number;
  rejected: number;
  returned: number;
  draft: number;
  missing_erp: number;
  total_amount: number;
  overdue: number;
  by_location: { location_id: string; name_ar: string; code: string; count: number; amount: number }[];
  by_stage: Record<string, number>;
  by_status: Record<string, number>;
  by_purchase_type: Record<string, number>;
}

/** الطلب مع الحقول المرتبطة كما تعيدها الاستعلامات */
export interface PurchaseRequestWithRelations extends PurchaseRequestRow {
  locations?: { name_ar: string | null; code: string | null } | null;
  requester?: { full_name: string | null } | null;
}
