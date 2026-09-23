"use client";
import Link from "next/link";
import type { Supplier } from "@/lib/types";
import { DemoBadge, StatusBadge, Stars, Tag, buttonClass } from "./ui";

export function SupplierCard({ s, compared, onCompare }: {
  s: Supplier; compared: boolean; onCompare: () => void;
}) {
  return (
    <article className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5"><StatusBadge status={s.status} /><DemoBadge demo={s.demo} /></div>
        <Stars n={s.rating} />
      </div>
      <div>
        <h3 className="m-0 text-lg font-semibold leading-snug">
          <Link href={`/suppliers/view/?id=${s.id}`} className="hover:underline">{s.name}</Link>
        </h3>
        <p className="m-0 text-sm text-muted">{s.city}{s.district ? ` – ${s.district}` : ""}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {s.categories.slice(0, 4).map((c) => <Tag key={c}>{c}</Tag>)}
        {s.categories.length > 4 && <Tag>+{s.categories.length - 4}</Tag>}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px] text-muted">
        <span>الدفع: <b className="font-semibold text-ink">{s.payment ?? "—"}{s.credit_days ? ` ${s.credit_days} يوم` : ""}</b></span>
        <span>الحد الأدنى: <b className="font-semibold text-ink">{s.moq ?? "—"}</b></span>
        <span>التوريد: <b className="font-semibold text-ink">{s.lead_time ?? "—"}</b></span>
        <span>التغطية: <b className="font-semibold text-ink">{s.coverage.length} مدينة</b></span>
      </div>
      <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-muted">
        <input type="checkbox" checked={compared} onChange={onCompare} className="accent-[var(--brand)]" /> أضف للمقارنة
      </label>
      <div className="mt-auto flex gap-2">
        <Link href={`/suppliers/view/?id=${s.id}`} className={buttonClass("default", "flex-1 py-2")}>التفاصيل</Link>
        {s.phone && <a href={`tel:${s.phone}`} className={buttonClass("default", "flex-1 py-2")}>اتصال</a>}
      </div>
    </article>
  );
}
