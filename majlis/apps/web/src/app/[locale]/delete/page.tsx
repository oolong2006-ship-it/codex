import { isLocale, t } from "@majlis/i18n";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { DeletionForm } from "./form";

export default async function DeletionPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-8">
      <p className="text-xl font-semibold text-palm">{t(locale, "app.name")}</p>
      <Card className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t(locale, "deletion.title")}</h1>
        <p>{t(locale, "deletion.body")}</p>
        <DeletionForm locale={locale} />
      </Card>
    </main>
  );
}
