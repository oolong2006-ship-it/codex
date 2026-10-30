import { listAuditLog } from "@/server/domain/orgs";
import { requireCtx } from "@/server/web";
import { PageHeader } from "@/components/ui";

export default async function AuditLog() {
  const { ctx } = await requireCtx();
  const rows = await listAuditLog(ctx, 300);
  return (
    <>
      <PageHeader title="سجل الأحداث" subtitle="سجل إلحاقي فقط — لا يمكن تعديله أو حذفه من التطبيق." />
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>الوقت</th><th>المستخدم</th><th>الحدث</th><th>الكيان</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td dir="ltr" className="whitespace-nowrap text-end text-xs">{new Date(r.at).toISOString().replace("T", " ").slice(0, 19)}</td>
                  <td>{r.actor_name ?? "النظام"}</td>
                  <td className="font-mono text-xs" dir="ltr">{r.action}</td>
                  <td className="text-xs text-slate-500">{r.entity_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
