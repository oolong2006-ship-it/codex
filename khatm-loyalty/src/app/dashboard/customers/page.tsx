import { requireDashboardActor, getLang } from "@/server/web";
import { listCustomers } from "@/server/domain/customers";
import { can, PERMISSIONS } from "@/server/rbac";
import { maskPhone } from "@/server/phone";
import { requirePermission } from "@/server/actor";
import { fmtDate, fmtNumber, t } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { DeleteCustomerButton } from "./delete-button";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const actor = await requireDashboardActor();
  requirePermission(actor, PERMISSIONS.CUSTOMER_VIEW);
  const lang = await getLang();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = await listCustomers(actor, { search: sp.q, limit: 50, offset: (page - 1) * 50 });
  const privacy = can(actor.role, PERMISSIONS.CUSTOMER_PRIVACY);
  const pages = Math.max(1, Math.ceil(total / 50));
  return (
    <>
      <PageHeader
        title={t(lang, "customers.title")}
        sub={fmtNumber(lang, total)}
        actions={privacy ? <a href="/api/customers/export" className="btn-ghost">{t(lang, "customers.exportCsv")}</a> : null}
      />
      <form className="mb-4 max-w-sm">
        <input name="q" defaultValue={sp.q ?? ""} placeholder={t(lang, "customers.search")} className="input" />
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-10 text-center text-espresso-500">{t(lang, "customers.empty")}</p>
        ) : (
          <table className="table min-w-[760px]" data-testid="customers-table">
            <thead>
              <tr>
                <th>{t(lang, "common.name")}</th>
                <th>{t(lang, "common.phone")}</th>
                <th>{t(lang, "customers.stamps")}</th>
                <th>{t(lang, "customers.rewards")}</th>
                <th>{t(lang, "customers.totalVisits")}</th>
                <th>{t(lang, "analytics.lastVisit")}</th>
                <th>{t(lang, "customers.marketing")}</th>
                {privacy && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>
                  <td dir="ltr" className="text-start font-mono text-xs">{privacy ? r.phone : maskPhone(r.phone)}</td>
                  <td className="tabular-nums">{r.currentStamps}</td>
                  <td className="tabular-nums">{r.rewardsAvailable > 0 ? <span className="pill bg-saffron-400/25 text-espresso-900">{r.rewardsAvailable}</span> : 0}</td>
                  <td className="tabular-nums">{r.totalStamps}</td>
                  <td className="text-xs">{r.lastStampAt ? fmtDate(lang, r.lastStampAt) : <span className="text-espresso-500">{t(lang, "common.never")}</span>}</td>
                  <td>{r.marketingOptIn ? "✓" : "—"}</td>
                  {privacy && (
                    <td>
                      <div className="flex items-center gap-3">
                        <a href={`/api/customers/${r.id}`} className="text-xs font-medium text-espresso-700 hover:underline">{t(lang, "customers.exportData")}</a>
                        <DeleteCustomerButton id={r.id} label={t(lang, "customers.deleteData")} confirm={t(lang, "customers.deleteConfirm")} />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {pages > 1 && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          {page > 1 && <a className="btn-ghost" href={`?q=${encodeURIComponent(sp.q ?? "")}&page=${page - 1}`}>‹</a>}
          <span className="text-espresso-500">{page} / {pages}</span>
          {page < pages && <a className="btn-ghost" href={`?q=${encodeURIComponent(sp.q ?? "")}&page=${page + 1}`}>›</a>}
        </div>
      )}
    </>
  );
}
