import Link from "next/link";
import { Users, CheckCircle2, Clock, XCircle, Package, Tag, FolderTree, FileWarning, FileClock, AlertTriangle, TrendingUp } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getDashboardData } from "@/lib/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const d = await getDashboardData(user!.organizationId);
  const maxTrend = Math.max(1, ...d.trend.map((t) => t.count));

  const kpis = [
    { label: "Total suppliers", value: d.total, icon: Users, href: "/suppliers" },
    { label: "Approved", value: d.approved, icon: CheckCircle2, tone: "text-[hsl(var(--success))]", href: "/suppliers?status=APPROVED" },
    { label: "Pending review", value: d.pending, icon: Clock, tone: "text-[hsl(var(--warning))]", href: "/suppliers?status=SUBMITTED" },
    { label: "Rejected", value: d.rejected, icon: XCircle, tone: "text-[hsl(var(--danger))]", href: "/suppliers?status=REJECTED" },
    { label: "New this month", value: d.newThisMonth, icon: TrendingUp, href: "/suppliers" },
    { label: "Products indexed", value: d.products, icon: Package, href: "/search" },
    { label: "Brands", value: d.brands, icon: Tag },
    { label: "Categories", value: d.categories, icon: FolderTree, href: "/coverage" },
    { label: "Expired documents", value: d.expiredDocs, icon: FileWarning, tone: "text-[hsl(var(--danger))]" },
    { label: "Expiring soon", value: d.expiringDocs, icon: FileClock, tone: "text-[hsl(var(--warning))]" },
    { label: "Incomplete profiles", value: d.incomplete, icon: AlertTriangle, tone: "text-[hsl(var(--warning))]" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const inner = (
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between pt-5">
                <div>
                  <div className={`text-2xl font-bold ${k.tone ?? ""}`}>{k.value}</div>
                  <div className="text-sm text-muted-foreground">{k.label}</div>
                </div>
                <k.icon className={`h-5 w-5 ${k.tone ?? "text-muted-foreground"}`} />
              </CardContent>
            </Card>
          );
          return k.href ? <Link key={k.label} href={k.href}>{inner}</Link> : <div key={k.label}>{inner}</div>;
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>New suppliers trend</CardTitle></CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-3">
              {d.trend.map((t) => (
                <div key={t.month} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex w-full flex-1 items-end">
                    <div className="w-full rounded-t bg-primary/80" style={{ height: `${(t.count / maxTrend) * 100}%`, minHeight: t.count ? 6 : 0 }} title={`${t.count}`} />
                  </div>
                  <span className="text-xs text-muted-foreground">{t.month}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top categories</CardTitle></CardHeader>
          <CardContent>
            {d.topCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <ul className="space-y-2">
                {d.topCategories.map((c) => {
                  const max = Math.max(1, ...d.topCategories.map((x) => x.count));
                  return (
                    <li key={c.name}>
                      <div className="mb-1 flex justify-between text-sm"><span>{c.name}</span><span className="text-muted-foreground">{c.count}</span></div>
                      <div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(c.count / max) * 100}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Coverage by city</CardTitle></CardHeader>
        <CardContent>
          {d.coverageByCity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {d.coverageByCity.map((c) => (
                <div key={c.city} className="rounded-md border border-border p-3">
                  <div className="text-lg font-semibold">{c.count}</div>
                  <div className="text-sm text-muted-foreground">{c.city}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
