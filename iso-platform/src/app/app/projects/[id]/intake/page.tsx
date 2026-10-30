import { notFoundOnMissing } from "@/server/web-errors";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { answerQuestion, getIntakeState, listFacts, verifyFact } from "@/server/domain/projects";
import { findQuestion, formatAnswer, type Question } from "@/server/packs";
import { can } from "@/server/rbac";
import { act, back, errorMessage, requireCtx, str } from "@/server/web";
import { Flash, PageHeader, StatusBadge, flash, type SP } from "@/components/ui";
import { redirect } from "next/navigation";

async function answerAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  const pid = str(fd, "projectId");
  const qid = str(fd, "questionId");
  const raw = fd.getAll("value").length > 1 || str(fd, "type") === "multi" ? fd.getAll("value").map(String) : str(fd, "value");
  try {
    await answerQuestion(ctx, pid, qid, raw);
  } catch (e) {
    back(`/app/projects/${pid}/intake?edit=${qid}`, "err", errorMessage(e));
  }
  revalidatePath(`/app/projects/${pid}`);
  redirect(`/app/projects/${pid}/intake`);
}

async function verifyAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  const pid = str(fd, "projectId");
  await act(`/app/projects/${pid}/intake`, "تم توثيق التحقق", () => verifyFact(ctx, str(fd, "factId"), str(fd, "note")));
}

function QuestionInput({ q, value }: { q: Question; value: unknown }) {
  switch (q.type) {
    case "text":
      return <textarea name="value" className="input" rows={3} required defaultValue={(value as string) ?? ""} />;
    case "number":
      return <input name="value" type="number" className="input max-w-xs" required min={q.min} max={q.max} defaultValue={(value as number) ?? ""} />;
    case "boolean":
      return (
        <div className="flex gap-4">
          {[["true", "نعم"], ["false", "لا"]].map(([v, l]) => (
            <label key={v} className="flex items-center gap-2"><input type="radio" name="value" value={v} required defaultChecked={String(value) === v} /> {l}</label>
          ))}
        </div>
      );
    case "single":
      return (
        <div className="space-y-2">
          {q.choices!.map((c) => (
            <label key={c.value} className="flex items-center gap-2"><input type="radio" name="value" value={c.value} required defaultChecked={value === c.value} /> {c.ar}</label>
          ))}
        </div>
      );
    case "multi":
      return (
        <div className="space-y-2">
          {q.choices!.map((c) => (
            <label key={c.value} className="flex items-center gap-2"><input type="checkbox" name="value" value={c.value} defaultChecked={Array.isArray(value) && value.includes(c.value)} /> {c.ar}</label>
          ))}
        </div>
      );
  }
}

const SECTION_AR = { PROFILE: "ملف النشاط", OPERATIONS: "العمليات", SECTOR: "أسئلة القطاع", SYSTEM: "الوضع الحالي للنظام" } as const;

export default async function Intake({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const { ctx } = await requireCtx();
  const [st, facts, f] = await Promise.all([getIntakeState(ctx, id), listFacts(ctx, id), flash(searchParams)]).catch(notFoundOnMissing);
  const editId = typeof sp.edit === "string" ? sp.edit : undefined;
  const q = (editId && findQuestion(st.industry, editId)) || st.next;
  const canAnswer = can(ctx.role, "intake.answer") && st.projectStatus === "INTAKE" || (can(ctx.role, "intake.answer") && st.projectStatus === "BLUEPRINT");
  const factByKey = new Map(facts.map((x) => [x.key, x]));
  return (
    <>
      <PageHeader
        title="المقابلة الاستشارية"
        subtitle={`التقدم: ${st.progress.answered} من ${st.progress.total} (${st.progress.percent}%) — الأسئلة تتغير حسب نشاطك وإجاباتك.`}
        actions={<Link className="btn-ghost" href={`/app/projects/${id}/blueprint`}>هيكل النظام</Link>}
      />
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden><div className="h-full bg-accent-500" style={{ width: `${st.progress.percent}%` }} /></div>
      <Flash {...f} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {st.conflicts.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <p className="mb-2 font-semibold">تعارضات تحتاج معالجة</p>
              <ul className="list-inside list-disc space-y-1">
                {st.conflicts.map((c) => (
                  <li key={c.id}>
                    {c.level === "WARNING" ? "تنبيه: " : ""}{c.messageAr}{" "}
                    {c.questionIds.map((qid) => <Link key={qid} className="ms-1 underline" href={`?edit=${qid}`}>تعديل</Link>)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {q && canAnswer ? (
            <form action={answerAction} className="card space-y-4">
              <input type="hidden" name="projectId" value={id} />
              <input type="hidden" name="questionId" value={q.id} />
              <input type="hidden" name="type" value={q.type} />
              <p className="text-xs font-medium text-accent-600">{SECTION_AR[q.section]}{q.critical && " — معلومة حرجة"}</p>
              <h2 className="text-base leading-7">{q.ar}</h2>
              {q.helpAr && <p className="text-sm text-slate-500">{q.helpAr}</p>}
              <QuestionInput q={q} value={st.answers[q.id]} />
              <div className="flex gap-2">
                <button className="btn-primary">حفظ ومتابعة</button>
                {editId && <Link className="btn-ghost" href="?">إلغاء</Link>}
              </div>
            </form>
          ) : (
            <div className="card text-sm">
              {st.status === "COMPLETED" ? (
                <>اكتملت المقابلة. <Link href={`/app/projects/${id}/blueprint`}>انتقل إلى هيكل النظام</Link></>
              ) : (
                "لا تملك صلاحية الإجابة أو أن النطاق معتمد."
              )}
            </div>
          )}
        </div>
        <aside className="card lg:col-span-2">
          <h2 className="mb-3">الحقائق المسجلة ومصدرها</h2>
          <ul className="space-y-3 text-sm">
            {st.questions.filter((x) => st.answers[x.id] !== undefined || x.critical).map((x) => {
              const fact = factByKey.get(x.id);
              return (
                <li key={x.id} className="border-b border-slate-100 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-600">{x.ar}</span>
                    {fact && <StatusBadge status={fact.status} />}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <strong className="break-words">{formatAnswer(x, st.answers[x.id])}</strong>
                    {canAnswer && st.answers[x.id] !== undefined && <Link className="text-xs" href={`?edit=${x.id}`}>تعديل</Link>}
                  </div>
                  {fact && fact.status === "CLIENT_PROVIDED" && can(ctx.role, "scope.approve") && (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-brand-600">توثيق التحقق بدليل</summary>
                      <form action={verifyAction} className="mt-2 flex gap-2">
                        <input type="hidden" name="projectId" value={id} />
                        <input type="hidden" name="factId" value={fact.id} />
                        <input name="note" className="input py-1" placeholder="الدليل أو المرجع" required />
                        <button className="btn-ghost py-1">تحقق</button>
                      </form>
                    </details>
                  )}
                  {fact?.status === "VERIFIED" && <p className="mt-1 text-xs text-emerald-700">الدليل: {fact.note}</p>}
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </>
  );
}
