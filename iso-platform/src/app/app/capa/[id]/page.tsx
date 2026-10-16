import Link from "next/link";
import {
  addAction, cancelAction, capaFormOptions, closeCorrectionOnly, completeAction, getNc, NC_STATUS_AR, recordAnalysis, recordContainment, SEVERITY_AR, SOURCE_AR, verifyEffectiveness,
} from "@/server/domain/capa";
import { can } from "@/server/rbac";
import { act, requireCtx, str } from "@/server/web";
import { notFoundOnMissing } from "@/server/web-errors";
import { EVENT_AR, NC_TONE, SEV_TONE } from "@/components/capa";
import { Badge, Flash, PageHeader, flash, type SP } from "@/components/ui";

const p = (fd: FormData) => `/app/capa/${str(fd, "ncId")}`;

async function containAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  await act(p(fd), "سُجّل الاحتواء", () => recordContainment(ctx, str(fd, "ncId"), str(fd, "containment")));
}
async function analysisAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  await act(p(fd), "سُجّل تحليل السبب الجذري", () =>
    recordAnalysis(ctx, str(fd, "ncId"), { method: str(fd, "method") as "FIVE_WHYS", whys: fd.getAll("why").map(String), rootCause: str(fd, "rootCause") }),
  );
}
async function addActionAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  await act(p(fd), "أُضيف الإجراء التصحيحي", () => addAction(ctx, str(fd, "ncId"), { description: str(fd, "description"), ownerId: str(fd, "ownerId"), dueOn: str(fd, "dueOn") }));
}
async function completeActionAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  await act(p(fd), "سُجّل تنفيذ الإجراء", () => completeAction(ctx, str(fd, "actionId"), str(fd, "note")));
}
async function cancelActionAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  await act(p(fd), "أُلغي الإجراء", () => cancelAction(ctx, str(fd, "actionId"), str(fd, "reason")));
}
async function verifyAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  const result = str(fd, "result") as "EFFECTIVE";
  await act(p(fd), result === "EFFECTIVE" ? "تحقق الفاعلية: أُغلقت الحالة" : "غير فعّال: أُعيد فتح الحالة لدورة تحليل جديدة", () =>
    verifyEffectiveness(ctx, str(fd, "ncId"), { result, method: str(fd, "method"), evidence: str(fd, "evidence") }),
  );
}
async function correctionOnlyAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  await act(p(fd), "أُغلقت الحالة بالتصحيح فقط", () => closeCorrectionOnly(ctx, str(fd, "ncId"), str(fd, "justification")));
}

const STEPS = ["OPEN", "CONTAINED", "ACTION_PLANNED", "IMPLEMENTED", "CLOSED"];
const fmt = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") : "—");

