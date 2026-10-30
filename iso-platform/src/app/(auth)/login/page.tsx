import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "@/server/domain/auth";
import { back, clientIp, errorMessage, setSessionCookie, str } from "@/server/web";
import { Field, Flash, flash, type SP } from "@/components/ui";

async function loginAction(fd: FormData) {
  "use server";
  try {
    const { token } = await login(str(fd, "email"), str(fd, "password"), await clientIp());
    await setSessionCookie(token);
  } catch (e) {
    back("/login", "err", errorMessage(e));
  }
  redirect("/app");
}

export default async function LoginPage({ searchParams }: { searchParams: SP }) {
  const f = await flash(searchParams);
  return (
    <>
      <h1 className="mb-4 text-xl">تسجيل الدخول</h1>
      <Flash {...f} />
      <form action={loginAction} className="space-y-4">
        <Field label="البريد الإلكتروني" name="email" type="email" required autoComplete="email" dir="ltr" />
        <Field label="كلمة المرور" name="password" type="password" required autoComplete="current-password" dir="ltr" />
        <button className="btn-primary w-full" type="submit">دخول</button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">ليس لديك حساب؟ <Link href="/register">سجّل منشأتك</Link></p>
    </>
  );
}
