import Link from "next/link";
import { redirect } from "next/navigation";
import { register } from "@/server/domain/auth";
import { back, errorMessage, setSessionCookie, str } from "@/server/web";
import { Field, Flash, flash, type SP } from "@/components/ui";

async function registerAction(fd: FormData) {
  "use server";
  if (fd.get("terms") !== "on") back("/register", "err", "يجب الموافقة على الشروط وسياسة الخصوصية");
  try {
    const { token } = await register({ email: str(fd, "email"), fullName: str(fd, "fullName"), password: str(fd, "password") });
    await setSessionCookie(token);
  } catch (e) {
    back("/register", "err", errorMessage(e));
  }
  redirect("/onboarding");
}

export default async function RegisterPage({ searchParams }: { searchParams: SP }) {
  const f = await flash(searchParams);
  return (
    <>
      <h1 className="mb-1 text-xl">إنشاء حساب</h1>
      <p className="mb-4 text-sm text-slate-600">التشخيص الأولي مجاني ولا يُعد تدقيق اعتماد.</p>
      <Flash {...f} />
      <form action={registerAction} className="space-y-4">
        <Field label="الاسم الكامل" name="fullName" required autoComplete="name" />
        <Field label="البريد الإلكتروني" name="email" type="email" required autoComplete="email" dir="ltr" />
        <Field label="كلمة المرور" name="password" type="password" required autoComplete="new-password" dir="ltr" hint="10 أحرف على الأقل وتحتوي أحرفاً وأرقاماً" />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="terms" className="mt-1" />
          <span>أوافق على شروط الاستخدام وسياسة الخصوصية، وأفهم أن المنصة لا تمنح شهادات ISO.</span>
        </label>
        <button className="btn-primary w-full" type="submit">إنشاء الحساب</button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">لديك حساب؟ <Link href="/login">تسجيل الدخول</Link></p>
    </>
  );
}
