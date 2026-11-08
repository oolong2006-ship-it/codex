import { requireDashboardActor, getLang } from "@/server/web";
import { listStaff, listBranches, getMerchant } from "@/server/domain/management";
import { requirePermission } from "@/server/actor";
import { PERMISSIONS } from "@/server/rbac";
import { env } from "@/server/env";
import { t } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { StaffForm } from "./staff-form";
import { toggleStaffAction } from "./actions";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const actor = await requireDashboardActor();
  requirePermission(actor, PERMISSIONS.STAFF_MANAGE);
  const lang = await getLang();
  const [staff, branches, merchant] = await Promise.all([listStaff(actor), listBranches(actor, true), getMerchant(actor)]);
  const k = (key: string) => t(lang, key);
  return (
    <>
      <PageHeader title={k("staff.title")} sub={t(lang, "staff.cashierLoginInfo", { url: `${env().APP_URL}/pos`, slug: merchant.slug })} />
      <StaffForm
        branches={branches}
        labels={{
          name: k("common.name"), role: k("common.role"), branch: k("common.branch"), email: k("common.email"), password: k("common.password"),
          pin: k("staff.pin"), pinHint: k("staff.pinHint"), passwordHint: k("staff.passwordHint"), add: k("staff.add"), allBranches: "—",
          OWNER: k("role.OWNER"), MANAGER: k("role.MANAGER"), CASHIER: k("role.CASHIER"),
        }}
      />
      <div className="card mt-6 overflow-x-auto">
        <table className="table min-w-[640px]">
          <thead>
            <tr><th>{k("common.name")}</th><th>{k("common.role")}</th><th>{k("common.branch")}</th><th>{k("common.email")}</th><th>PIN</th><th>{k("common.status")}</th><th /></tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="font-medium">{s.name}</td>
                <td>{k(`role.${s.role}`)}</td>
                <td>{s.branchName ?? "—"}</td>
                <td dir="ltr" className="text-start text-xs">{s.email ?? "—"}</td>
                <td>{s.hasPin ? "✓" : "—"}</td>
                <td><span className={`pill ${s.active ? "bg-mint-50 text-mint-600" : "bg-cream-200 text-espresso-500"}`}>{k(s.active ? "common.active" : "common.inactive")}</span></td>
                <td>
                  {s.id !== actor.staffUserId && (
                    <form action={toggleStaffAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="active" value={s.active ? "0" : "1"} />
                      <button className="btn-ghost py-1 text-xs">{k(s.active ? "staff.deactivate" : "staff.activate")}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
