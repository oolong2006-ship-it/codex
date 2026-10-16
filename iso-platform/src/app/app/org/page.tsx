import { revalidatePath } from "next/cache";
import { addSite, deleteSite, getOrganization, listSites, updateOrganization } from "@/server/domain/orgs";
import { PACKS } from "@/server/packs";
import { can } from "@/server/rbac";
import { act, requireCtx, str } from "@/server/web";
import { Field, Flash, PageHeader, flash, type SP } from "@/components/ui";

async function updateOrgAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  await act("/app/org", "تم حفظ ملف المنشأة", () =>
    updateOrganization(ctx, {
      name: str(fd, "name"),
      legalName: str(fd, "legalName"),
      country: str(fd, "country"),
      industryCode: str(fd, "industryCode"),
      sizeBand: str(fd, "sizeBand") as "SMALL",
      description: str(fd, "description"),
    }),
  );
}

async function addSiteAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  revalidatePath("/app/org");
  await act("/app/org", "تمت إضافة الموقع", () =>
    addSite(ctx, {
      name: str(fd, "name"),
      city: str(fd, "city"),
      country: str(fd, "country") || "SA",
      address: str(fd, "address"),
      activities: str(fd, "activities"),
      headcount: str(fd, "headcount") ? Number(str(fd, "headcount")) : undefined,
    }),
  );
}

async function deleteSiteAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  await act("/app/org", "تم حذف الموقع", () => deleteSite(ctx, str(fd, "id")));
}

export default async function OrgPage({ searchParams }: { searchParams: SP }) {
  const { ctx } = await requireCtx();
  const [org, sites, f] = await Promise.all([getOrganization(ctx), listSites(ctx), flash(searchParams)]);
  const canOrg = can(ctx.role, "org.manage");
  const canSites = can(ctx.role, "sites.manage");
  return (
    <>
      <PageHeader title="المنشأة والمواقع" subtitle="ملف المنشأة ومواقعها أساس نطاق نظام الإدارة." />
      <Flash {...f} />
      <div className="grid gap-6 lg:grid-cols-2">
        <form action={updateOrgAction} className="card space-y-4">
          <h2>ملف المنشأة</h2>
          <fieldset disabled={!canOrg} className="space-y-4">
            <Field label="اسم المنشأة" name="name" required defaultValue={org.name} />
            <Field label="الاسم القانوني" name="legalName" defaultValue={org.legal_name ?? ""} />
            <label className="block">
              <span className="label">النشاط</span>
              <select name="industryCode" className="input" defaultValue={org.industry_code}>
                {Object.values(PACKS).map((p) => <option key={p.code} value={p.code}>{p.ar}</option>)}
              </select>
              <span className="mt-1 block text-xs text-amber-700">تغيير النشاط لا يغيّر مشروعاً بدأت مقابلته؛ أنشئ مشروعاً جديداً عند الحاجة.</span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="label">الحجم</span>
                <select name="sizeBand" className="input" defaultValue={org.size_band}>
                  <option value="MICRO">متناهية الصغر</option>
                  <option value="SMALL">صغيرة</option>
                  <option value="MEDIUM">متوسطة</option>
                  <option value="LARGE">كبيرة</option>
                </select>
              </label>
              <Field label="رمز الدولة" name="country" defaultValue={org.country} dir="ltr" />
            </div>
            <label className="block">
              <span className="label">نبذة</span>
              <textarea name="description" className="input" rows={3} defaultValue={org.description ?? ""} />
            </label>
            {canOrg && <button className="btn-primary">حفظ</button>}
          </fieldset>
        </form>

        <div className="card">
          <h2 className="mb-3">المواقع والفروع ({sites.length})</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>الموقع</th><th>المدينة</th><th>العاملون</th><th /></tr></thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}{s.is_head_office && <span className="ms-2 text-xs text-slate-500">(المقر)</span>}<div className="text-xs text-slate-500">{s.activities}</div></td>
                    <td>{s.city ?? "—"}</td>
                    <td>{s.headcount ?? "—"}</td>
                    <td>
                      {canSites && !s.is_head_office && (
                        <form action={deleteSiteAction}><input type="hidden" name="id" value={s.id} /><button className="text-xs text-red-700">حذف</button></form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canSites && (
            <form action={addSiteAction} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold">إضافة موقع</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="اسم الموقع" name="name" required />
                <Field label="المدينة" name="city" />
                <Field label="العنوان" name="address" />
                <Field label="عدد العاملين" name="headcount" type="number" min={0} />
              </div>
              <Field label="الأنشطة المنفذة في الموقع" name="activities" />
              <button className="btn-ghost">إضافة</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
