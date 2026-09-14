"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchDashboardMetrics, fetchLocations } from "@/lib/data";
import { exportRequestsCsv } from "@/lib/api";
import { PURCHASE_TYPE_LABEL, STAGE_LABEL, STATUS_LABEL } from "@/lib/labels";
import { formatMoney, formatNumber } from "@/lib/format";
import {
  Alert, Button, Card, Field, Input, Select, Spinner, Table, Td, Th,
} from "@/components/ui";
import type { DashboardMetrics, LocationRow } from "@/types/database";

export default function ReportsPage() {
  const { hasGlobalScope } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [status, setStatus] = useState("");
  const [locationId, setLocationId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    Promise.all([fetchDashboardMetrics(), fetchLocations()])
      .then(([m, l]) => { setMetrics(m); setLocations(l); })
      .catch((e) => setError(e instanceof Error ? e.message : "تعذر التحميل"))
      .finally(() => setLoading(false));
  }, []);

  const doExport = async () => {
    setExporting(true); setError(null);
    try {
      const csv = await exportRequestsCsv({
        status: status || undefined,
        location_id: locationId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      // التنزيل يتم في المتصفح من نص CSV مُولَّد على الخادم
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `تقرير-المشتريات-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تصدير التقرير");
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-extrabold text-brand-800">التقارير</h1>
        <p className="mt-1 text-sm text-slate-500">
          ملخص المؤشرات وتصدير البيانات إلى ملف CSV يفتح مباشرة في Excel
        </p>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

      <Card title="تصدير الطلبات">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="الحالة">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">جميع الحالات</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          {hasGlobalScope && (
            <Field label="الموقع">
              <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">جميع المواقع</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name_ar}</option>)}
              </Select>
            </Field>
          )}
          <Field label="من تاريخ">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </Field>
          <Field label="إلى تاريخ">
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <Button onClick={doExport} loading={exporting}>تصدير CSV</Button>
        </div>
      </Card>

      {metrics && (
        <>
          <Card title="ملخص الحالات">
            <Table>
              <thead><tr><Th>الحالة</Th><Th>عدد الطلبات</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(metrics.by_status).map(([k, v]) => (
                  <tr key={k}>
                    <Td>{STATUS_LABEL[k as keyof typeof STATUS_LABEL] ?? k}</Td>
                    <Td className="font-semibold">{formatNumber(v)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card title="الطلبات حسب المرحلة">
            <Table>
              <thead><tr><Th>المرحلة</Th><Th>عدد الطلبات</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(metrics.by_stage).length === 0 ? (
                  <tr><Td>لا توجد طلبات قيد الاعتماد</Td><Td>0</Td></tr>
                ) : Object.entries(metrics.by_stage).map(([k, v]) => (
                  <tr key={k}>
                    <Td>{STAGE_LABEL[k as keyof typeof STAGE_LABEL] ?? k}</Td>
                    <Td className="font-semibold">{formatNumber(v)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card title="القيمة حسب الموقع">
            <Table>
              <thead>
                <tr><Th>الموقع</Th><Th>عدد الطلبات</Th><Th>إجمالي القيمة</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.by_location.map((l) => (
                  <tr key={l.location_id}>
                    <Td className="font-medium">{l.name_ar}</Td>
                    <Td>{formatNumber(l.count)}</Td>
                    <Td className="font-semibold text-brand-700">{formatMoney(l.amount)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card title="الطلبات حسب نوع الشراء">
            <Table>
              <thead><tr><Th>نوع الشراء</Th><Th>عدد الطلبات</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(metrics.by_purchase_type).map(([k, v]) => (
                  <tr key={k}>
                    <Td>{PURCHASE_TYPE_LABEL[k as keyof typeof PURCHASE_TYPE_LABEL] ?? k}</Td>
                    <Td className="font-semibold">{formatNumber(v)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
