import Link from "next/link";
import { listDocuments } from "@/server/domain/documents";
import { listProjects } from "@/server/domain/projects";
import { requireCtx } from "@/server/web";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-brand-700">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}

export default async function Dashboard() {
  const { ctx } = await requireCtx();
  const [projects, docs] = await Promise.all([listProjects(ctx), listDocuments(ctx)]);
  const total = docs.length;
  const approved = docs.filter((d) => d.effective_version || d.latest_status === "APPROVED").length;
  const effective = docs.filter((d) => d.effective_version).length;
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : "—");
  return (
    <>
      <PageHeader title="لوحة القيادة" subtitle="مؤشرات منفصلة عمداً: التوثيق لا يعني التطبيق، والتطبيق لا يعني الشهادة." actions={<Link className="btn-primary" href="/app/projects">مشاريع أنظمة الإدارة</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="التوثيق" value={`${total}`} note="وثائق منشأة من خطة الوثائق" />
        <Metric label="اعتماد الوثائق" value={pct(approved)} note={`${approved} معتمدة أو سارية من ${total}`} />
        <Metric label="الوثائق السارية" value={pct(effective)} note={`${effective} سارية`} />
        <Metric label="التطبيق وكفاية الأدلة" value="لم يبدأ" note="يُقاس من السجلات التشغيلية والأدلة الفعلية — وحدة التشغيل (P3)" />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Metric label="التدقيق الداخلي" value="لم يُنفذ" note="لا يُحتسب قبل تنفيذ تدقيق فعلي" />
        <Metric label="الإجراءات التصحيحية" value="—" note="تُغلق فقط بعد التحقق من الفاعلية" />
        <Metric label="الجاهزية للتدقيق الخارجي" value="غير مقيّمة" note="تتطلب تطبيقاً فعلياً وأدلة ودورة تدقيق ومراجعة إدارة" />
      </div>
      <div className="card mt-6">
        <h2 className="mb-3">المشاريع</h2>
        {projects.length === 0 ? (
          <Empty>
            لا توجد مشاريع بعد. <Link href="/app/projects">ابدأ مشروع ISO 9001:2026</Link>
          </Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3">
                <Link href={`/app/projects/${p.id}`}>{p.title}</Link>
                <span className="flex items-center gap-2 text-xs text-slate-500">ISO 9001:{p.edition_label} <StatusBadge status={p.status} /></span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
