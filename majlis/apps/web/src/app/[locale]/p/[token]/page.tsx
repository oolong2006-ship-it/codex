import { getInvite } from "@majlis/db";
import { isLocale, t } from "@majlis/i18n";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { db, gatewayUrl } from "@/lib/server";
import { ParticipantFlow } from "./flow";

export const dynamic = "force-dynamic";

export default async function ParticipantPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  const invite = await getInvite(db(), token);

  const message = !invite ? "participant.notFound" : !invite.open ? "participant.closed" : null;
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-8">
      <p className="text-xl font-semibold text-palm">{t(locale, "app.name")}</p>
      {message || !invite ? (
        <Card>
          <p>{t(locale, message ?? "participant.notFound")}</p>
        </Card>
      ) : (
        <ParticipantFlow
          locale={locale}
          token={token}
          gateway={gatewayUrl()}
          invite={{
            topic: invite.topic,
            durationPhrase: invite.durationPhrase,
            incentive: invite.incentive,
            voiceSetting: invite.voiceSetting,
            screener: invite.screener,
            disclosure: invite.disclosure,
          }}
        />
      )}
    </main>
  );
}
