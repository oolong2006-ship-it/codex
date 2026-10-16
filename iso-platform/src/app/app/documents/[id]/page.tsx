import { notFoundOnMissing } from "@/server/web-errors";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getProvider } from "@/server/ai/gateway";
import {
  approveVersion, contentToText, diffLines, getDocument, makeEffective, newRevision, rejectVersion, saveDraft, submitForReview, suggestSectionRewrite, textToContent,
} from "@/server/domain/documents";
import { findPlaceholders, type DocContent } from "@/server/docs/writer";
import { can } from "@/server/rbac";
import { act, back, errorMessage, requireCtx, str } from "@/server/web";
import { Badge, Flash, PageHeader, StatusBadge, flash, type SP } from "@/components/ui";

const path = (fd: FormData) => `/app/documents/${str(fd, "documentId")}`;

async function saveAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  revalidatePath(path(fd));
  await act(path(fd), "تم حفظ المسودة", () => saveDraft(ctx, str(fd, "versionId"), textToContent(str(fd, "body")), str(fd, "summary")));
}
async function submitAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  await act(path(fd), "أُرسلت للمراجعة", () => submitForReview(ctx, str(fd, "versionId")));
}
async function approveAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  await act(path(fd), "تم الاعتماد", () => approveVersion(ctx, str(fd, "versionId"), str(fd, "comment")));
}
async function rejectAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  await act(path(fd), "تم الرفض وإعادة الوثيقة للمُعدّ", () => rejectVersion(ctx, str(fd, "versionId"), str(fd, "comment")));
}
async function effectiveAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  await act(path(fd), "أصبح الإصدار سارياً", () => makeEffective(ctx, str(fd, "versionId")));
}
async function revisionAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  await act(path(fd), "أُنشئ إصدار جديد كمسودة", () => newRevision(ctx, str(fd, "documentId"), str(fd, "summary")));
}
async function suggestAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  let text: string;
  try {
    text = await suggestSectionRewrite(ctx, str(fd, "versionId"), Number(str(fd, "section")));
  } catch (e) {
    back(path(fd), "err", errorMessage(e));
  }
  back(`${path(fd)}?suggestSection=${str(fd, "section")}&suggestion=${encodeURIComponent(text.slice(0, 3000))}`, "ok", "اقتراح صياغة (لم يُحفظ) — انسخه إلى المحرر إن وافقت عليه");
}

