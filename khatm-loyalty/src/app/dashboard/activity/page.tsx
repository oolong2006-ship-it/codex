import { requireDashboardActor, getLang } from "@/server/web";
import { listActivity } from "@/server/domain/management";
import { fmtDateTime, t } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Activity" };

export default async function ActivityPage() {
  const actor = await requireDashboardActor();
  const lang = await getLang();
  const rows = await listActivity(actor);
  return (
    <>
      <PageHeader title={t(lang, "activity.title")} />
      <div className="card overflow-x-auto">
        <table className="table min-w-[560px]">
          <thead><tr><th>{t(lang, "common.date")}</th><th>{t(lang, "activity.action")}</th><th>{t(lang, "activity.by")}</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-xs">{fmtDateTime(lang, r.created_at)}</td>
                <td className="font-mono text-xs" dir="ltr">{r.action}</td>
                <td>{r.staff_name ?? "—"}</td>
                <td className="font-mono text-[11px] text-espresso-500" dir="ltr">{r.entity ? `${r.entity}:${(r.entity_id ?? "").slice(0, 8)}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
