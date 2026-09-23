"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getSupplier, updateSupplier } from "@/lib/data";
import type { Supplier } from "@/lib/types";
import { dbErrorMessage } from "@/lib/validation";
import { SupplierForm } from "@/components/SupplierForm";
import { useToast } from "@/components/Toast";
import { Notice, Spinner } from "@/components/ui";

function Edit() {
  const id = useSearchParams().get("id") ?? "";
  const { canEdit } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [s, setS] = useState<Supplier | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setS(null); return; }
    getSupplier(id).then(setS).catch((e) => setError(dbErrorMessage(e)));
  }, [id]);

  if (!canEdit) return <Notice>ليست لديك صلاحية تعديل الموردين.</Notice>;
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (s === undefined) return <Spinner />;
  if (s === null) return <Notice>المورد غير موجود.</Notice>;

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <h1 className="mb-4 mt-0 text-2xl font-bold">تعديل: {s.name}</h1>
      <SupplierForm initial={s} submitLabel="حفظ التعديلات" onCancel={() => router.back()}
        onSubmit={async (data) => {
          try {
            await updateSupplier(s.id, data);
            toast("تم حفظ التعديلات");
            router.replace(`/suppliers/view/?id=${s.id}`);
          } catch (e) {
            toast(dbErrorMessage(e as Error));
          }
        }} />
    </div>
  );
}

export default function EditSupplierPage() {
  return <Suspense fallback={<Spinner />}><Edit /></Suspense>;
}
