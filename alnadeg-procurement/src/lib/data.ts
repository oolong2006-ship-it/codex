"use client";
import { supabase } from "./supabase";
import type {
  ApprovalRow, AuditLogRow, DashboardMetrics, LocationRow,
  ProfileRow, PurchaseRequestRow, PurchaseRequestWithRelations,
  RefValueRow, RequestDocumentRow,
} from "@/types/database";

/** قائمة المواقع تأتي دائمًا من قاعدة البيانات — لا قوائم مكتوبة يدويًا */
export async function fetchLocations(onlyActive = true): Promise<LocationRow[]> {
  let q = supabase.from("locations").select("*").order("sort_order");
  if (onlyActive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error("تعذر تحميل قائمة المواقع");
  return (data ?? []) as LocationRow[];
}

export async function fetchRefValues(domain: string): Promise<RefValueRow[]> {
  const { data, error } = await supabase
    .from("ref_values").select("*").eq("domain", domain).order("sort_order");
  if (error) throw new Error("تعذر تحميل القوائم المرجعية");
  return (data ?? []) as RefValueRow[];
}

export async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  const { data, error } = await supabase.rpc("get_dashboard_metrics");
  if (error) throw new Error("تعذر تحميل المؤشرات");
  return data as DashboardMetrics;
}

export interface RequestFilters {
  status?: string;
  stage?: string;
  locationId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  mineOnly?: string;
  page?: number;
  pageSize?: number;
}

export interface PagedRequests {
  rows: PurchaseRequestWithRelations[];
  total: number;
}