export default async function NcPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const { ctx } = await requireCtx();
  const [r, opts, f] = await Promise.all([getNc(ctx, id), capaFormOptions(ctx), flash(searchParams)]).catch(notFoundOnMissing);
  const { nc, analyses, actions, checks, timeline } = r;
  const manage = can(ctx.role, "nc.manage");
  const current = analyses.find((a) => a.cycle === nc.cycle);
  const cycleActions = actions.filter((a) => a.cycle === nc.cycle);
  const hidden = <input type="hidden" name="ncId" value={nc.id} />;
  const today = new Date().toISOString().slice(0, 10);
  const at = STEPS.indexOf(nc.status);
  return (
    <>
      <PageHeader
        title={nc.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono" dir="ltr">{nc.code}</span>
            <Badge tone={NC_TONE[nc.status]}>{NC_STATUS_AR[nc.status]}</Badge>
            <Badge tone={SEV_TONE[nc.severity as keyof typeof SEV_TONE]}>{SEVERITY_AR[nc.severity]}</Badge>
            {nc.cycle > 1 && <Badge tone="amber">دورة التحليل {nc.cycle}</Badge>}
          </span>
        }
        actions={
          <>
            <a className="btn-ghost" href={`/api/capa/${nc.id}/report?format=docx`}>تقرير Word</a>
            <a className="btn-ghost" href={`/api/capa/${nc.id}/report?format=pdf`}>تقرير PDF</a>
            <Link className="btn-ghost" href="/app/capa">كل الحالات</Link>
          </>
        }
      />
      <Flash {...f} />
      <ol className="mb-6 flex flex-wrap gap-2 text-xs" aria-label="مراحل الحالة">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded-full px-3 py-1 ${i < at || nc.status === "CLOSED" ? "bg-emerald-100 text-emerald-800" : i === at ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"}`}>
            {i + 1}. {NC_STATUS_AR[s]}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className="card text-sm">
            <h2 className="mb-2">الوصف</h2>
            <p className="whitespace-pre-line leading-7">{nc.description}</p>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div><dt className="text-slate-500">المصدر</dt><dd>{SOURCE_AR[nc.source]}</dd></div>
              <div><dt className="text-slate-500">تاريخ الاكتشاف</dt><dd>{new Date(nc.detected_on).toISOString().slice(0, 10)}</dd></div>
              <div><dt className="text-slate-500">العملية / الموقع</dt><dd>{nc.process_code ?? "—"} / {nc.site_name ?? "—"}</dd></div>
              <div><dt className="text-slate-500">أبلغ عنها</dt><dd>{nc.reporter_name} — {fmt(nc.reported_at)}</dd></div>
            </dl>
          </section>

          <section className="card text-sm">
            <h2 className="mb-2">1. الاحتواء الفوري</h2>
            {nc.containment ? (
              <p>{nc.containment} <span className="text-xs text-slate-500">— {nc.containment_name}، {fmt(nc.containment_at)}</span></p>
            ) : manage && nc.status === "OPEN" ? (
              <form action={containAction} className="space-y-2">{hidden}
                <textarea name="containment" className="input" rows={3} required minLength={10} placeholder="ما الذي تم فوراً لاحتواء الأثر؟ (عزل، إيقاف، استرجاع، إبلاغ…)" />
                <button className="btn-primary">تسجيل الاحتواء</button>
              </form>
            ) : (
              <p className="text-slate-500">بانتظار مدير الجودة.</p>
            )}
          </section>

          <section className="card text-sm">
            <h2 className="mb-2">2. تحليل السبب الجذري</h2>
            {analyses.map((a) => (
              <div key={a.id} className={`mb-3 rounded-lg border p-3 ${a.cycle === nc.cycle ? "border-brand-100 bg-brand-50" : "border-slate-200"}`}>
                <p className="mb-1 text-xs text-slate-500">الدورة {a.cycle} — {a.analyst_name}، {fmt(a.analyzed_at)}</p>
                {(a.whys as string[]).map((w, i) => <p key={i}>لماذا {i + 1}: {w}</p>)}
                <p className="mt-1 font-semibold">السبب الجذري: {a.root_cause}</p>
              </div>
            ))}
            {!current && nc.status === "CONTAINED" && manage && (
              <form action={analysisAction} className="space-y-2">{hidden}
                <label className="block"><span className="label">الطريقة</span>
                  <select name="method" className="input max-w-xs"><option value="FIVE_WHYS">لماذا الخمسة</option><option value="FISHBONE">مخطط عظم السمكة</option><option value="OTHER">أخرى</option></select>
                </label>
                {[1, 2, 3, 4, 5].map((i) => <input key={i} name="why" className="input" placeholder={`لماذا ${i}؟`} />)}
                <textarea name="rootCause" className="input" rows={3} required minLength={15} placeholder="السبب الجذري" />
                <button className="btn-primary">تسجيل التحليل</button>
                <p className="text-xs text-slate-500">التحليل سجل غير قابل للتعديل بعد حفظه.</p>
              </form>
            )}
            {!current && nc.status !== "CONTAINED" && analyses.length === 0 && <p className="text-slate-500">يُسجل بعد الاحتواء.</p>}
          </section>

          <section className="card text-sm">
            <h2 className="mb-2">3. الإجراءات التصحيحية</h2>
            {actions.length > 0 && (
              <div className="table-wrap mb-3">
                <table className="table">
                  <thead><tr><th>الإجراء</th><th>المسؤول</th><th>الموعد</th><th>الحالة</th></tr></thead>
                  <tbody>
                    {actions.map((a) => (
                      <tr key={a.id}>
                        <td>
                          {a.cycle !== nc.cycle && <Badge>دورة {a.cycle}</Badge>} {a.description}
                          {a.status === "DONE" && <p className="mt-1 text-xs text-emerald-800">نُفّذ: {a.completion_note} — {a.completer_name}، {fmt(a.completed_at)}</p>}
                          {a.status === "CANCELLED" && <p className="mt-1 text-xs text-slate-500">أُلغي: {a.cancel_reason}</p>}
                          {a.status === "PLANNED" && nc.status === "ACTION_PLANNED" && (a.owner_id === ctx.userId || manage) && ctx.role !== "VIEWER" && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-brand-600">تسجيل التنفيذ{manage && " / إلغاء"}</summary>
                              <form action={completeActionAction} className="mt-2 flex flex-wrap gap-2">{hidden}
                                <input type="hidden" name="actionId" value={a.id} />
                                <input name="note" className="input flex-1" required minLength={10} placeholder="ما الذي نُفذ فعلاً وأين الدليل؟" />
                                <button className="btn-accent">تم التنفيذ</button>
                              </form>
                              {manage && (
                                <form action={cancelActionAction} className="mt-2 flex flex-wrap gap-2">{hidden}
                                  <input type="hidden" name="actionId" value={a.id} />
                                  <input name="reason" className="input flex-1" required minLength={5} placeholder="سبب الإلغاء" />
                                  <button className="btn-danger">إلغاء</button>
                                </form>
                              )}
                            </details>
                          )}
                        </td>
                        <td>{a.owner_name}</td>
                        <td className={`whitespace-nowrap ${a.status === "PLANNED" && new Date(a.due_on).toISOString().slice(0, 10) < today ? "font-bold text-red-700" : ""}`}>{new Date(a.due_on).toISOString().slice(0, 10)}</td>
                        <td>{{ PLANNED: "مخطط", DONE: "منفذ", CANCELLED: "ملغى" }[a.status as string]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {manage && current && ["CONTAINED", "ACTION_PLANNED"].includes(nc.status) && (
              <form action={addActionAction} className="grid gap-2 sm:grid-cols-4">{hidden}
                <input name="description" className="input sm:col-span-2" required minLength={10} placeholder="الإجراء التصحيحي لإزالة السبب الجذري" />
                <select name="ownerId" className="input" required defaultValue=""><option value="" disabled>المسؤول</option>{opts.members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select>
                <input type="date" name="dueOn" className="input" required min={today} />
                <button className="btn-ghost sm:col-span-4">إضافة إجراء</button>
              </form>
            )}
            {cycleActions.length === 0 && !current && <p className="text-slate-500">تُحدد بعد تحليل السبب الجذري.</p>}
          </section>

          <section className="card text-sm">
            <h2 className="mb-2">4. التحقق من الفاعلية</h2>
            {checks.map((c) => (
              <div key={c.id} className={`mb-2 rounded-lg p-3 ${c.result === "EFFECTIVE" ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>
                <p className="font-semibold">الدورة {c.cycle}: {c.result === "EFFECTIVE" ? "فعّال" : "غير فعّال — أُعيد التحليل"}</p>
                <p>الطريقة: {c.method}</p>
                <p>الدليل: {c.evidence_note}</p>
                <p className="text-xs opacity-75">{c.verifier_name}، {fmt(c.performed_at)}</p>
              </div>
            ))}
            {nc.status === "IMPLEMENTED" && can(ctx.role, "capa.verify") && (
              <form action={verifyAction} className="space-y-2">{hidden}
                <p className="text-xs text-amber-800">يجب أن يكون المتحقق مستقلاً عن منفذي الإجراءات، وأن يفحص أدلة فعلية بعد فترة تشغيل كافية.</p>
                <input name="method" className="input" required minLength={5} placeholder="طريقة التحقق (مثال: مراجعة سجلات الاستلام لأسبوعين)" />
                <textarea name="evidence" className="input" rows={3} required minLength={15} placeholder="الدليل الذي فُحص فعلاً" />
                <div className="flex flex-wrap gap-2">
                  <button name="result" value="EFFECTIVE" className="btn-accent">فعّال — إغلاق</button>
                  <button name="result" value="INEFFECTIVE" className="btn-danger">غير فعّال — إعادة التحليل</button>
                </div>
              </form>
            )}
            {nc.status === "CLOSED" && (
              <p className="mt-2 text-emerald-800">
                {nc.closure_type === "EFFECTIVE_CAPA" ? "أُغلقت بعد التحقق من الفاعلية" : `أُغلقت بالتصحيح فقط: ${nc.closure_note}`} — {nc.closer_name}، {fmt(nc.closed_at)}
              </p>
            )}
          </section>

          {manage && nc.status === "CONTAINED" && nc.severity === "MINOR" && cycleActions.filter((a) => a.status !== "CANCELLED").length === 0 && (
            <details className="card text-sm">
              <summary className="cursor-pointer font-semibold">إغلاق بالتصحيح فقط (للحالات البسيطة)</summary>
              <form action={correctionOnlyAction} className="mt-3 space-y-2">{hidden}
                <textarea name="justification" className="input" rows={3} required minLength={15} placeholder="لماذا لا تحتاج الحالة إجراءً تصحيحياً؟ (حالة فردية، لا نمط متكرر…)" />
                <button className="btn-ghost">إغلاق</button>
              </form>
            </details>
          )}
        </div>

        <aside className="card h-fit">
          <h2 className="mb-3">السجل الزمني</h2>
          <ol className="space-y-2 text-xs">
            {timeline.map((t, i) => (
              <li key={i} className="border-s-2 border-brand-100 ps-3">
                <p className="font-semibold text-slate-700">{EVENT_AR[t.action] ?? t.action}</p>
                <p className="text-slate-500">{t.actor_name} — {fmt(t.at)}</p>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}
