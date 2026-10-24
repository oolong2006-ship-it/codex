import { isLocale, t } from "@majlis/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const other = locale === "ar" ? "en" : "ar";

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-16">
      <header className="flex items-center justify-between">
        <span className="text-2xl font-semibold text-palm">{t(locale, "app.name")}</span>
        <Link href={`/${other}`} className="text-sm underline underline-offset-4">
          {t(locale, "common.switchLanguage")}
        </Link>
      </header>
      <h1 className="text-4xl font-semibold leading-tight">{t(locale, "home.title")}</h1>
      <p className="text-lg leading-relaxed">{t(locale, "home.description")}</p>
      <div>
        <Link
          href={`/${locale}/login`}
          className="inline-flex min-h-11 items-center rounded-xl bg-palm px-5 font-semibold text-white"
        >
          {t(locale, "home.login")}
        </Link>
      </div>
      <p className="border-s-4 border-palm ps-3 text-sm opacity-80">
        {t(locale, "home.status", { phase: 4 })}
      </p>
    </main>
  );
}
