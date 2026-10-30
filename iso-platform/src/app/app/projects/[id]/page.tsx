import { notFoundOnMissing } from "@/server/web-errors";
import Link from "next/link";
import { listDocuments } from "@/server/domain/documents";
import { getIntakeState, getProject } from "@/server/domain/projects";
import { requireCtx } from "@/server/web";
import { PageHeader, StatusBadge } from "@/components/ui";

export default async function ProjectOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireCtx();
  const [p, intake, docs] = await Promise.all([getProject(ctx, id), getIntakeState(ctx, id), listDocuments(ctx, id)]).catch(notFoundOnMissing);
  const order = ["INTAKE", "BLUEPRINT", "SCOPE_APPROVED", "DOCUMENTING", "OPERATING"];
  const at = order.indexOf(p.status);
  const steps = [
    { n: 1, t: "المقابلة التشخيصية", d: `${intake.progress.answered}/${intake.progress.total} سؤال`, href: `/app/projects/${id}/intake`, done: intake.status === "COMPLETED" },
    { n: 2, t: "هيكل النظام (Blueprint)", d: "العمليات، الانطباق، المخاطر، خطة الوثائق", href: `/app/projects/${id}/blueprint`, done: at >= 1 },
    { n: 3, t: "اعتماد النطاق", d: "قرار العميل قبل التوليد الشامل", href: `/app/projects/${id}/blueprint#scope`, done: at >= 2 },
    { n: 4, t: "الوثائق المضبوطة", d: `${docs.length} وثيقة`, href: `/app/documents?project=${id}`, done: docs.length > 0 && docs.every((d) => d.effective_version) },
    { n: 5, t: "التشغيل والأدلة والتدقيق", d: "المرحلة P3 — قيد البناء", href: "#", done: false },
  ];
  return (
    <>
      <PageHeader title={p.title} subtitle={<>ISO 9001:{p.edition.edition_label} — <StatusBadge status={p.status} /></>} />
      {!p.license.active && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          لا يوجد ترخيص نشط لمحتوى ISO 9001:2026. يُبنى النظام بمجالات تشغيلية أصلية؛ تصنيف «مطلوبة» يبقى بانتظار التحقق بمرجع مرخّص.
        </div>
      )}
      <ol className="space-y-3">
        {steps.map((s) => (
          <li key={s.n} className="card flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${s.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{s.done ? "✓" : s.n}</span>
              <div><p className="font-semibold">{s.t}</p><p className="text-xs text-slate-500">{s.d}</p></div>
            </div>
            {s.href !== "#" && <Link className="btn-ghost" href={s.href}>فتح</Link>}
          </li>
        ))}
      </ol>
    </>
  );
}
