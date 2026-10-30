import { standardsRegistry } from "@/server/domain/projects";
import { requireCtx } from "@/server/web";
import { Badge, PageHeader } from "@/components/ui";

export default async function Standards() {
  const { ctx } = await requireCtx();
  const eds = await standardsRegistry(ctx);
  return (
    <>
      <PageHeader title="المواصفات والإصدارات والترخيص" subtitle="سجل التحقق من الإصدارات وحالة حقوق استخدام المحتوى (Licensing Gate)." />
      <div className="space-y-4">
        {eds.map((e) => (
          <div key={e.id} className="card">
            <div className="flex flex-wrap items-center gap-2">
              <h2>{e.code.replace("ISO", "ISO ")}:{e.edition_label} — {e.title_ar}</h2>
              <Badge tone={e.status === "PUBLISHED" ? "green" : "amber"}>{e.status === "PUBLISHED" ? "منشور" : "في فترة انتقال / مسحوب"}</Badge>
              {e.is_default && <Badge tone="blue">الإصدار الافتراضي للمشاريع الجديدة</Badge>}
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">تاريخ النشر</dt><dd dir="ltr" className="text-end sm:text-start">{e.published_on ? new Date(e.published_on).toISOString().slice(0, 10) : "—"}</dd></div>
              <div><dt className="text-slate-500">تاريخ التحقق</dt><dd>{new Date(e.verified_at).toISOString().slice(0, 10)}</dd></div>
              <div className="sm:col-span-2"><dt className="text-slate-500">مصدر التحقق</dt><dd className="break-words text-xs" dir="ltr">{e.verification_source}</dd></div>
              {e.transition_note && <div className="sm:col-span-2"><dt className="text-slate-500">الانتقال</dt><dd className="text-xs" dir="ltr">{e.transition_note}</dd></div>}
            </dl>
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
              <strong>الترخيص: </strong>
              {e.grants.length === 0 ? (
                <span className="text-amber-800">لا يوجد ترخيص مسجل لاستخدام نص هذه المواصفة أو معالجته بالذكاء الاصطناعي. المنصة تعمل بمجالات تشغيلية أصلية ولا تدّعي تغطية كاملة للمتطلبات.</span>
              ) : (
                e.grants.map((g: { licensor: string; status: string; scope: string; ai_processing_allowed: boolean }, i: number) => (
                  <span key={i}>{g.licensor} — {g.status} — {g.scope} — معالجة AI: {g.ai_processing_allowed ? "مسموحة" : "غير مسموحة"}</span>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
