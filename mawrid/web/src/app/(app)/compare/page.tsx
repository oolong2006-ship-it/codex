"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCompare } from "@/lib/compare-context";
import { MAX_COMPARE } from "@/lib/constants";
import { getSuppliersByIds } from "@/lib/data";
import type { Supplier } from "@/lib/types";
import { dbErrorMessage } from "@/lib/validation";
import { Notice, Spinner, Stars } from "@/components/ui";

const ROWS: [string, (s: Supplier) => React.ReactNode][] = [
  ["المدينة", (s) => s.city],
  ["التوثيق", (s) => s.status],
  ["التقييم", (s) => <Stars n={s.rating} />],
  ["التصنيفات", (s) => s.categories.join("، ")],
  ["الدفع", (s) => s.payment && `${s.payment}${s.credit_days ? ` – ${s.credit_days} يوم` : ""}`],
  ["الحد الأدنى", (s) => s.moq],
  ["مدة التوريد", (s) => s.lead_time],
  ["أيام التوريد", (s) => s.delivery_days.join("، ")],
  ["التغطية", (s) => s.coverage.join("، ")],
  ["الشهادات", (s) => s.certificates.join("، ")],
  ["التواصل", (s) => [s.contact_name, s.phone].filter(Boolean).join(" ")],
];

function Compare() {
  const sp = useSearchParams();
  const compare = useCompare();
  const ids = (sp.get("ids") ?? "").split(",").filter(Boolean).slice(0, MAX_COMPARE);
  const key = ids.join(",");
  const [list, setList] = useState<Supplier[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSuppliersByIds(key.split(",").filter(Boolean)).then(setList).catch((e) => setError(dbErrorMessage(e)));
  }, [key]);

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!list) return <Spinner />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="m-0 text-2xl font-bold">مقارنة الموردين</h1>
        <Link href="/suppliers/" className="text-brand underline-offset-4 hover:underline">العودة للموردين</Link>
      </div>
      {list.length < 2 ? (
        <Notice>اختر موردَين على الأقل من القائمة للمقارنة.</Notice>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky right-0 w-[110px] border-b border-line bg-surface p-2.5" />
                {list.map((s) => (
                  <th key={s.id} className="border-b border-line p-2.5 text-start align-top font-bold">
                    <Link href={`/suppliers/view/?id=${s.id}`} className="hover:underline">{s.name}</Link>
                    <button type="button" onClick={() => { compare.remove(s.id); setList((l) => l && l.filter((x) => x.id !== s.id)); }}
                      className="block text-xs font-normal text-muted hover:text-danger">إزالة من المقارنة</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, fn]) => (
                <tr key={label}>
                  <th className="sticky right-0 border-b border-line bg-surface p-2.5 text-start align-top font-medium text-muted">{label}</th>
                  {list.map((s) => <td key={s.id} className="border-b border-line p-2.5 align-top">{fn(s) || "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  return <Suspense fallback={<Spinner />}><Compare /></Suspense>;
}
