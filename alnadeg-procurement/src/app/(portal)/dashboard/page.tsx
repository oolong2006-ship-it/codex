"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { fetchDashboardMetrics, fetchRequests } from "@/lib/data";
import type { DashboardMetrics, PurchaseRequestWithRelations } from "@/types/database";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { PURCHASE_TYPE_LABEL, ROLE_LABEL, STAGE_LABEL } from "@/lib/labels";
import { StatusBadge } from "@/components/StatusBadge";
import { Alert, Card, EmptyState, Spinner, StatCard, Table, Td, Th } from "@/components/ui";

export default function DashboardPage() {
  const { profile } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [latest, setLatest] = useState<PurchaseRequestWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([fetchDashboardMetrics(), fetchRequests({ pageSize: 8 })])
      .then(([m, r]) => {
        if (!active) return;
        setMetrics(m);
        setLatest(r.rows);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : "تعذر التحميل"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  if (loading) return <Spinner />;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!metrics) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-extrabold text-brand-800">لوحة المتابعة</h1>
        <p className="mt-1 text-sm text-slate-500">
          مرحبًا {profile?.full_name} — {profile && ROLE_LABEL[profile.role]}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="إجمالي طلبات الشراء" value={formatNumber(metrics.total)} />
        <StatCard label="بانتظار الاعتماد" value={formatNumber(metrics.pending)} tone="amber" />
        <StatCard label="الطلبات المكتملة" value={formatNumber(metrics.completed)} tone="brand" />
        <StatCard label="الطلبات المرفوضة" value={formatNumber(metrics.rejected)} tone="rose" />
        <StatCard label="المعادة للتعديل" value={formatNumber(metrics.returned)} tone="amber" />
        <StatCard label="ينقصها مستند ERP" value={formatNumber(metrics.missing_erp)} tone="rose"
          hint="لا يمكن إقفالها ماليًا" />
        <StatCard label="متأخرة في الاعتماد" value={formatNumber(metrics.overdue)} tone="amber"
          hint="أكثر من 3 أيام" />
        <StatCard label="إجمالي قيمة الطلبات" value={formatMoney(metrics.total_amount)} tone="gold" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="الطلبات حسب المرحلة">
          {Object.keys(metrics.by_stage).length === 0 ? (
            <EmptyState title="لا توجد طلبات قيد الاعتماد" />
          ) : (
            <ul className="space-y-2">
              {Object.entries(metrics.by_stage).map(([stage, count]) => (
                <li key={stage}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
                  <span className="font-medium text-slate-700">
                    {STAGE_LABEL[stage as keyof typeof STAGE_LABEL] ?? stage}
                  </span>
                  <span className="font-bold text-brand-700">{formatNumber(count)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="الطلبات حسب نوع الشراء">
          {Object.keys(metrics.by_purchase_type).length === 0 ? (
            <EmptyState title="لا توجد بيانات" />
          ) : (
            <ul className="space-y-2">
              {Object.entries(metrics.by_purchase_type).map(([type, count]) => (
                <li key={type}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
                  <span className="font-medium text-slate-700">
                    {PURCHASE_TYPE_LABEL[type as keyof typeof PURCHASE_TYPE_LABEL] ?? type}
                  </span>
                  <span className="font-bold text-brand-700">{formatNumber(count)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {metrics.by_location.length > 0 && (
        <Card title="قيمة الطلبات حسب الموقع">
          <Table>
            <thead>
              <tr><Th>الموقع</Th><Th>الكود</Th><Th>عدد الطلبات</Th><Th>القيمة</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {metrics.by_location.map((l) => (
                <tr key={l.location_id}>
                  <Td className="font-medium">{l.name_ar}</Td>
                  <Td className="text-slate-400">{l.code}</Td>
                  <Td>{formatNumber(l.count)}</Td>
                  <Td className="font-semibold text-brand-700">{formatMoney(l.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <Card title="أحدث الطلبات"
        action={<Link href="/requests/" className="text-sm font-semibold text-brand-600 hover:underline">
          عرض الكل
        </Link>}>
        {latest.length === 0 ? (
          <EmptyState title="لا توجد طلبات بعد"
            hint="ابدأ بإنشاء طلب شراء جديد من القائمة الجانبية" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>رقم الطلب</Th><Th>الموقع</Th><Th>المورد</Th>
                <Th>الإجمالي</Th><Th>التاريخ</Th><Th>الحالة</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {latest.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/request/?id=${r.id}`}
                      className="font-semibold text-brand-700 hover:underline">
                      {r.request_number}
                    </Link>
                  </Td>
                  <Td>{r.locations?.name_ar ?? "—"}</Td>
                  <Td>{r.supplier_name ?? "—"}</Td>
                  <Td className="font-medium">{formatMoney(r.total_amount)}</Td>
                  <Td className="text-slate-500">{formatDate(r.request_date)}</Td>
                  <Td><StatusBadge status={r.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
