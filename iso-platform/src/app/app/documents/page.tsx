import Link from "next/link";
import { listDocuments } from "@/server/domain/documents";
import { requireCtx } from "@/server/web";
import { Empty, PageHeader, StatusBadge, type SP } from "@/components/ui";

const TYPE_AR: Record<string, string> = {
  SCOPE: "نطاق", POLICY: "سياسة", OBJECTIVES: "أهداف", PROCEDURE: "إجراء", WORK_INSTRUCTION: "تعليمات عمل", PROCESS_MAP: "خريطة عمليات",
  RACI: "مصفوفة مسؤوليات", RISK_REGISTER: "سجل مخاطر", FORM: "نموذج", PLAN: "خطة", MANUAL: "دليل", REPORT: "تقرير",
};

export default async function Documents({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { ctx } = await requireCtx();
  const project = typeof sp.project === "string" ? sp.project : undefined;
  const docs = await listDocuments(ctx, project);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const shown = q ? docs.filter((d) => d.title.includes(q) || d.code.toLowerCase().includes(q.toLowerCase())) : docs;
  return (
    <>
      <PageHeader title="الوثائق المضبوطة" subtitle="قائمة الوثائق الرئيسية (Master Document List): رمز فريد، إصدارات، حالة، وتصنيف إلزام شفاف." />
      {project && docs.length > 0 && (
        <div className="card mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-semibold">حزمة التسليم</p>
            <p className="text-xs text-slate-500">كل الوثائق (Word + PDF)، قائمة الوثائق الرئيسية، سجل النواقص، خطة التطبيق.</p>
          </div>
          <div className="flex gap-2">
            <a className="btn-primary" href={`/api/projects/${project}/package`}>تنزيل ZIP</a>
            <a className="btn-ghost" href={`/api/projects/${project}/package?pdf=0`}>ZIP بدون PDF (أسرع)</a>
          </div>
        </div>
      )}
      <form className="mb-4 flex gap-2">
        {project && <input type="hidden" name="project" value={project} />}
        <input name="q" defaultValue={q} className="input max-w-sm" placeholder="بحث بالعنوان أو الرمز" />
        <button className="btn-ghost">بحث</button>
      </form>
      <div className="card">
        {shown.length === 0 ? (
          <Empty>لا توجد وثائق. تُولّد الوثائق بعد اعتماد نطاق المشروع.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>الرمز</th><th>العنوان</th><th>النوع</th><th>التصنيف</th><th>آخر إصدار</th><th>الساري</th></tr></thead>
              <tbody>
                {shown.map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap font-mono text-xs" dir="ltr">{d.code}</td>
                    <td><Link href={`/app/documents/${d.id}`}>{d.title}</Link></td>
                    <td className="text-xs">{TYPE_AR[d.doc_type]}</td>
                    <td><StatusBadge status={d.classification} /></td>
                    <td className="whitespace-nowrap">v{d.latest_version} <StatusBadge status={d.latest_status} /></td>
                    <td>{d.effective_version ? `v${d.effective_version}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
