"use client";
import { useRef, useState } from "react";
import { uploadDocument } from "@/lib/api";
import { checkFile } from "@/lib/validation";
import { ACCEPTED_ACCEPT_ATTR } from "@/lib/constants";
import { DOCUMENT_TYPE_LABEL } from "@/lib/labels";
import { Alert, Button } from "./ui";
import type { DocumentType } from "@/types/database";

export function FileUpload({
  requestId, documentType, onUploaded, label,
}: {
  requestId: string;
  documentType: DocumentType;
  onUploaded: () => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setError(null);

    // فحص أولي في المتصفح — الخادم يعيد الفحص بعد الرفع
    const check = checkFile(file);
    if (!check.ok) { setError(check.error!); return; }

    setBusy(true);
    try {
      await uploadDocument(requestId, documentType, file, setStage);
      onUploaded();
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر رفع الملف");
    } finally {
      setBusy(false);
      setStage("");
    }
  };

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" accept={ACCEPTED_ACCEPT_ATTR} className="hidden"
        onChange={(e) => handle(e.target.files?.[0])} />
      <Button type="button" variant="secondary" loading={busy}
        onClick={() => inputRef.current?.click()}>
        {busy ? stage : (label ?? `إرفاق ${DOCUMENT_TYPE_LABEL[documentType]}`)}
      </Button>
      <p className="text-xs text-slate-400">
        الأنواع المسموحة: PDF، JPG، PNG، WEBP — بحد أقصى 10 ميجابايت للملف.
      </p>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
