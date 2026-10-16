import { notFoundOnMissing } from "@/server/web-errors";
import Link from "next/link";
import { after } from "next/server";
import { drainJobs, latestJob } from "@/server/domain/jobs";
import "@/server/domain/documents";
import { approveScope, generateBlueprint, getProject, listRisks, requestDocumentGeneration } from "@/server/domain/projects";
import { isDomainError } from "@/server/errors";
import type { Blueprint } from "@/server/domain/blueprint-engine";
import { can } from "@/server/rbac";
import { act, back, errorMessage, requireCtx, str } from "@/server/web";
import { Badge, Empty, Flash, PageHeader, StatusBadge, flash, type SP } from "@/components/ui";

async function generateAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  const pid = str(fd, "projectId");
  try {
    await generateBlueprint(ctx, pid);
  } catch (e) {
    if (isDomainError(e) && e.code === "GATE_BLOCKED") {
      const g = e.details as { missingCritical: string[]; conflicts: { messageAr: string }[] };
      back(`/app/projects/${pid}/blueprint`, "err", `${e.message}: ${[...g.missingCritical.map((m) => `ناقص: ${m}`), ...g.conflicts.map((c) => c.messageAr)].join(" | ")}`);
    }
    back(`/app/projects/${pid}/blueprint`, "err", errorMessage(e));
  }
  back(`/app/projects/${pid}/blueprint`, "ok", "تم توليد هيكل النظام — راجعه ثم اعتمد النطاق");
}

async function approveScopeAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  const pid = str(fd, "projectId");
  if (fd.get("confirm") !== "on") back(`/app/projects/${pid}/blueprint#scope`, "err", "يجب تأكيد مراجعة العمليات والانطباق");
  await act(`/app/projects/${pid}/blueprint`, "تم اعتماد النطاق والهيكل", () => approveScope(ctx, pid, str(fd, "scope")));
}

async function generateDocsAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  const pid = str(fd, "projectId");
  after(() => drainJobs()); // in-process drain; the standalone worker also picks jobs up
  await act(`/app/projects/${pid}/blueprint`, "بدأ توليد الوثائق في الخلفية", () => requestDocumentGeneration(ctx, pid));
}

