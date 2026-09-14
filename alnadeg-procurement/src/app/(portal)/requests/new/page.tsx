"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { createRequest } from "@/lib/data";
import { REQUESTER_ROLES } from "@/lib/constants";
import { RequestForm } from "@/components/RequestForm";
import { Alert } from "@/components/ui";
import type { PurchaseRequestInput } from "@/lib/validation";

export default function NewRequestPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (profile && !REQUESTER_ROLES.includes(profile.role)) {
    return <Alert tone="warning" title="غير مصرّح">
      دورك الحالي لا يتيح إنشاء طلبات شراء.
    </Alert>;
  }

  const submit = async (values: PurchaseRequestInput) => {
    if (!profile) return;
    setError(null);
    setBusy(true);
    try {
      const created = await createRequest(
        { ...values, quantity: values.quantity ?? null, request_date: new Date().toISOString().slice(0, 10) },
        profile.id,
      );
      // بعد الحفظ ننتقل لصفحة التفاصيل لإرفاق الفاتورة ثم الإرسال
      router.push(`/request/?id=${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ الطلب");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-extrabold text-brand-800">طلب شراء جديد</h1>
        <p className="mt-1 text-sm text-slate-500">
          احفظ الطلب أولاً كمسودة، ثم أرفق فاتورة المورد وأرسله لمسار الاعتماد.
        </p>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

      <RequestForm onSubmit={submit} submitLabel="حفظ كمسودة" busy={busy} />
    </div>
  );
}
