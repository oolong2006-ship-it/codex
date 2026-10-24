import { personasForClient } from "@majlis/db";
import { isLocale, t, type Locale, type MessageKey } from "@majlis/i18n";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { db, requireUser } from "@/lib/server";
import { AskMemory } from "./ask";

export const dynamic = "force-dynamic";

function segmentLabel(locale: Locale, segment: Record<string, string>): string {
  return Object.entries(segment)
    .map(([dim, v]) =>
      dim === "ageBand"
        ? v
        : t(
            locale,
            `${dim === "gender" ? "gender" : dim === "city" ? "cities" : "dialects"}.${v}` as MessageKey,
          ),
    )
    .join(" · ");
}

export default async function MemoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requireUser(locale);
  const personas = await personasForClient(db(), user.orgId);
  const minSessions = Number(process.env.PERSONA_MIN_SESSIONS ?? 3);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t(locale, "memory.title")}</h1>
      <AskMemory locale={locale} />
      <h2 className="text-xl font-semibold">{t(locale, "memory.personas")}</h2>
      {personas.length === 0 ? (
        <Card>
          <p>{t(locale, "memory.personasEmpty", { min: minSessions })}</p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {personas.map((p) => (
            <li key={p.segmentKey}>
              <Card className="flex h-full flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{segmentLabel(locale, p.segment)}</h3>
                  <Badge>{t(locale, "memory.version", { version: p.version })}</Badge>
                </div>
                <p className="text-sm opacity-70">
                  {t(locale, "memory.interviews", {
                    sessions: p.attributes.sessions,
                    studies: p.attributes.studies,
                  })}
                </p>
                {p.attributes.praises.length > 0 && (
                  <p>
                    <span className="font-semibold">{t(locale, "memory.praises")}: </span>
                    {p.attributes.praises.map((x) => x.theme).join("، ")}
                  </p>
                )}
                {p.attributes.complaints.length > 0 && (
                  <p>
                    <span className="font-semibold">{t(locale, "memory.complaints")}: </span>
                    {p.attributes.complaints.map((x) => x.theme).join("، ")}
                  </p>
                )}
                {p.evidence.map((q) => (
                  <blockquote key={q.turnId} className="rounded-xl bg-sand p-3 text-sm">
                    «{q.text}»
                  </blockquote>
                ))}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
