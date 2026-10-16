import Link from "next/link";
import { redirect } from "next/navigation";
import { listSites } from "@/server/domain/orgs";
import { createProject, listProjects } from "@/server/domain/projects";
import { can } from "@/server/rbac";
import { back, errorMessage, requireCtx, str } from "@/server/web";
import { Empty, Flash, PageHeader, StatusBadge, flash, type SP } from "@/components/ui";

async function createAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  let id: string;
  try {
    id = await createProject(ctx, { title: str(fd, "title"), siteIds: fd.getAll("siteIds").map(String) });
  } catch (e) {
    back("/app/projects", "err", errorMessage(e));
  }
  redirect(`/app/projects/${id}/intake`);
}

export default async function Projects({ searchParams }: { searchParams: SP }) {
  const { ctx } = await requireCtx();
  const [projects, sites, f] = await Promise.all([listProjects(ctx), listSites(ctx), flash(searchParams)]);
  return (
    <>
      <PageHeader title="مشاريع أنظمة الإدارة" subtitle="ISO 9001:2026 أول نظام متاح؛ المواصفات الأخرى تُضاف كحزم مستقلة بعد الترخيص والمراجعة." />
      <Flash {...f} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          {projects.length === 0 ? (
            <Empty>لا توجد مشاريع بعد.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3">
                  <Link href={`/app/projects/${p.id}`}>{p.title}</Link>
                  <span className="flex items-center gap-2 text-xs">ISO 9001:{p.edition_label} <StatusBadge status={p.status} /></span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {can(ctx.role, "project.manage") && (
          <form action={createAction} className="card space-y-4">
            <h2>مشروع جديد — ISO 9001:2026</h2>
            <label className="block">
              <span className="label">عنوان المشروع</span>
              <input name="title" className="input" required defaultValue="تأسيس نظام إدارة الجودة ISO 9001:2026" />
            </label>
            <fieldset>
              <legend className="label">المواقع الداخلة في النطاق</legend>
              {sites.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="siteIds" value={s.id} defaultChecked /> {s.name}
                </label>
              ))}
            </fieldset>
            <button className="btn-primary w-full">ابدأ المقابلة التشخيصية</button>
          </form>
        )}
      </div>
    </>
  );
}
