import { isLocale, t } from "@majlis/i18n";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { currentUser } from "@/lib/server";
import { LoginForm } from "./login-form";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (await currentUser()) redirect(`/${locale}/dashboard`);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <p className="text-2xl font-semibold text-palm">{t(locale, "app.name")}</p>
      <Card>
        <h1 className="mb-4 text-xl font-semibold">{t(locale, "auth.title")}</h1>
        <LoginForm locale={locale} />
      </Card>
    </main>
  );
}
