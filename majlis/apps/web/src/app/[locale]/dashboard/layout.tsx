import { isLocale, t } from "@majlis/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/server";
import { logoutAction } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requireUser(locale);
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href={`/${locale}/dashboard`} className="text-xl font-semibold text-palm">
              {t(locale, "app.name")}
            </Link>
            <span className="text-sm opacity-70">{user.orgName}</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href={`/${locale}/dashboard`}>{t(locale, "nav.studies")}</Link>
            <Link href={`/${locale}/dashboard/studies/new`}>{t(locale, "nav.newStudy")}</Link>
            <Link href={`/${locale}/dashboard/memory`}>{t(locale, "nav.memory")}</Link>
            <form action={logoutAction.bind(null, locale)}>
              <button type="submit" className="underline underline-offset-4">
                {t(locale, "auth.logout")}
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
