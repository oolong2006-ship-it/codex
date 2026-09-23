"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ROLES, ROLE_LABEL, type UserRole } from "@/lib/constants";
import { listProfiles, updateProfile } from "@/lib/data";
import type { Profile } from "@/lib/types";
import { dbErrorMessage } from "@/lib/validation";
import { useToast } from "@/components/Toast";
import { Button, Notice, Spinner, cn } from "@/components/ui";

const ROLE_HELP: Record<UserRole, string> = {
  admin: "كل الصلاحيات: حذف الموردين وحذف التجريبي وإدارة المستخدمين",
  editor: "إضافة وتعديل واستيراد الموردين",
  viewer: "بحث ومقارنة وتصدير فقط",
};

export default function UsersPage() {
  const { isAdmin, profile: me } = useAuth();
  const toast = useToast();
  const [list, setList] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    listProfiles().then(setList).catch((e) => setError(dbErrorMessage(e)));
  }, []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  if (!isAdmin) return <Notice>هذه الصفحة لمدير النظام فقط.</Notice>;

  const patch = async (p: Profile, change: Partial<Pick<Profile, "role" | "is_active">>) => {
    setBusy(p.id);
    try {
      await updateProfile(p.id, change);
      setList((cur) => cur?.map((x) => (x.id === p.id ? { ...x, ...change } : x)) ?? null);
      toast("تم الحفظ");
    } catch (e) {
      toast(dbErrorMessage(e as Error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h1 className="mb-2 mt-0 text-2xl font-bold">المستخدمون والصلاحيات</h1>
      <details className="mb-4 rounded-[10px] border border-line bg-surface p-3 text-sm">
        <summary className="cursor-pointer font-semibold">كيف أضيف مستخدماً جديداً؟</summary>
        <ol className="mt-2 list-decimal space-y-1 ps-5">
          <li>من لوحة Supabase: <b>Authentication ← Users ← Add user</b>.</li>
          <li>اختر <b>Send invitation</b> (يصله بريد لتعيين كلمة المرور)، أو <b>Create new user</b> بكلمة مرور مؤقتة مع تفعيل Auto Confirm.</li>
          <li>يظهر هنا تلقائياً <b>موقوفاً</b> بدور «مشاهد»: اضغط «تفعيل» واختر دوره.</li>
        </ol>
      </details>
      <ul className="mb-4 space-y-1 text-sm text-muted">
        {ROLES.map((r) => <li key={r}><b className="text-ink">{ROLE_LABEL[r]}:</b> {ROLE_HELP[r]}</li>)}
      </ul>
      {error && <Notice tone="danger">{error}</Notice>}
      {!list ? <Spinner /> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="text-start">
                {["الاسم", "البريد", "الدور", "الحالة", ""].map((h, i) => (
                  <th key={i} className="border-b border-line p-2.5 text-start font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const self = p.id === me?.id;
                return (
                  <tr key={p.id} className={cn(!p.is_active && "opacity-60")}>
                    <td className="border-b border-line p-2.5">{p.full_name || "—"}{self && <span className="ms-1 text-muted">(أنت)</span>}</td>
                    <td className="border-b border-line p-2.5" dir="ltr">{p.email}</td>
                    <td className="border-b border-line p-2.5">
                      <select className="field py-1.5" value={p.role} disabled={self || busy === p.id}
                        aria-label={`دور ${p.full_name}`}
                        onChange={(e) => patch(p, { role: e.target.value as UserRole })}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    </td>
                    <td className="border-b border-line p-2.5">{p.is_active ? "مفعّل" : "موقوف"}</td>
                    <td className="border-b border-line p-2.5">
                      {!self && (
                        <Button className="px-3 py-1.5 text-sm" loading={busy === p.id}
                          variant={p.is_active ? "danger" : "default"}
                          onClick={() => patch(p, { is_active: !p.is_active })}>
                          {p.is_active ? "إيقاف" : "تفعيل"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
