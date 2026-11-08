import Link from "next/link";
import { redirect } from "next/navigation";
import { getDashboardActor, getLang } from "@/server/web";
import { t } from "@/lib/i18n";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export const metadata = { title: "Login" };

export default async function LoginPage() {
  if (await getDashboardActor()) redirect("/dashboard");
  const lang = await getLang();
  return (
    <AuthShell lang={lang} title={t(lang, "auth.login.title")}>
      <LoginForm labels={{ email: t(lang, "common.email"), password: t(lang, "common.password"), submit: t(lang, "auth.login.submit") }} />
      <p className="mt-6 text-center text-sm text-espresso-500">
        {t(lang, "auth.login.noAccount")}{" "}
        <Link href="/signup" className="font-semibold text-espresso-800 underline-offset-4 hover:underline">
          {t(lang, "landing.cta")}
        </Link>
      </p>
    </AuthShell>
  );
}
