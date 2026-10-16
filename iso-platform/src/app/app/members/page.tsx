import { changeMemberRole, listMembers, removeMember } from "@/server/domain/orgs";
import { can, type Role } from "@/server/rbac";
import { act, requireCtx, str } from "@/server/web";
import { Flash, PageHeader, flash, type SP } from "@/components/ui";
import { AddMemberForm } from "./AddMemberForm";

const ROLES: [Role, string, string][] = [
  ["OWNER", "مالك", "كل الصلاحيات، بما فيها الأعضاء والفوترة"],
  ["QUALITY_MANAGER", "مدير الجودة", "إدارة المشروع، اعتماد الوثائق وجعلها سارية"],
  ["CONTRIBUTOR", "مساهم", "الإجابة على المقابلة، إعداد المسودات وإرسالها للمراجعة"],
  ["AUDITOR", "مدقق", "اطلاع كامل وسجل الأحداث دون تعديل"],
  ["VIEWER", "مشاهد", "اطلاع فقط"],
];

async function roleAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  await act("/app/members", "تم تحديث الدور", () => changeMemberRole(ctx, str(fd, "userId"), str(fd, "role") as Role));
}
async function removeAction(fd: FormData) {
  "use server";
  const { ctx } = await requireCtx();
  await act("/app/members", "تمت إزالة العضو", () => removeMember(ctx, str(fd, "userId")));
}

export default async function Members({ searchParams }: { searchParams: SP }) {
  const { ctx } = await requireCtx();
  const [members, f] = await Promise.all([listMembers(ctx), flash(searchParams)]);
  const manage = can(ctx.role, "members.manage");
  return (
    <>
      <PageHeader title="الفريق والصلاحيات" subtitle="الاعتماد يتطلب شخصاً غير مُعدّ الوثيقة (فصل المهام)؛ أضف مراجعاً واحداً على الأقل." />
      <Flash {...f} />
      <div className="card mb-6">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th>{manage && <th />}</tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id}>
                  <td>{m.full_name}<div className="text-xs text-slate-500">{m.job_title}</div></td>
                  <td dir="ltr" className="text-end">{m.email}</td>
                  <td>
                    {manage ? (
                      <form action={roleAction} className="flex gap-2">
                        <input type="hidden" name="userId" value={m.user_id} />
                        <select name="role" defaultValue={m.role} className="input py-1">
                          {ROLES.map(([r, ar]) => <option key={r} value={r}>{ar}</option>)}
                        </select>
                        <button className="btn-ghost py-1">حفظ</button>
                      </form>
                    ) : (
                      ROLES.find((r) => r[0] === m.role)?.[1]
                    )}
                  </td>
                  {manage && (
                    <td>
                      {m.user_id !== ctx.userId && (
                        <form action={removeAction}><input type="hidden" name="userId" value={m.user_id} /><button className="text-xs text-red-700">إزالة</button></form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {manage && <div className="card"><h2 className="mb-3">إضافة عضو</h2><AddMemberForm /></div>}
        <div className="card">
          <h2 className="mb-3">مصفوفة الأدوار</h2>
          <ul className="space-y-2 text-sm">{ROLES.map(([r, ar, d]) => <li key={r}><strong>{ar}:</strong> {d}</li>)}</ul>
        </div>
      </div>
    </>
  );
}
