import { redirect } from "next/navigation";
import { changePassword, login } from "@/server/domain/auth";
import { back, clientIp, currentSession, errorMessage, setSessionCookie, str } from "@/server/web";
import { Field, Flash, flash, type SP } from "@/components/ui";

async function changeAction(fd: FormData) {
  "use server";
  const s = await currentSession();
  if (!s) redirect("/login");
  try {
    await changePassword(s.userId, str(fd, "current"), str(fd, "next"));
    const { token } = await login(s.email, str(fd, "next"), await clientIp());
    await setSessionCookie(token);
  } catch (e) {
    back("/change-password", "err", errorMessage(e));
  }
  redirect("/app");
}

export default async function ChangePassword({ searchParams }: { searchParams: SP }) {
  const s = await currentSession();
  if (!s) redirect("/login");
  const f = await flash(searchParams);
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <div className="card">
        <h1 className="mb-2 text-xl">تغيير كلمة المرور</h1>
        {s.mustChangePassword && <p className="mb-4 text-sm text-amber-700">يجب تغيير كلمة المرور المؤقتة قبل المتابعة.</p>}
        <Flash {...f} />
        <form action={changeAction} className="space-y-4">
          <Field label="كلمة المرور الحالية" name="current" type="password" required dir="ltr" />
          <Field label="كلمة المرور الجديدة" name="next" type="password" required dir="ltr" hint="10 أحرف على الأقل وتحتوي أحرفاً وأرقاماً" />
          <button className="btn-primary w-full">حفظ</button>
        </form>
      </div>
    </main>
  );
}
