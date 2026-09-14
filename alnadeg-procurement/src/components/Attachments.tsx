"use client";
import { useState } from "react";
import { getDocumentUrl } from "@/lib/api";
import { deleteDocument } from "@/lib/data";
import { DOCUMENT_TYPE_LABEL } from "@/lib/labels";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { Alert, Button, EmptyState } from "./ui";
import type { RequestDocumentRow } from "@/types/database";

export function Attachments({
  documents, canDelete, onChanged,
}: {
  documents: RequestDocumentRow[];
  canDelete: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (id: string) => {
    setError(null);
    setBusy(id);
    try {
      // رابط موقّع صالح 60 ثانية فقط — لا روابط عامة دائمة
      const url = await getDocumentUrl(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر فتح المستند");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (doc: RequestDocumentRow) => {
    if (!confirm(`هل تريد حذف المرفق «${doc.file_name}»؟`)) return;
    setError(null);
    setBusy(doc.id);
    try {
      await deleteDocument(doc.id, doc.storage_path);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حذف المرفق");
    } finally {
      setBusy(null);
    }
  };

  if (documents.length === 0) {
    return <EmptyState title="لا توجد مرفقات" hint="فاتورة المورد مرفق إلزامي قبل الإرسال" />;
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <ul className="space-y-2">
        {documents.map((d) => (
          <li key={d.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg
                       bg-slate-50 px-3.5 py-3 ring-1 ring-slate-200">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-700">{d.file_name}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {DOCUMENT_TYPE_LABEL[d.document_type]} · {formatFileSize(d.file_size)}
                {" · "}{formatDateTime(d.created_at)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="px-3 py-1.5"
                loading={busy === d.id} onClick={() => open(d.id)}>
                معاينة
              </Button>
              {canDelete && (
                <Button variant="ghost" className="px-3 py-1.5 text-rose-600"
                  onClick={() => remove(d)}>
                  حذف
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
