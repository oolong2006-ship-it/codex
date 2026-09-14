"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAuditLogs } from "@/lib/data";
import { AUDIT_ACTION_LABEL, ROLE_LABEL } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import {
  Alert, Badge, Card, EmptyState, Field, Pagination,
  Select, Spinner, Table, Td, Th,
} from "@/components/ui";
import type { AuditLogRow, UserRole } from "@/types/database";

const PAGE_SIZE = 50;

export default function AuditPage() {
  const { isSuperAdmin } = useAuth();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAuditLogs(page, PAGE_SIZE, action || undefined);
      setRows(res.rows); setTotal(res.total); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل سجل التدقيق");
    } finally {
      setLoading(false);
    }
  }, [page, action]);

  useEffect(() => { load(); }, [load]);

  if (!isSuperAdmin) {
    return <Alert tone="warning" title="غير مصرّح">
      سجل التدقيق متاح لمدير النظام فقط.
    </Alert>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-extrabold text-brand-800">سجل التدقيق</h1>
        <p className="mt-1 text-sm text-slate-500">
          سجل للقراءة فقط — لا يمكن تعديله أو حذفه من الواجهة أو من قاعدة البيانات.
        </p>
      </header>

      <Card title="تصفية">
        <div className="max-w-sm">
          <Field label="نوع العملية">
            <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
              <option value="">جميع العمليات</option>
              {Object.entries(AUDIT_ACTION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        {error && <Alert tone="error">{error}</Alert>}
        {loading ? <Spinner /> : rows.length === 0 ? (
          <EmptyState title="لا توجد سجلات" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>التاريخ والوقت</Th><Th>المنفذ</Th><Th>الدور</Th>
                  <Th>العملية</Th><Th>الكيان</Th><Th>التفاصيل</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap text-xs text-slate-500">
                      {formatDateTime(r.created_at)}
                    </Td>
                    <Td className="font-medium">{r.actor_name ?? "النظام"}</Td>
                    <Td className="text-slate-500">
                      {r.actor_role ? ROLE_LABEL[r.actor_role as UserRole] ?? r.actor_role : "—"}
                    </Td>
                    <Td>
                      <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                        {AUDIT_ACTION_LABEL[r.action] ?? r.action}
                      </Badge>
                    </Td>
                    <Td className="text-xs text-slate-400">{r.entity_type}</Td>
                    <Td className="max-w-xs">
                      <code dir="ltr" className="block truncate text-[11px] text-slate-500">
                        {JSON.stringify(r.details)}
                      </code>
                    </Td>
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
