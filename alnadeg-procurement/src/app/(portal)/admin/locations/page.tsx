"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchLocationStats, fetchLocations, upsertLocation } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import {
  Alert, Badge, Button, Card, Field, Input, Modal,
  Select, Spinner, Table, Td, Th,
} from "@/components/ui";
import type { LocationRow } from "@/types/database";

export default function AdminLocationsPage() {
  const { isSuperAdmin } = useAuth();
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [stats, setStats] = useState<Record<string, { users: number; requests: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<LocationRow | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name_ar: "", kind: "branch", sort_order: 99 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, s] = await Promise.all([fetchLocations(false), fetchLocationStats()]);
      setLocations(l); setStats(s); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل المواقع");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!isSuperAdmin) {
    return <Alert tone="warning" title="غير مصرّح">
      هذه الصفحة متاحة لمدير النظام فقط.
    </Alert>;
  }

  const openCreate = () => {
    setEditing(null);
    setForm({ code: "", name_ar: "", kind: "branch",
      sort_order: locations.length + 1 });
    setOpen(true);
  };

  const openEdit = (l: LocationRow) => {
    setEditing(l);
    setForm({
      code: l.code ?? "", name_ar: l.name_ar ?? "",
      kind: l.kind, sort_order: l.sort_order,
    });
    setOpen(true);
  };

  const save = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      await upsertLocation(editing ? { id: editing.id, ...form } as Partial<LocationRow>
        : { ...form, is_active: true } as Partial<LocationRow>);
      setNotice(editing ? "تم حفظ الموقع" : "تمت إضافة الموقع");
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ الموقع");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (l: LocationRow) => {
    const linked = stats[l.id]?.requests ?? 0;
    if (l.is_active && linked > 0 &&
      !confirm(`هذا الموقع مرتبط بـ ${linked} طلبًا. التعطيل يمنع إنشاء طلبات جديدة فقط. المتابعة؟`)) {
      return;
    }
    setBusy(true);
    try {
      await upsertLocation({ id: l.id, is_active: !l.is_active });
      setNotice(l.is_active ? "تم تعطيل الموقع" : "تم تفعيل الموقع");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تنفيذ العملية");
    } finally {
      setBusy(false);
    }
  };

  const branches = locations.filter((l) => l.kind === "branch");
  const central = locations.filter((l) => l.kind === "central");

  const LocationTable = ({ rows, title }: { rows: LocationRow[]; title: string }) => (
    <Card title={`${title} (${formatNumber(rows.length)})`}>
      <Table>
        <thead>
          <tr>
            <Th>#</Th><Th>الاسم</Th><Th>الكود</Th>
            <Th>المستخدمون</Th><Th>الطلبات</Th><Th>الحالة</Th><Th>إجراءات</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((l) => (
            <tr key={l.id} className="hover:bg-slate-50">
              <Td className="text-slate-400">{l.sort_order}</Td>
              <Td className="font-medium">{l.name_ar}</Td>
              <Td dir="ltr" className="text-slate-500">{l.code}</Td>
              <Td>{formatNumber(stats[l.id]?.users ?? 0)}</Td>
              <Td>{formatNumber(stats[l.id]?.requests ?? 0)}</Td>
              <Td>
                <Badge className={l.is_active
                  ? "bg-brand-50 text-brand-700 ring-brand-200"
                  : "bg-slate-100 text-slate-500 ring-slate-200"}>
                  {l.is_active ? "نشط" : "غير نشط"}
                </Badge>
              </Td>
              <Td>
                <div className="flex gap-1.5">
                  <Button variant="ghost" className="px-2 py-1 text-xs"
                    onClick={() => openEdit(l)}>تعديل</Button>
                  <Button variant="ghost"
                    className={`px-2 py-1 text-xs ${l.is_active ? "text-rose-600" : "text-brand-600"}`}
                    onClick={() => toggleActive(l)}>
                    {l.is_active ? "تعطيل" : "تفعيل"}
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-800">إدارة المواقع</h1>
          <p className="mt-1 text-sm text-slate-500">
            إجمالي المواقع: {formatNumber(locations.length)} —
            فروع: {formatNumber(branches.length)} —
            مواقع مركزية: {formatNumber(central.length)}
          </p>
        </div>
        <Button onClick={openCreate}>إضافة موقع</Button>
      </header>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {loading ? <Spinner /> : (
        <>
          <LocationTable rows={branches} title="الفروع" />
          <LocationTable rows={central} title="المواقع التشغيلية والمركزية" />
          <p className="text-xs text-slate-400">
            لا يمكن حذف موقع مرتبط بطلبات أو مستخدمين — استخدم التعطيل.
          </p>
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)}
        title={editing ? `تعديل: ${editing.name_ar}` : "إضافة موقع جديد"}>
        <div className="space-y-4">
          <Field label="اسم الموقع" required>
            <Input value={form.name_ar}
              onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
          </Field>
          <Field label="كود الموقع" required hint="مثال: BR-22 للفروع أو CN-07 للمواقع المركزية">
            <Input value={form.code} dir="ltr"
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="التصنيف" required>
            <Select value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="branch">فرع</option>
              <option value="central">موقع تشغيلي أو مركزي</option>
            </Select>
          </Field>
          <Field label="ترتيب العرض">
            <Input type="number" value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
          </Field>
          <div className="flex gap-3">
            <Button onClick={save} loading={busy}
              disabled={!form.name_ar.trim() || !form.code.trim()}>
              حفظ
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
