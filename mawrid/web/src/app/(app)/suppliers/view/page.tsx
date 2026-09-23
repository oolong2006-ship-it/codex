"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useCompare } from "@/lib/compare-context";
import { MAX_COMPARE } from "@/lib/constants";
import { deleteSupplier, getSupplier } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import type { Supplier } from "@/lib/types";
import { dbErrorMessage } from "@/lib/validation";
import { useToast } from "@/components/Toast";
import { Button, DemoBadge, Notice, Spinner, StatusBadge, Stars, buttonClass } from "@/components/ui";

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

function Link2({ v, href }: { v: string | null; href: string }) {
  if (!v) return <>—</>;
  const external = href.startsWith("http");
  return (
    <a href={href} dir="ltr" className="text-brand underline-offset-4 hover:underline"
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{v}</a>
  );
}

function Section({ title, rows }: { title: string; rows: [string, React.ReactNode][] }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-[15px] font-semibold text-brand">{title}</h2>
      <dl className="grid grid-cols-1 gap-x-3 text-[15px] sm:grid-cols-[170px_1fr] sm:gap-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="mt-2 text-muted sm:mt-0">{k}</dt>
            <dd className="m-0 break-words">{v || v === 0 ? v : "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function View() {
  const id = useSearchParams().get("id") ?? "";
  const { canEdit, isAdmin } = useAuth();
  const compare = useCompare();
  const toast = useToast();
  const router = useRouter();
  const [s, setS] = useState<Supplier | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) { setS(null); return; }
    getSupplier(id).then(setS).catch((e) => setError(dbErrorMessage(e)));
  }, [id]);

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (s === undefined) return <Spinner />;
  if (s === null) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted">المورد غير موجود أو حُذف.</p>
        <Link href="/suppliers/" className="mt-4 inline-block text-brand underline">العودة للموردين</Link>
      </div>
    );
  }

  const wa = (s.whatsapp ?? "").replace(/\D/g, "").replace(/^0(5\d{8})$/, "966$1");
  const remove = async () => {
    if (!confirm(`حذف المورد «${s.name}» نهائياً؟`)) return;
    setDeleting(true);
    try {
      await deleteSupplier(s.id);
      compare.remove(s.id);
      toast("تم حذف المورد");
      router.replace("/suppliers/");
    } catch (e) {
      toast(dbErrorMessage(e as Error));
      setDeleting(false);
    }
  };

  return (
    <article className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <button type="button" onClick={() => router.back()} className="mb-3 text-sm text-brand">→ رجوع</button>
      <h1 className="m-0 text-2xl font-bold">{s.name}</h1>
      <div className="mb-5 mt-2 flex flex-wrap items-center gap-2">
        <StatusBadge status={s.status} /><DemoBadge demo={s.demo} /><Stars n={s.rating} />
      </div>

      <Section title="البيانات النظامية" rows={[
        ["الاسم النظامي", s.legal_name],
        ["السجل التجاري", s.cr && <span dir="ltr">{s.cr}</span>],
        ["الرقم الضريبي", s.vat && <span dir="ltr">{s.vat}</span>],
        ["ترخيص الغذاء والدواء", s.sfda_license],
        ["المدينة", `${s.city}${s.district ? ` – ${s.district}` : ""}`],
        ["العنوان الوطني", s.national_address],
      ]} />
      <Section title="التواصل" rows={[
        ["مسؤول المبيعات", s.contact_name && `${s.contact_name}${s.contact_role ? ` (${s.contact_role})` : ""}`],
        ["الجوال", <Link2 key="p" v={s.phone} href={`tel:${s.phone}`} />],
        ["واتساب", wa ? <Link2 key="w" v={s.whatsapp} href={`https://wa.me/${wa}`} /> : null],
        ["البريد", <Link2 key="e" v={s.email} href={`mailto:${s.email}`} />],
        ["الموقع", s.website ? <Link2 key="s" v={s.website} href={safeUrl(s.website)} /> : null],
      ]} />
      <Section title="المنتجات والتصنيفات" rows={[
        ["التصنيفات", s.categories.join("، ")],
        ["أهم المنتجات", s.products],
      ]} />
      <Section title="التوريد والشروط" rows={[
        ["مدن التغطية", s.coverage.join("، ")],
        ["أيام التوريد", s.delivery_days.join("، ")],
        ["مدة التوريد", s.lead_time],
        ["الحد الأدنى للطلب", s.moq],
        ["شروط الدفع", s.payment && `${s.payment}${s.credit_days ? ` – ${s.credit_days} يوم` : ""}`],
      ]} />
      <Section title="الجودة والمصدر" rows={[
        ["الشهادات", s.certificates.join("، ")],
        ["ملاحظات المشتريات", s.notes && <span className="whitespace-pre-line">{s.notes}</span>],
        ["مصدر البيانات", s.source],
      ]} />
      <p className="m-0 text-[13px] text-muted">
        آخر تحديث: {fmtDate(s.updated_at)}
      </p>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        {canEdit && <Link href={`/suppliers/edit/?id=${s.id}`} className={buttonClass("primary")}>تعديل</Link>}
        <Button onClick={() => { if (!compare.toggle(s.id)) toast(`يمكن مقارنة ${MAX_COMPARE} موردين كحد أقصى`); }}>
          {compare.has(s.id) ? "إزالة من المقارنة" : "أضف للمقارنة"}
        </Button>
        {isAdmin && <Button variant="danger" onClick={remove} loading={deleting}>حذف</Button>}
      </div>
    </article>
  );
}

export default function ViewSupplierPage() {
  return <Suspense fallback={<Spinner />}><View /></Suspense>;
}