export default async function BlueprintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const { ctx } = await requireCtx();
  const [p, risks, job, f] = await Promise.all([getProject(ctx, id), listRisks(ctx, id), latestJob(ctx, "generate_documents", id), flash(searchParams)]).catch(notFoundOnMissing);
  const bp = p.blueprint as Blueprint | null;
  const approved = !!p.scope_approved_at;
  return (
    <>
      <PageHeader
        title="هيكل نظام إدارة الجودة"
        subtitle={<>المحرك: {bp?.engine ?? "—"} — الإصدار {p.blueprint_version} — <StatusBadge status={p.status} /></>}
        actions={<Link className="btn-ghost" href={`/app/projects/${id}/intake`}>المقابلة</Link>}
      />
      <Flash {...f} />
      {!approved && can(ctx.role, "blueprint.generate") && (
        <form action={generateAction} className="mb-6">
          <input type="hidden" name="projectId" value={id} />
          <button className="btn-primary">{bp ? "إعادة توليد الهيكل من الإجابات الحالية" : "توليد هيكل النظام"}</button>
        </form>
      )}
      {!bp ? (
        <Empty>لم يُولّد الهيكل بعد. أكمل المقابلة ثم اضغط «توليد هيكل النظام».</Empty>
      ) : (
        <div className="space-y-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{bp.licensing.note}</div>

          <section className="card">
            <h2 className="mb-1">خريطة العمليات ({bp.processes.length})</h2>
            <p className="mb-3 text-xs text-slate-500">مخصصة لقطاع: {bp.industryNameAr}. كل عملية تحمل مسوغ إدراجها.</p>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>الرمز</th><th>العملية</th><th>الفئة</th><th>المالك</th><th>المؤشرات</th><th>المسوغ</th></tr></thead>
                <tbody>
                  {bp.processes.map((pr) => (
                    <tr key={pr.code}>
                      <td className="whitespace-nowrap font-mono text-xs" dir="ltr">{pr.code}</td>
                      <td>{pr.nameAr}</td>
                      <td><Badge tone={pr.category === "CORE" ? "teal" : pr.category === "MANAGEMENT" ? "blue" : "gray"}>{({ CORE: "رئيسية", MANAGEMENT: "إدارية", SUPPORT: "داعمة" } as const)[pr.category]}</Badge></td>
                      <td>{pr.ownerRole}</td>
                      <td className="text-xs">{pr.kpis.join("، ")}</td>
                      <td className="text-xs text-slate-500">{pr.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2 className="mb-3">انطباق المجالات التشغيلية (17 مجالاً)</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {bp.applicability.map((a) => (
                <div key={a.domainCode} className={`rounded-lg border p-2 text-sm ${a.applicable ? "border-slate-200" : "border-amber-300 bg-amber-50"}`}>
                  <span className="font-mono text-xs text-slate-500" dir="ltr">{a.domainCode}</span> {a.nameAr}{" "}
                  {a.applicable ? <Badge tone="green">منطبق</Badge> : <Badge tone="amber">غير منطبق</Badge>}
                  {a.justification && <p className="mt-1 text-xs text-amber-900">{a.justification}</p>}
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2 className="mb-1">المخاطر والفرص ({risks.length})</h2>
            <p className="mb-3 text-xs text-slate-500">فرضيات مستنتجة من النشاط — تُؤكد أو تُرفض مع مالكي العمليات، وليست نتائج تقييم فعلي.</p>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>العملية</th><th>البند</th><th>النوع</th><th>الدرجة</th><th>المعالجة المقترحة</th><th>الحالة</th></tr></thead>
                <tbody>
                  {risks.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap font-mono text-xs" dir="ltr">{r.process_code}</td>
                      <td>{r.title}</td>
                      <td>{r.kind === "RISK" ? "خطر" : "فرصة"}</td>
                      <td><Badge tone={r.score >= 15 ? "red" : r.score >= 8 ? "amber" : "green"}>{r.score}</Badge></td>
                      <td className="text-xs">{r.treatment}</td>
                      <td><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2 className="mb-3">خطة الوثائق ({bp.documentPlan.length})</h2>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>الرمز</th><th>الوثيقة</th><th>التصنيف</th><th>الأساس</th></tr></thead>
                <tbody>
                  {bp.documentPlan.map((d) => (
                    <tr key={d.code}>
                      <td className="whitespace-nowrap font-mono text-xs" dir="ltr">{d.code}</td>
                      <td>{d.title}</td>
                      <td><StatusBadge status={d.classification} /></td>
                      <td className="text-xs text-slate-500">{d.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {(bp.regulatorsToVerify.length > 0 || bp.separateSchemes.length > 0) && (
            <section className="card text-sm">
              <h2 className="mb-2">متطلبات خارج نطاق ISO 9001 تحتاج تحققاً</h2>
              <ul className="list-inside list-disc space-y-1">
                {bp.regulatorsToVerify.map((r, i) => <li key={i}>{r.nameAr} — {r.topicAr} <Badge tone="amber">يحتاج مصدراً وتاريخ تحقق</Badge></li>)}
                {bp.separateSchemes.map((s, i) => <li key={`s${i}`}>{s}</li>)}
              </ul>
            </section>
          )}

          <section id="scope" className="card">
            <h2 className="mb-3">اعتماد النطاق</h2>
            {approved ? (
              <div className="space-y-3 text-sm">
                <p className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{p.scope_statement}</p>
                <p className="text-xs text-slate-500">اعتُمد في {new Date(p.scope_approved_at).toISOString().slice(0, 10)}</p>
                {can(ctx.role, "project.manage") && (
                  <form action={generateDocsAction} className="flex flex-wrap items-center gap-3">
                    <input type="hidden" name="projectId" value={id} />
                    <button className="btn-accent">توليد الوثائق المخصصة</button>
                    {job && <span className="flex items-center gap-2 text-xs">آخر مهمة: <StatusBadge status={job.status} /> {job.result && `أُنشئت ${job.result.created} من ${job.result.total}`}</span>}
                    <Link href={`/app/documents?project=${id}`}>عرض الوثائق</Link>
                  </form>
                )}
              </div>
            ) : can(ctx.role, "scope.approve") ? (
              <form action={approveScopeAction} className="space-y-3">
                <input type="hidden" name="projectId" value={id} />
                <textarea name="scope" className="input" rows={5} defaultValue={p.scope_statement ?? bp.scopeStatement} />
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="confirm" className="mt-1" />
                  <span>راجعتُ خريطة العمليات وجدول الانطباق ومسوغات عدم الانطباق، وأعتمدها أساساً لتوليد الوثائق.</span>
                </label>
                <button className="btn-primary">اعتماد النطاق والهيكل</button>
              </form>
            ) : (
              <p className="text-sm text-slate-600">بانتظار اعتماد المالك.</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
