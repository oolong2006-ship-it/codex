import { transcriptForClient } from "@majlis/db";
import { isLocale, t } from "@majlis/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, cx } from "@/components/ui";
import { db, requireUser } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function TranscriptPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; sessionId: string }>;
}) {
  const { locale, id, sessionId } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requireUser(locale);
  const turns = await transcriptForClient(db(), user.orgId, sessionId);
  if (!turns) notFound();
  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/${locale}/dashboard/studies/${id}?tab=sessions`}
        className="text-sm underline underline-offset-4"
      >
        {t(locale, "transcript.back")}
      </Link>
      <h1 className="text-2xl font-semibold">{t(locale, "transcript.title")}</h1>
      <p className="text-sm opacity-70">{t(locale, "sessions.privacy")}</p>
      <Card>
        <ol className="flex flex-col gap-3">
          {turns.map((turn) => (
            <li
              key={turn.idx}
              data-role={turn.role}
              className={cx(
                "max-w-[85%] rounded-2xl px-4 py-2",
                turn.role === "interviewer" ? "self-start bg-sand" : "self-end bg-palm/10",
              )}
            >
              <span className="block text-xs opacity-60">
                {t(
                  locale,
                  turn.role === "interviewer" ? "transcript.interviewer" : "transcript.participant",
                )}
              </span>
              {turn.text}
              {turn.audioTurnId && (
                <audio
                  controls
                  preload="none"
                  src={`/api/audio/${turn.audioTurnId}`}
                  className="mt-2 w-full"
                  aria-label={t(locale, "transcript.listen")}
                />
              )}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
