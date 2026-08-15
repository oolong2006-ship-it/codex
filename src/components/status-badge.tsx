"use client";

import { Badge } from "@/components/ui";
import { SUPPLIER_STATUS_META, DOCUMENT_STATUS_META } from "@/lib/constants";
import { useLang } from "@/lib/i18n/context";
import type { SupplierStatus, DocumentStatus } from "@prisma/client";

export function StatusBadge({ status }: { status: SupplierStatus }) {
  const { lang } = useLang();
  const m = SUPPLIER_STATUS_META[status];
  return <Badge tone={m.tone}>{lang === "ar" ? m.ar : m.en}</Badge>;
}

export function DocStatusBadge({ status }: { status: DocumentStatus }) {
  const { lang } = useLang();
  const m = DOCUMENT_STATUS_META[status];
  return <Badge tone={m.tone}>{lang === "ar" ? m.ar : m.en}</Badge>;
}
