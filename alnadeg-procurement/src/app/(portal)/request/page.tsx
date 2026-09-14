"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  addAdminNote, cancelRequest, decideRequest, fetchApprovals,
  fetchRequest, fetchRequestDocuments, submitRequest, updateRequest,
} from "@/lib/data";
import { STAGE_ROLE } from "@/lib/constants";
import {
  CATEGORY_LABEL, PRIORITY_LABEL, PURCHASE_TYPE_LABEL, STAGE_LABEL, UNIT_LABEL,
} from "@/lib/labels";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { ApprovalTimeline, StageProgress } from "@/components/Timeline";
import { Attachments } from "@/components/Attachments";
import { FileUpload } from "@/components/FileUpload";
import { RequestForm } from "@/components/RequestForm";
import {
  Alert, Badge, Button, Card, Field, Modal, Spinner, Textarea,
} from "@/components/ui";
import type {
  ApprovalRow, PurchaseRequestWithRelations, RequestDocumentRow,
} from "@/types/database";
import type { PurchaseRequestInput } from "@/lib/validation";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b
                    border-slate-100 py-2.5 last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function RequestInner() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id") ?? "";
  const { profile, isSuperAdmin } = useAuth();

  const [request, setRequest] = useState<PurchaseRequestWithRelations | null>(null);
  const [documents, setDocuments] = useState<RequestDocumentRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const [decisionModal, setDecisionModal] =
    useState<null | "approved" | "rejected" | "returned">(null);
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);
  const [adminNoteModal, setAdminNoteModal] = useState(false);
  const [adminNote, setAdminNote] = useState("");

  const load = useCallback(async () => {
    if (!id) { setError("لم يتم تحديد الطلب"); setLoading(false); return; }
    setLoading(true);
    try {
      const [r, d, a] = await Promise.all([
        fetchRequest(id), fetchRequestDocuments(id), fetchApprovals(id),
      ]);
      if (!r) { setError("الطلب غير موجود أو لا تملك صلاحية عليه"); return; }
      setRequest(r); setDocuments(d); setApprovals(a); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل الطلب");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!request || !profile) return null;

  const isOwner = request.requester_id === profile.id;
  const isEditable = isOwner && ["draft", "returned"].includes(request.status);
  const hasInvoice = documents.some((d) => d.document_type === "supplier_invoice");
  const hasErp = documents.some((d) => d.document_type === "erp_document");

  // هل هذه مرحلة المستخدم الحالي؟
  const myStage = request.current_stage &&
    STAGE_ROLE[request.current_stage] === profile.role;
  const sameLocation = profile.location_id === request.location_id;
  const locationOk = !["production_officer", "branch_manager"].includes(request.current_stage ?? "")
    || sameLocation;
  const canDecide = !!request.current_stage && ((myStage && locationOk) || isSuperAdmin);
  const needsOverride = !!request.current_stage && isSuperAdmin && !myStage;

  // المالية والمشتريات يرفقان مستند ERP
  const canUploadErp = ["finance", "procurement"].includes(profile.role) || isSuperAdmin;

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      await fn();
      setNotice(ok);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تنفيذ العملية");
    } finally {
      setBusy(false);
    }
  };

  const doSubmit = () => run(() => submitRequest(request.id), "تم إرسال الطلب لمسار الاعتماد");

  const doDecide = () => {
    const decision = decisionModal!;
    return run(async () => {
      await decideRequest(request.id, decision, note.trim() || null,
        needsOverride && override, request.version);
      setDecisionModal(null); setNote(""); setOverride(false);
    }, decision === "approved" ? "تم اعتماد الطلب"
      : decision === "rejected" ? "تم رفض الطلب" : "تمت إعادة الطلب للتعديل");
  };

  const doEdit = (values: PurchaseRequestInput) => run(async () => {
    await updateRequest(request.id, { ...values, quantity: values.quantity ?? null });
    setEditing(false);
  }, "تم حفظ التعديلات");

  const doCancel = () => {
    const reason = prompt("سبب الإلغاء:");
    if (!reason?.trim()) return;
    run(() => cancelRequest(request.id, reason.trim()), "تم إلغاء الطلب");
  };

  if (editing) {
    return (
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-brand-800">
            تعديل الطلب {request.request_number}
          </h1>
          <Button variant="ghost" onClick={() => setEditing(false)}>إلغاء التعديل</Button>
        </header>
        {error && <Alert tone="error">{error}</Alert>}
        <RequestForm initial={request} onSubmit={doEdit} submitLabel="حفظ التعديلات" busy={busy} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold text-brand-800">{request.request_number}</h1>
            <StatusBadge status={request.status} />
            {request.priority !== "normal" && (
              <Badge className="bg-gold-50 text-gold-700 ring-gold-200">
                أولوية {PRIORITY_LABEL[request.priority]}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {request.locations?.name_ar} · {request.requester?.full_name} ·{" "}
            {formatDate(request.request_date)}
          </p>
        </div>
        <Link href="/requests/">
          <Button variant="ghost">رجوع للقائمة</Button>
        </Link>
      </header>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {request.current_stage && (
        <Card title="مسار الاعتماد">
          <StageProgress request={request} />
          <p className="mt-3 text-sm text-slate-500">
            المرحلة الحالية: <span className="font-semibold text-amber-700">
              {STAGE_LABEL[request.current_stage]}
            </span>
          </p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="بيانات الطلب">
            <dl>
              <Row label="الموقع أو الفرع" value={request.locations?.name_ar ?? "—"} />
              <Row label="مقدم الطلب" value={request.requester?.full_name ?? "—"} />
              <Row label="تاريخ الطلب" value={formatDate(request.request_date)} />
              <Row label="تاريخ الشراء" value={formatDate(request.purchase_date)} />
              <Row label="نوع الشراء" value={
                request.purchase_type ? PURCHASE_TYPE_LABEL[request.purchase_type] : "—"} />
              <Row label="درجة الأولوية" value={PRIORITY_LABEL[request.priority]} />
              <Row label="فئة المشتريات" value={
                request.category ? CATEGORY_LABEL[request.category] ?? request.category : "—"} />
            </dl>
          </Card>

          <Card title="بيانات المورد والفاتورة">
            <dl>
              <Row label="اسم المورد" value={request.supplier_name ?? "—"} />
              <Row label="الرقم الضريبي" value={
                <span dir="ltr">{request.supplier_vat ?? "—"}</span>} />
              <Row label="رقم الفاتورة" value={
                <span dir="ltr">{request.invoice_number ?? "—"}</span>} />
              <Row label="تاريخ الفاتورة" value={formatDate(request.invoice_date)} />
              <Row label="قبل الضريبة" value={formatMoney(request.amount_before_vat)} />
              <Row label="الضريبة" value={formatMoney(request.vat_amount)} />
              <Row label="الإجمالي شامل الضريبة" value={
                <span className="text-base text-brand-700">{formatMoney(request.total_amount)}</span>} />
            </dl>
          </Card>

          <Card title="الأصناف والمبرر">
            <dl>
              <Row label="وصف الأصناف أو الخدمة" value={request.items_description ?? "—"} />
              <Row label="الكمية" value={
                request.quantity
                  ? `${formatNumber(request.quantity)} ${request.unit ? UNIT_LABEL[request.unit] ?? request.unit : ""}`
                  : "—"} />
              <Row label="سبب ومبرر الشراء" value={request.justification ?? "—"} />
              <Row label="ملاحظات" value={request.notes ?? "—"} />
              {request.admin_note && (
                <Row label="ملاحظة إدارية" value={
                  <span className="text-purple-700">{request.admin_note}</span>} />
              )}
            </dl>
          </Card>

          <Card title="المرفقات">
            <Attachments documents={documents} canDelete={isEditable || isSuperAdmin}
              onChanged={load} />

            <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
              {isEditable && (
                <FileUpload requestId={request.id} documentType="supplier_invoice"
                  onUploaded={load} />
              )}
              {canUploadErp && request.status !== "draft" && (
                <FileUpload requestId={request.id} documentType="erp_document"
                  onUploaded={load}
                  label="إرفاق مستند إدخال الفاتورة في ERP" />
              )}
              {(isEditable || canUploadErp) && (
                <FileUpload requestId={request.id} documentType="other"
                  onUploaded={load} label="إرفاق مستند إضافي" />
              )}
            </div>
          </Card>

          <Card title="الخط الزمني للاعتمادات">
            <ApprovalTimeline approvals={approvals} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="الإجراءات المتاحة">
            <div className="space-y-3">
              {isEditable && (
                <>
                  <Button full variant="secondary" onClick={() => setEditing(true)}>
                    تعديل الطلب
                  </Button>
                  {!hasInvoice && (
                    <Alert tone="warning">
                      يجب إرفاق فاتورة المورد قبل إرسال الطلب.
                    </Alert>
                  )}
                  <Button full onClick={doSubmit} loading={busy} disabled={!hasInvoice}>
                    إرسال لمسار الاعتماد
                  </Button>
                </>
              )}

              {canDecide && (
                <>
                  {needsOverride && (
                    <Alert tone="warning" title="تجاوز إداري">
                      هذه المرحلة ليست ضمن دورك. بصفتك مدير النظام يمكنك التجاوز،
                      وسيُسجَّل ذلك في سجل التدقيق.
                    </Alert>
                  )}
                  {request.current_stage === "finance" && !hasErp && (
                    <Alert tone="error">
                      لا يمكن الإقفال المالي قبل إرفاق مستند إدخال الفاتورة في ERP.
                    </Alert>
                  )}
                  <Button full onClick={() => setDecisionModal("approved")}
                    disabled={request.current_stage === "finance" && !hasErp}>
                    اعتماد الطلب
                  </Button>
                  <Button full variant="secondary" onClick={() => setDecisionModal("returned")}>
                    إعادة للتعديل
                  </Button>
                  <Button full variant="danger" onClick={() => setDecisionModal("rejected")}>
                    رفض الطلب
                  </Button>
                </>
              )}

              {isSuperAdmin && (
                <Button full variant="secondary" onClick={() => setAdminNoteModal(true)}>
                  إضافة ملاحظة إدارية
                </Button>
              )}

              {(isEditable || isSuperAdmin) &&
                !["completed", "cancelled"].includes(request.status) && (
                  <Button full variant="ghost" className="text-rose-600" onClick={doCancel}>
                    إلغاء الطلب
                  </Button>
                )}

              {!isEditable && !canDecide && !isSuperAdmin && (
                <p className="py-2 text-sm text-slate-400">
                  لا توجد إجراءات متاحة لك على هذا الطلب حاليًا.
                </p>
              )}
            </div>
          </Card>

          <Card title="مؤشرات الطلب">
            <dl>
              <Row label="فاتورة المورد" value={
                hasInvoice
                  ? <Badge className="bg-brand-50 text-brand-700 ring-brand-200">مرفقة</Badge>
                  : <Badge className="bg-rose-50 text-rose-700 ring-rose-200">غير مرفقة</Badge>} />
              <Row label="مستند ERP" value={
                hasErp
                  ? <Badge className="bg-brand-50 text-brand-700 ring-brand-200">مرفق</Badge>
                  : <Badge className="bg-amber-50 text-amber-800 ring-amber-200">غير مرفق</Badge>} />
              <Row label="تاريخ الإرسال" value={formatDateTime(request.submitted_at)} />
              <Row label="تاريخ الاكتمال" value={formatDateTime(request.completed_at)} />
              <Row label="عدد المرفقات" value={formatNumber(documents.length)} />
            </dl>
          </Card>
        </div>
      </div>

      {/* نافذة القرار */}
      <Modal open={!!decisionModal} onClose={() => setDecisionModal(null)}
        title={decisionModal === "approved" ? "اعتماد الطلب"
          : decisionModal === "rejected" ? "رفض الطلب" : "إعادة الطلب للتعديل"}>
        <div className="space-y-4">
          <Field label="الملاحظة"
            required={decisionModal !== "approved"}
            hint={decisionModal === "approved"
              ? "اختيارية — تُسجَّل في سجل الاعتمادات"
              : "إلزامية — يجب توضيح السبب"}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
          </Field>

          {needsOverride && (
            <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm
                              text-amber-900 ring-1 ring-amber-200">
              <input type="checkbox" checked={override}
                onChange={(e) => setOverride(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600" />
              أؤكد تنفيذ هذا القرار كتجاوز إداري، وأعلم أنه سيُسجَّل في سجل التدقيق.
            </label>
          )}

          <div className="flex gap-3">
            <Button onClick={doDecide} loading={busy}
              disabled={
                (decisionModal !== "approved" && note.trim().length < 3) ||
                (needsOverride && !override)
              }>
              تأكيد
            </Button>
            <Button variant="ghost" onClick={() => setDecisionModal(null)}>إلغاء</Button>
          </div>
        </div>
      </Modal>

      {/* نافذة الملاحظة الإدارية */}
      <Modal open={adminNoteModal} onClose={() => setAdminNoteModal(false)}
        title="ملاحظة إدارية">
        <div className="space-y-4">
          <Field label="الملاحظة" required>
            <Textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={4} />
          </Field>
          <div className="flex gap-3">
            <Button loading={busy} disabled={adminNote.trim().length < 3}
              onClick={() => run(async () => {
                await addAdminNote(request.id, adminNote.trim());
                setAdminNoteModal(false); setAdminNote("");
              }, "تمت إضافة الملاحظة الإدارية")}>
              حفظ
            </Button>
            <Button variant="ghost" onClick={() => setAdminNoteModal(false)}>إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function RequestDetailPage() {
  return <Suspense fallback={<Spinner />}><RequestInner /></Suspense>;
}
