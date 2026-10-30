import Link from "next/link";
import { redirect } from "next/navigation";
import { capaFormOptions, capaMetrics, listNcs, NC_SOURCES, NC_STATUS_AR, reportNc, SEVERITY_AR, SOURCE_AR } from "@/server/domain/capa";
import { can } from "@/server/rbac";
import { back, errorMessage, requireCtx, str } from "@/server/web";
import { NC_TONE, SEV_TONE } from "@/components/capa";
import { Badge, Empty, Flash, PageHeader, flash, type SP } from "@/components/ui";

async function reportAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  let id: string;
  try {
    id = (
      await reportNc(ctx, {
        title: str(fd, "title"), description: str(fd, "description"), source: str(fd, "source") as "OTHER", severity: str(fd, "severity") as "MINOR",
        detectedOn: str(fd, "detectedOn"), processCode: str(fd, "processCode"), siteId: str(fd, "siteId"),
      })
    ).id;
  } catch (e) {
    back("/app/capa?new=1", "err", errorMessage(e));
  }
  redirect(`/app/capa/${id}?ok=${encodeURIComponent("تم تسجيل الحالة")}`);
}


export default async function CapaList({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { ctx } = await requireCtx();
  const status = typeof sp.status === "string" && sp.status in NC_STATUS_AR ? sp.status : undefined;
  const [rows, m, opts, f] = await Promise.all([listNcs(ctx, { status }), capaMetrics(ctx), capaFormOptions(ctx), flash(searchParams)]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="عدم المطابقة والإجراءات التصحيحية" subtitle="سجلات تشغيل فعلية: كل خطوة مؤرخة آلياً، ولا تُغلق الحالة إلا بعد تحقق مستقل من الفاعلية." />
      <Flash {...f} />
      <div className="mb-6 grid gap-3 sm:grid-cols-5">
        {[
          ["مفتوحة", m.open],
          ["مغلقة بعد تحقق الفاعلية", m.closed_effective],
          ["مغلقة بالتصحيح فقط", m.closed_correction],
          ["أُعيد فتحها (غير فعّالة)", m.reopened],
          ["إجراءات متأخرة", m.overdue_actions],
        ].map(([l, v]) => (
          <div key={l as string} className="card py-3">
            <p className="text-xs text-slate-500">{l}</p>
            <p className="text-2xl font-bold text-brand-700">{v}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <nav className="mb-3 flex flex-wrap gap-2 text-sm">
            <Link href="/app/capa" className={!status ? "font-bold" : ""}>الكل</Link>
            {Object.entries(NC_STATUS_AR).map(([k, v]) => (
              <Link key={k} href={`/app/capa?status=${k}`} className={status === k ? "font-bold" : ""}>{v}</Link>
            ))}
          </nav>
          {rows.length === 0 ? (
            <Empty>لا توجد حالات مسجلة.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>الرمز</th><th>العنوان</th><th>الخطورة</th><th>الحالة</th><th>المصدر</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap font-mono text-xs" dir="ltr">{r.code}</td>
                      <td>
                        <Link href={`/app/capa/${r.id}`}>{r.title}</Link>
                        {r.overdue > 0 && <span className="ms-2"><Badge tone="red">{r.overdue} متأخر</Badge></span>}
                        {r.cycle > 1 && <span className="ms-2"><Badge tone="amber">دورة {r.cycle}</Badge></span>}
                      </td>
                      <td><Badge tone={SEV_TONE[r.severity as keyof typeof SEV_TONE]}>{SEVERITY_AR[r.severity]}</Badge></td>
                      <td className="whitespace-nowrap"><Badge tone={NC_TONE[r.status]}>{NC_STATUS_AR[r.status]}</Badge></td>
                      <td className="text-xs">{SOURCE_AR[r.source]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {can(ctx.role, "nc.report") && (
          <form action={reportAction} className="card space-y-3">
            <h2>تسجيل حالة عدم مطابقة</h2>
            <label className="block"><span className="label">العنوان</span><input name="title" className="input" required minLength={5} /></label>
            <label className="block"><span className="label">ماذا حدث؟ أين؟ ومتى؟</span><textarea name="description" className="input" rows={4} required minLength={10} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="label">المصدر</span>
                <select name="source" className="input">{NC_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_AR[s]}</option>)}</select>
              </label>
              <label className="block"><span className="label">الخطورة</span>
                <select name="severity" className="input" defaultValue="MINOR">{Object.entries(SEVERITY_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
            </div>
            <label className="block"><span className="label">تاريخ الاكتشاف</span><input type="date" name="detectedOn" className="input" required max={today} defaultValue={today} /></label>
            <label className="block"><span className="label">العملية</span>
              <select name="processCode" className="input" defaultValue=""><option value="">— غير محددة —</option>{opts.processes.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.name_ar}</option>)}</select>
            </label>
            <label className="block"><span className="label">الموقع</span>
              <select name="siteId" className="input" defaultValue=""><option value="">— غير محدد —</option>{opts.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </label>
            <button className="btn-primary w-full">تسجيل</button>
          </form>
        )}
      </div>
    </>
  );
}
