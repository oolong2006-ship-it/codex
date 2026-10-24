import { listStudies } from "@majlis/db";
import { isLocale, t } from "@majlis/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { db, requireUser } from "@/lib/server";

export default async function StudiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requireUser(locale);
  const studies = await listStudies(db(), user.orgId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t(locale, "studies.title")}</h1>
        <Link
          href={`/${locale}/dashboard/studies/new`}
          className="inline-flex min-h-11 items-center rounded-xl bg-palm px-4 font-semibold text-white"
        >
          {t(locale, "nav.newStudy")}
        </Link>
      </div>
      {studies.length === 0 ? (
        <Card>
          <p>{t(locale, "studies.empty")}</p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {studies.map((s) => (
            <li key={s.id}>
              <Link href={`/${locale}/dashboard/studies/${s.id}`} className="block h-full">
                <Card className="h-full hover:border-palm">
                  <h2 className="mb-3 font-semibold">{s.title}</h2>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge tone={s.status === "recruiting" ? "good" : "neutral"}>
                      {t(locale, `studies.status.${s.status}`)}
                    </Badge>
                    <Badge>{t(locale, "studies.sessions", { count: s.sessions })}</Badge>
                    <Badge>{t(locale, "studies.completed", { count: s.completed })}</Badge>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
