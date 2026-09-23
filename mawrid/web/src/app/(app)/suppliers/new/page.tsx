"use client";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { createSupplier } from "@/lib/data";
import { dbErrorMessage } from "@/lib/validation";
import { SupplierForm } from "@/components/SupplierForm";
import { useToast } from "@/components/Toast";
import { Notice } from "@/components/ui";

export default function NewSupplierPage() {
  const { canEdit } = useAuth();
  const router = useRouter();
  const toast = useToast();
  if (!canEdit) return <Notice>ليست لديك صلاحية إضافة موردين.</Notice>;
  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <h1 className="mb-4 mt-0 text-2xl font-bold">إضافة مورد</h1>
      <SupplierForm submitLabel="حفظ المورد" onCancel={() => router.back()}
        onSubmit={async (data) => {
          try {
            const id = await createSupplier(data);
            toast("تم حفظ المورد");
            router.replace(`/suppliers/view/?id=${id}`);
          } catch (e) {
            toast(dbErrorMessage(e as Error));
          }
        }} />
    </div>
  );
}