/** قائمة الطلبات مع ترقيم صفحات — لا تُحمَّل كل السجلات دفعة واحدة */
export async function fetchRequests(f: RequestFilters = {}): Promise<PagedRequests> {
  const page = f.page ?? 1;
  const pageSize = f.pageSize ?? 20;
  const from = (page - 1) * pageSize;

  let q = supabase.from("purchase_requests")
    .select(
      `*, locations(name_ar, code),
       requester:profiles!purchase_requests_requester_fk(full_name)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (f.status) q = q.eq("status", f.status);
  if (f.stage) q = q.eq("current_stage", f.stage);
  if (f.locationId) q = q.eq("location_id", f.locationId);
  if (f.dateFrom) q = q.gte("request_date", f.dateFrom);
  if (f.dateTo) q = q.lte("request_date", f.dateTo);
  if (f.mineOnly) q = q.eq("requester_id", f.mineOnly);

  if (f.search?.trim()) {
    const s = f.search.trim().replace(/[%,]/g, "");
    q = q.or(
      `request_number.ilike.%${s}%,supplier_name.ilike.%${s}%,` +
      `invoice_number.ilike.%${s}%,items_description.ilike.%${s}%`,
    );
  }

  const { data, error, count } = await q;
  if (error) throw new Error("تعذر تحميل الطلبات");
  return { rows: (data ?? []) as PurchaseRequestWithRelations[], total: count ?? 0 };
}

export async function fetchRequest(id: string): Promise<PurchaseRequestWithRelations | null> {
  const { data, error } = await supabase.from("purchase_requests")
    .select(`*, locations(name_ar, code),
             requester:profiles!purchase_requests_requester_fk(full_name)`)
    .eq("id", id).maybeSingle();
  if (error) throw new Error("تعذر تحميل الطلب");
  return data as PurchaseRequestWithRelations | null;
}

export async function fetchRequestDocuments(requestId: string): Promise<RequestDocumentRow[]> {
  const { data, error } = await supabase.from("request_documents")
    .select("*").eq("request_id", requestId).order("created_at");
  if (error) throw new Error("تعذر تحميل المرفقات");
  return (data ?? []) as RequestDocumentRow[];
}

export async function fetchApprovals(requestId: string): Promise<ApprovalRow[]> {
  const { data, error } = await supabase.from("approvals")
    .select("*").eq("request_id", requestId).order("created_at");
  if (error) throw new Error("تعذر تحميل مسار الاعتماد");
  return (data ?? []) as ApprovalRow[];
}

export async function createRequest(
  values: Record<string, unknown>, requesterId: string,
): Promise<PurchaseRequestRow> {
  const { data, error } = await supabase.from("purchase_requests")
    .insert({ ...values, requester_id: requesterId, status: "draft" })
    .select().single();
  if (error) throw new Error(mapDbError(error.message));
  return data as PurchaseRequestRow;
}

export async function updateRequest(
  id: string, values: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("purchase_requests")
    .update(values).eq("id", id);
  if (error) throw new Error(mapDbError(error.message));
}

export async function submitRequest(id: string): Promise<void> {
  const { error } = await supabase.rpc("submit_purchase_request", { p_request_id: id });
  if (error) throw new Error(mapDbError(error.message));
}

export async function decideRequest(
  id: string, decision: "approved" | "rejected" | "returned",
  note: string | null, override = false, expectedVersion?: number,
): Promise<void> {
  const { error } = await supabase.rpc("decide_purchase_request", {
    p_request_id: id, p_decision: decision, p_note: note,
    p_override: override, p_expected_version: expectedVersion ?? null,
  });
  if (error) throw new Error(mapDbError(error.message));
}

export async function cancelRequest(id: string, note: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_purchase_request", {
    p_request_id: id, p_note: note,
  });
  if (error) throw new Error(mapDbError(error.message));
}

export async function addAdminNote(id: string, note: string): Promise<void> {
  const { error } = await supabase.rpc("add_request_admin_note", {
    p_request_id: id, p_note: note,
  });
  if (error) throw new Error(mapDbError(error.message));
}

export async function deleteDocument(docId: string, storagePath: string): Promise<void> {
  const { error } = await supabase.from("request_documents").delete().eq("id", docId);
  if (error) throw new Error(mapDbError(error.message));
  await supabase.storage.from("procurement-documents").remove([storagePath]);
}

export interface UserFilters {
  search?: string; role?: string; locationId?: string; activeOnly?: boolean;
}

export async function fetchUsers(f: UserFilters = {}): Promise<ProfileRow[]> {
  let q = supabase.from("profiles").select("*").order("full_name");
  if (f.role) q = q.eq("role", f.role);
  if (f.locationId) q = q.eq("location_id", f.locationId);
  if (f.activeOnly) q = q.eq("is_active", true);
  if (f.search?.trim()) {
    const s = f.search.trim().replace(/[%,]/g, "");
    q = q.or(`full_name.ilike.%${s}%,phone.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error("تعذر تحميل المستخدمين");
  return (data ?? []) as ProfileRow[];
}

export async function fetchAuditLogs(
  page = 1, pageSize = 50, action?: string,
): Promise<{ rows: AuditLogRow[]; total: number }> {
  const from = (page - 1) * pageSize;
  let q = supabase.from("audit_logs").select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (action) q = q.eq("action", action);
  const { data, error, count } = await q;
  if (error) throw new Error("تعذر تحميل سجل التدقيق");
  return { rows: (data ?? []) as AuditLogRow[], total: count ?? 0 };
}

export async function upsertLocation(values: Partial<LocationRow>): Promise<void> {
  if (values.id) {
    const { id, ...rest } = values;
    const { error } = await supabase.from("locations").update(rest).eq("id", id);
    if (error) throw new Error(mapDbError(error.message));
  } else {
    const { error } = await supabase.from("locations").insert(values);
    if (error) throw new Error(mapDbError(error.message));
  }
}

/** إحصاءات المواقع: عدد المستخدمين والطلبات */
export async function fetchLocationStats(): Promise<
  Record<string, { users: number; requests: number }>
> {
  const [{ data: users }, { data: reqs }] = await Promise.all([
    supabase.from("profiles").select("location_id"),
    supabase.from("purchase_requests").select("location_id"),
  ]);
  const stats: Record<string, { users: number; requests: number }> = {};
  const bump = (id: string | null, key: "users" | "requests") => {
    if (!id) return;
    stats[id] ??= { users: 0, requests: 0 };
    stats[id][key] += 1;
  };
  (users ?? []).forEach((u) => bump(u.location_id, "users"));
  (reqs ?? []).forEach((r) => bump(r.location_id, "requests"));
  return stats;
}

/** ترجمة أخطاء قاعدة البيانات إلى رسائل عربية واضحة */
export function mapDbError(raw: string): string {
  const map: Record<string, string> = {
    INVOICE_REQUIRED: "يجب إرفاق فاتورة المورد قبل الإرسال",
    ERP_DOCUMENT_REQUIRED: "لا يمكن الإقفال المالي قبل إرفاق مستند إدخال الفاتورة في ERP",
    NOTE_REQUIRED: "يجب كتابة سبب الرفض أو الإعادة",
    OVERRIDE_NOTE_REQUIRED: "يجب تسجيل سبب التجاوز",
    WRONG_STAGE_ROLE: "لا تملك صلاحية اعتماد هذه المرحلة",
    WRONG_LOCATION: "لا تملك صلاحية على طلبات موقع آخر",
    STAGE_ALREADY_PROCESSED: "تمت معالجة هذه المرحلة بالفعل",
    VERSION_CONFLICT: "تم تعديل الطلب من مستخدم آخر، يرجى إعادة تحميل الصفحة",
    INCOMPLETE_REQUEST: "يجب استكمال بيانات الطلب الإلزامية قبل الإرسال",
    INVALID_STATUS: "لا يمكن تنفيذ العملية في حالة الطلب الحالية",
    ACCOUNT_INACTIVE: "الحساب غير مفعّل، يرجى مراجعة مدير النظام",
    REQUEST_NOT_FOUND: "الطلب غير موجود",
    NOT_IN_WORKFLOW: "الطلب ليس ضمن مسار اعتماد نشط",
    FORBIDDEN: "لا تملك صلاحية تنفيذ هذه العملية",
  };
  for (const [code, msg] of Object.entries(map)) {
    if (raw.includes(code)) return msg;
  }
  if (raw.includes("purchase_requests_supplier_invoice_key") || raw.includes("duplicate key")) {
    if (raw.includes("supplier_invoice")) {
      return "توجد فاتورة مسجّلة مسبقًا لنفس المورد بنفس رقم الفاتورة";
    }
    if (raw.includes("locations_code")) return "كود الموقع مستخدم مسبقًا";
    return "القيمة المدخلة مسجّلة مسبقًا";
  }
  if (raw.includes("purchase_requests_vat_check")) {
    return "الرقم الضريبي غير صحيح: 15 رقمًا يبدأ وينتهي بالرقم 3";
  }
  if (raw.includes("total_consistency")) {
    return "الإجمالي لا يساوي المبلغ قبل الضريبة + الضريبة";
  }
  if (raw.includes("row-level security") || raw.includes("permission denied")) {
    return "لا تملك صلاحية تنفيذ هذه العملية";
  }
  return "تعذر تنفيذ العملية، يرجى المحاولة لاحقًا";
}
