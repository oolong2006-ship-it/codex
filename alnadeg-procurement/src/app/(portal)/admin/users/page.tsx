"use client";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/lib/auth-context";
import { fetchLocations, fetchUsers } from "@/lib/data";
import { createUser, resetUserPassword, updateUser } from "@/lib/api";
import { userSchema, type UserInput, formatPhoneForDisplay } from "@/lib/validation";
import { ALL_ROLES } from "@/lib/constants";
import { ROLE_LABEL } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import {
  Alert, Badge, Button, Card, EmptyState, Field, Input, Modal,
  Select, Spinner, Table, Td, Th,
} from "@/components/ui";
import type { LocationRow, ProfileRow } from "@/types/database";

export default function AdminUsersPage() {
  const { profile, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } =
    useForm<UserInput>({ resolver: zodResolver(userSchema) });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, l] = await Promise.all([
        fetchUsers({ search, role: roleFilter, locationId: locationFilter }),
        fetchLocations(false),
      ]);
      setUsers(u); setLocations(l); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل المستخدمين");
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, locationFilter]);

  useEffect(() => { load(); }, [load]);

  if (!isSuperAdmin) {
    return <Alert tone="warning" title="غير مصرّح">
      هذه الصفحة متاحة لمدير النظام فقط.
    </Alert>;
  }

  const openCreate = () => {
    setEditing(null);
    reset({ full_name: "", phone: "", role: "requester", location_id: "", job_title: "" });
    setTempPassword(null);
    setFormOpen(true);
  };

  const openEdit = (u: ProfileRow) => {
    setEditing(u);
    reset({
      full_name: u.full_name ?? "",
      phone: u.phone ?? "",
      role: u.role,
      location_id: u.location_id ?? "",
      job_title: u.job_title ?? "",
    });
    setTempPassword(null);
    setFormOpen(true);
  };

  const onSubmit = async (values: UserInput) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      if (editing) {
        await updateUser(editing.id, values);
        setNotice("تم حفظ تعديلات المستخدم");
        setFormOpen(false);
      } else {
        const res = await createUser(values);
        setTempPassword(res.temp_password);
        setNotice(res.message);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ المستخدم");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (u: ProfileRow) => {
    const action = u.is_active ? "تعطيل" : "تفعيل";
    if (!confirm(`هل تريد ${action} حساب «${u.full_name}»؟`)) return;
    setBusy(true); setError(null);
    try {
      await updateUser(u.id, { is_active: !u.is_active });
      setNotice(`تم ${action} الحساب`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تنفيذ العملية");
    } finally {
      setBusy(false);
    }
  };

  const doReset = async (u: ProfileRow) => {
    if (!confirm(`إعادة تعيين كلمة مرور «${u.full_name}»؟`)) return;
    setBusy(true); setError(null);
    try {
      const res = await resetUserPassword(u.id);
      setEditing(u);
      setTempPassword(res.temp_password);
      setFormOpen(true);
      setNotice(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إعادة التعيين");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-800">إدارة المستخدمين</h1>
          <p className="mt-1 text-sm text-slate-500">
            إنشاء المستخدمين وتحديد الأدوار والمواقع والتفعيل والتعطيل
          </p>
        </div>
        <Button onClick={openCreate}>إضافة مستخدم</Button>
      </header>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Card title="البحث والتصفية">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="بحث">
            <Input value={search} placeholder="الاسم أو رقم الجوال"
              onChange={(e) => setSearch(e.target.value)} />
          </Field>
          <Field label="الدور">
            <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">جميع الأدوار</option>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </Field>
          <Field label="الموقع">
            <Select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
              <option value="">جميع المواقع</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name_ar}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        {loading ? <Spinner /> : users.length === 0 ? (
          <EmptyState title="لا يوجد مستخدمون مطابقون" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>الاسم</Th><Th>رقم الجوال</Th><Th>الدور</Th>
                <Th>الموقع</Th><Th>الحالة</Th><Th>آخر دخول</Th><Th>إجراءات</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <Td className="font-medium">
                    {u.full_name}
                    {u.must_change_password && (
                      <Badge className="mr-2 bg-amber-50 text-amber-800 ring-amber-200">
                        كلمة مرور مؤقتة
                      </Badge>
                    )}
                  </Td>
                  <Td dir="ltr">{formatPhoneForDisplay(u.phone)}</Td>
                  <Td>{ROLE_LABEL[u.role]}</Td>
                  <Td>{locations.find((l) => l.id === u.location_id)?.name_ar ?? "—"}</Td>
                  <Td>
                    <Badge className={u.is_active
                      ? "bg-brand-50 text-brand-700 ring-brand-200"
                      : "bg-slate-100 text-slate-500 ring-slate-200"}>
                      {u.is_active ? "نشط" : "معطّل"}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-slate-500">
                    {formatDateTime(u.last_login_at)}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="ghost" className="px-2 py-1 text-xs"
                        onClick={() => openEdit(u)}>تعديل</Button>
                      <Button variant="ghost" className="px-2 py-1 text-xs"
                        onClick={() => doReset(u)}>كلمة مرور</Button>
                      {u.id !== profile?.id && (
                        <Button variant="ghost"
                          className={`px-2 py-1 text-xs ${u.is_active ? "text-rose-600" : "text-brand-600"}`}
                          onClick={() => toggleActive(u)}>
                          {u.is_active ? "تعطيل" : "تفعيل"}
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="mt-4 text-xs text-slate-400">
          ملاحظة: لا يمكن حذف المستخدمين للحفاظ على سلامة سجلات الاعتماد والتدقيق —
          استخدم التعطيل بدلاً من ذلك.
        </p>
      </Card>

      <Modal open={formOpen} onClose={() => setFormOpen(false)}
        title={editing ? `تعديل: ${editing.full_name}` : "إضافة مستخدم جديد"}>
        {tempPassword ? (
          <div className="space-y-4">
            <Alert tone="success" title="كلمة المرور المؤقتة">
              سلّم هذه الكلمة للمستخدم عبر قناة آمنة. لن تظهر مرة أخرى،
              وسيُطلب منه تغييرها عند أول دخول.
            </Alert>
            <div className="rounded-lg bg-slate-900 p-4 text-center">
              <code dir="ltr" className="select-all text-lg font-bold text-gold-300">
                {tempPassword}
              </code>
            </div>
            <Button full onClick={() => { setTempPassword(null); setFormOpen(false); }}>
              تم النسخ، إغلاق
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <Field label="الاسم الكامل" required error={errors.full_name?.message}>
              <Input {...register("full_name")} invalid={!!errors.full_name} />
            </Field>

            <Field label="رقم الجوال" required error={errors.phone?.message}
              hint="مثال: 0551234567">
              <Input {...register("phone")} type="tel" dir="ltr" invalid={!!errors.phone} />
            </Field>

            <Field label="الدور" required error={errors.role?.message}>
              <Select {...register("role")} invalid={!!errors.role}>
                {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>
            </Field>

            <Field label="الموقع أو الفرع" required error={errors.location_id?.message}>
              <Select {...register("location_id")} invalid={!!errors.location_id}>
                <option value="">— اختر الموقع —</option>
                {locations.filter((l) => l.is_active).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name_ar} {l.kind === "central" ? "(موقع مركزي)" : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="الوظيفة">
              <Input {...register("job_title")} />
            </Field>

            <div className="flex gap-3">
              <Button type="submit" loading={busy}>
                {editing ? "حفظ التعديلات" : "إنشاء المستخدم"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
                إلغاء
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
