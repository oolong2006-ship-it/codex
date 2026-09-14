"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { fetchLocations, fetchRequests } from "@/lib/data";
import type { LocationRow, PurchaseRequestWithRelations } from "@/types/database";
import { formatDate, formatMoney } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/labels";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Alert, Button, Card, EmptyState, Field, Input, Pagination,
  Select, Spinner, Table, Td, Th,
} from "@/components/ui";

const PAGE_SIZE = 20;

function RequestsInner() {
  const { profile, hasGlobalScope } = useAuth();
  const [rows, setRows] = useState<PurchaseRequestWithRelations[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [locationId, setLocationId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [mineOnly, setMineOnly] = useState(false);

  useEffect(() => { fetchLocations().then(setLocations).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRequests({
        page, pageSize: PAGE_SIZE, search, status, locationId,
        dateFrom, dateTo,
        mineOnly: mineOnly && profile ? profile.id : undefined,
      });
      setRows(res.rows);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل الطلبات");
    } finally {
      setLoading(false);
    }
  }, [page, search, status, locationId, dateFrom, dateTo, mineOnly, profile]);

  useEffect(() => { load(); }, [load]);

  const resetFilters = () => {
    setSearch(""); setStatus(""); setLocationId("");
    setDateFrom(""); setDateTo(""); setMineOnly(false); setPage(1);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-800">قائمة الطلبات</h1>
          <p className="mt-1 text-sm text-slate-500">
            {hasGlobalScope ? "جميع المواقع ضمن صلاحيتك" : "طلبات موقعك"}
          </p>
        </div>
        <Link href="/requests/new/">
          <Button>طلب شراء جديد</Button>
        </Link>
      </header>

      <Card title="البحث والتصفية"
        action={<Button variant="ghost" onClick={resetFilters} className="px-3 py-1.5">
          إعادة تعيين
        </Button>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="بحث">
            <Input value={search} placeholder="رقم الطلب، المورد، الفاتورة…"
              onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </Field>
          <Field label="الحالة">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">جميع الحالات</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          {hasGlobalScope && (
            <Field label="الموقع">
              <Select value={locationId}
                onChange={(e) => { setLocationId(e.target.value); setPage(1); }}>
                <option value="">جميع المواقع</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name_ar}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="من تاريخ">
            <Input type="date" value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
          </Field>
          <Field label="إلى تاريخ">
            <Input type="date" value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
          </Field>
          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={mineOnly}
                onChange={(e) => { setMineOnly(e.target.checked); setPage(1); }}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
              طلباتي فقط
            </label>
          </div>
        </div>
      </Card>

      <Card>
        {error && <Alert tone="error">{error}</Alert>}
        {loading ? <Spinner /> : rows.length === 0 ? (
          <EmptyState title="لا توجد طلبات مطابقة"
            hint="جرّب تعديل معايير البحث أو التصفية" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>رقم الطلب</Th><Th>الموقع</Th><Th>مقدم الطلب</Th>
                  <Th>المورد</Th><Th>الفاتورة</Th><Th>الإجمالي</Th>
                  <Th>التاريخ</Th><Th>الحالة</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/request/?id=${r.id}`}
                        className="font-semibold text-brand-700 hover:underline">
                        {r.request_number}
                      </Link>
                    </Td>
                    <Td>{r.locations?.name_ar ?? "—"}</Td>
                    <Td>{r.requester?.full_name ?? "—"}</Td>
                    <Td>{r.supplier_name ?? "—"}</Td>
                    <Td dir="ltr" className="text-slate-500">{r.invoice_number ?? "—"}</Td>
                    <Td className="font-medium">{formatMoney(r.total_amount)}</Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      {formatDate(r.request_date)}
                    </Td>
                    <Td><StatusBadge status={r.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

export default function RequestsPage() {
  return <Suspense fallback={<Spinner />}><RequestsInner /></Suspense>;
}