function Render({ content }: { content: DocContent }) {
  return (
    <div className="space-y-5">
      {content.sections.map((s, i) => (
        <section key={i}>
          <h3 className="mb-2 font-semibold text-brand-700">{s.heading}</h3>
          {s.paragraphs.map((p, j) => (
            <p key={j} className="mb-2 text-sm leading-7">
              {p.split(/(\[MISSING:[^\]]*\])/g).map((part, k) => (part.startsWith("[MISSING:") ? <mark key={k} className="rounded bg-red-100 px-1 text-red-800">{part}</mark> : part))}
            </p>
          ))}
          {s.table && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr>{s.table.headers.map((h, k) => <th key={k}>{h}</th>)}</tr></thead>
                <tbody>{s.table.rows.map((r, k) => <tr key={k}>{r.map((c, m) => <td key={m} className={c.startsWith("[MISSING:") ? "text-red-700" : ""}>{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const { ctx } = await requireCtx();
  const [{ document: d, versions, approvals }, f] = await Promise.all([getDocument(ctx, id), flash(searchParams)]).catch(notFoundOnMissing);
  const latest = versions[0];
  const missing = findPlaceholders(latest.content);
  const prev = versions[1];
  const compare = typeof sp.compare === "string" ? versions.find((v) => v.id === sp.compare) : undefined;
  const aiOn = !!getProvider();
  const hidden = (
    <>
      <input type="hidden" name="documentId" value={d.id} />
      <input type="hidden" name="versionId" value={latest.id} />
    </>
  );
  return (
    <>
      <PageHeader
        title={d.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-mono" dir="ltr">{d.code}</span> v{latest.version_no} <StatusBadge status={latest.status} /> <StatusBadge status={d.classification} /></span>}
        actions={
          <>
            <a className="btn-ghost" href={`/api/versions/${latest.id}/docx`}>تنزيل Word</a>
            <a className="btn-ghost" href={`/api/versions/${latest.id}/pdf`}>تنزيل PDF</a>
            <Link className="btn-ghost" href={`/app/documents?project=${d.project_id}`}>حزمة المشروع</Link>
          </>
        }
      />
      <Flash {...f} />
      <p className="mb-4 text-xs text-slate-500">أساس التصنيف: {d.classification_basis}</p>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {missing.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              بيانات ناقصة يجب أن تقدمها المنشأة قبل الاعتماد ({missing.length}): {missing.join("، ")}
            </div>
          )}
          {latest.status === "DRAFT" && can(ctx.role, "document.edit") ? (
            <form action={saveAction} className="card space-y-3">
              {hidden}
              <h2>تحرير المسودة</h2>
              <p className="text-xs text-slate-500">الصيغة: «## عنوان القسم»، ثم الفقرات، والجداول بأسطر تبدأ وتنتهي بـ «|» (السطر الأول رؤوس الأعمدة).</p>
              <textarea name="body" className="input font-mono text-sm leading-6" rows={22} defaultValue={contentToText(latest.content)} />
              <input name="summary" className="input" placeholder="ملخص التغيير" defaultValue={latest.change_summary} />
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary">حفظ المسودة</button>
              </div>
            </form>
          ) : (
            <div className="card"><Render content={latest.content} /></div>
          )}
          {latest.status === "DRAFT" && aiOn && can(ctx.role, "document.edit") && (
            <form action={suggestAction} className="card flex flex-wrap items-end gap-2">
              {hidden}
              <label className="block"><span className="label">اقتراح صياغة بالذكاء الاصطناعي لقسم</span>
                <select name="section" className="input">{latest.content.sections.map((s: { heading: string }, i: number) => <option key={i} value={i}>{s.heading}</option>)}</select>
              </label>
              <button className="btn-ghost">اقترح</button>
              <p className="w-full text-xs text-slate-500">يُفحص الاقتراح آلياً: لا أرقام أو تواريخ جديدة، ولا حذف للبيانات الناقصة، ولا ادعاء اعتماد. لا يُحفظ دون قرارك.</p>
            </form>
          )}
          {typeof sp.suggestion === "string" && <div className="card whitespace-pre-line text-sm"><h3 className="mb-2 font-semibold">الاقتراح</h3>{sp.suggestion}</div>}
          {(compare || prev) && (
            <div className="card">
              <h2 className="mb-2">مقارنة التغييرات: v{(compare ?? prev).version_no} ← v{latest.version_no}</h2>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-6">
                {diffLines(contentToText((compare ?? prev).content), contentToText(latest.content))
                  .filter((l) => l.op !== "=")
                  .map((l, i) => <div key={i} className={l.op === "+" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800 line-through"}>{l.op} {l.line}</div>)}
              </pre>
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <div className="card space-y-3">
            <h2>سير الاعتماد</h2>
            {latest.status === "DRAFT" && can(ctx.role, "document.submit") && (
              <form action={submitAction}>{hidden}<button className="btn-primary w-full">إرسال للمراجعة</button></form>
            )}
            {latest.status === "IN_REVIEW" && can(ctx.role, "document.approve") && (
              <>
                {latest.author_id === ctx.userId && <p className="text-xs text-amber-700">أنت مُعدّ هذا الإصدار؛ يلزم اعتماد شخص آخر.</p>}
                <form action={approveAction} className="space-y-2">{hidden}
                  <input name="comment" className="input" placeholder="ملاحظة (اختياري)" />
                  <button className="btn-accent w-full" disabled={latest.author_id === ctx.userId || missing.length > 0}>اعتماد</button>
                </form>
                <form action={rejectAction} className="space-y-2">{hidden}
                  <input name="comment" className="input" placeholder="سبب الرفض" required />
                  <button className="btn-danger w-full">رفض</button>
                </form>
              </>
            )}
            {latest.status === "APPROVED" && can(ctx.role, "document.make_effective") && (
              <form action={effectiveAction}>{hidden}<button className="btn-accent w-full">جعل الإصدار سارياً</button></form>
            )}
            {["EFFECTIVE", "REJECTED"].includes(latest.status) && can(ctx.role, "document.edit") && (
              <form action={revisionAction} className="space-y-2">
                <input type="hidden" name="documentId" value={d.id} />
                <input name="summary" className="input" placeholder="سبب التعديل" required />
                <button className="btn-ghost w-full">إصدار جديد</button>
                <p className="text-xs text-slate-500">لا تُعدّل وثيقة سارية بصمت؛ يُنشأ إصدار جديد ويبقى الساري حتى اعتماد البديل.</p>
              </form>
            )}
          </div>
          <div className="card">
            <h2 className="mb-3">الإصدارات</h2>
            <ul className="space-y-2 text-sm">
              {versions.map((v) => (
                <li key={v.id} className="border-b border-slate-100 pb-2">
                  <div className="flex items-center justify-between"><span>v{v.version_no} <StatusBadge status={v.status} /></span>
                    <span className="flex gap-2 text-xs">
                      {v.id !== latest.id && <Link href={`?compare=${v.id}`}>مقارنة</Link>}
                      <a href={`/api/versions/${v.id}/docx`}>Word</a>
                      <a href={`/api/versions/${v.id}/pdf`}>PDF</a>
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{v.change_summary} — {v.author_name}{v.approver_name && ` — اعتمدها ${v.approver_name}`}</p>
                  <p className="text-xs text-slate-400" dir="ltr">{v.generated_by} · sha256:{v.content_sha256.slice(0, 10)}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h2 className="mb-3">سجل القرارات</h2>
            <ul className="space-y-1 text-xs">
              {approvals.map((a) => (
                <li key={a.id}><Badge>{{ SUBMITTED: "إرسال", APPROVED: "اعتماد", REJECTED: "رفض", MADE_EFFECTIVE: "سريان" }[a.decision as string]}</Badge> v{a.version_no} — {a.actor_name} — {new Date(a.at).toISOString().slice(0, 16).replace("T", " ")}{a.comment && ` — ${a.comment}`}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}
