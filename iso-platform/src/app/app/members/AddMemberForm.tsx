"use client";
import { useActionState } from "react";
import { addMemberAction, type AddMemberState } from "./actions";

export function AddMemberForm() {
  const [state, action, pending] = useActionState<AddMemberState, FormData>(addMemberAction, null);
  return (
    <form action={action} className="space-y-3">
      {state?.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</div>}
      {state?.email && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          تمت إضافة {state.email}.
          {state.tempPassword ? (
            <> كلمة المرور المؤقتة (تظهر مرة واحدة، ويُطلب تغييرها عند أول دخول): <code dir="ltr" className="rounded bg-white px-1 font-mono">{state.tempPassword}</code></>
          ) : (
            " الحساب موجود مسبقاً وأضيف إلى المنشأة."
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">الاسم</span><input name="fullName" className="input" required /></label>
        <label className="block"><span className="label">البريد الإلكتروني</span><input name="email" type="email" dir="ltr" className="input" required /></label>
        <label className="block"><span className="label">المسمى الوظيفي</span><input name="jobTitle" className="input" /></label>
        <label className="block">
          <span className="label">الدور</span>
          <select name="role" className="input" defaultValue="CONTRIBUTOR">
            <option value="QUALITY_MANAGER">مدير الجودة</option>
            <option value="CONTRIBUTOR">مساهم</option>
            <option value="AUDITOR">مدقق</option>
            <option value="VIEWER">مشاهد</option>
            <option value="OWNER">مالك</option>
          </select>
        </label>
      </div>
      <button className="btn-primary" disabled={pending}>{pending ? "جارٍ الإضافة…" : "إضافة عضو"}</button>
    </form>
  );
}
