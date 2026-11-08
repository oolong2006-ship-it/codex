import { requireDashboardActor, getLang } from "@/server/web";
import { listBranches } from "@/server/domain/management";
import { requirePermission } from "@/server/actor";
import { PERMISSIONS } from "@/server/rbac";
import { t } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { BranchForm } from "./branch-form";
import { toggleBranchAction } from "./actions";

export const metadata = { title: "Branches" };

export default async function BranchesPage() {
  const actor = await requireDashboardActor();
  requirePermission(actor, PERMISSIONS.BRANCH_MANAGE);
  const lang = await getLang();
  const branches = await listBranches(actor);
  return (
    <>
      <PageHeader title={t(lang, "branches.title")} />
      <BranchForm labels={{ name: t(lang, "common.name"), city: t(lang, "common.city"), add: t(lang, "branches.add") }} />
      <div className="card mt-6 divide-y divide-cream-200">
        {branches.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <div className="font-medium">{b.name}</div>
              <div className="text-xs text-espresso-500">{b.city ?? "—"}</div>
            </div>
            <form action={toggleBranchAction} className="flex items-center gap-3">
              <span className={`pill ${b.active ? "bg-mint-50 text-mint-600" : "bg-cream-200 text-espresso-500"}`}>{t(lang, b.active ? "common.active" : "common.inactive")}</span>
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="active" value={b.active ? "0" : "1"} />
              <button className="btn-ghost py-1.5 text-xs">{t(lang, b.active ? "staff.deactivate" : "staff.activate")}</button>
            </form>
          </div>
        ))}
      </div>
    </>
  );
}
