"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { fetchRequests } from "@/lib/data";
import { APPROVAL_FLOW, STAGE_ROLE } from "@/lib/constants";
import { STAGE_LABEL } from "@/lib/labels";
import { daysSince, formatDate, formatMoney } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Alert, Badge, Card, EmptyState, Select, Spinner, Table, Td, Th,
} from "@/components/ui";
import type { ApprovalStage, PurchaseRequestWithRelations } from "@/types/database";

export default function ApprovalsPage() {
  const { profile, isSuperAdmin } = useAuth();
  const [rows, setRows] = useState<PurchaseRequestWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState("");

  // مرحلة المستخدم الافتراضية مشتقة من دوره
  const myStage = profile
    ? APPROVAL_FLOW.find((s) => STAGE_ROLE[s] === profile.role)
    : undefined;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const stage = stageFilter || myStage;
      const res = await fetchRequests({
        stage: isSuperAdmin && !stageFilter ? undefined : stage,
        pageSize: 100,
      });
      // مدير النظام بلا مرشّح يرى كل ما هو قيد الاعتماد
      setRows(res.rows.filter((r) => r.current_stage !== null));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل صندوق الاعتمادات");
    } finally {
      setLoading(false);
    }
  }, [stageFilter, myStage, isSuperAdmin]);

  useEffect(() => { load(); }, [load]);

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-extrabold text-brand-800">صندوق الاعتمادات</h1>
        <p className="mt-1 text-sm text-slate-500">
          {myStage
            ? `الطلبات التي تنتظر قرارك في مرحلة «${STAGE_LABEL[myStage]}»`
            : "الطلبات قيد الاعتماد"}
        </p>
      </header>

      {isSuperAdmin && (
        <Card title="تصفية حسب المرحلة">
          <div className="max-w-xs">
            <Select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
              <option value="">جميع المراحل</option>
              {APPROVAL_FLOW.map((s) => (
                <option key={s} value={s}>{STAGE_LABEL[s]}</option>
              ))}
            </Select>
          </div>
        </Card>
      )}

      <Card>
        {error && <Alert tone="error">{error}</Alert>}
        {loading ? <Spinner /> : rows.length === 0 ? (
          <EmptyState title="لا توجد طلبات بانتظار قرارك"
            hint="ستظهر هنا الطلبات فور وصولها إلى مرحلتك" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>رقم الطلب</Th><Th>الموقع</Th><Th>المورد</Th>
                <Th>الإجمالي</Th><Th>المرحلة</Th><Th>منذ</Th><Th>الحالة</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const age = daysSince(r.submitted_at);
                const late = age !== null && age > 3;
                return (
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
                    <Td>{r.current_stage
                      ? STAGE_LABEL[r.current_stage as ApprovalStage] : "—"}</Td>
                    <Td>
                      {age === null ? "—" : (
                        <Badge className={late
                          ? "bg-rose-50 text-rose-700 ring-rose-200"
                          : "bg-slate-100 text-slate-600 ring-slate-200"}>
                          {age} يوم
                        </Badge>
                      )}
                    </Td>
                    <Td><StatusBadge status={r.status} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
