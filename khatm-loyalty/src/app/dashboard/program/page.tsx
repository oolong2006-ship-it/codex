import { requireDashboardActor, getLang } from "@/server/web";
import { getProgram, getMerchant } from "@/server/domain/management";
import { requirePermission } from "@/server/actor";
import { PERMISSIONS } from "@/server/rbac";
import { STAMP_ICONS } from "@/server/domain/design";
import { env } from "@/server/env";
import { t } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { ProgramForm } from "./program-form";

export const metadata = { title: "Program" };

export default async function ProgramPage() {
  const actor = await requireDashboardActor();
  requirePermission(actor, PERMISSIONS.PROGRAM_MANAGE);
  const lang = await getLang();
  const [program, merchant] = await Promise.all([getProgram(actor), getMerchant(actor)]);
  const joinUrl = `${env().APP_URL}/join/${program.slug}`;
  const keys = ["name", "stampsRequired", "reward", "rewardPlaceholder", "cooldown", "maxPerScan", "welcome", "terms", "design", "bgColor", "fgColor", "accentColor", "stampIcon", "active", "preview"];
  const labels = Object.fromEntries(keys.map((k) => [k, t(lang, `program.${k}`)]));
  labels.save = t(lang, "common.save");
  return (
    <>
      <PageHeader title={t(lang, "program.title")} />
      <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-espresso-500">{t(lang, "program.joinLink")}</div>
          <a href={joinUrl} target="_blank" className="block truncate font-mono text-sm text-espresso-800 underline-offset-4 hover:underline" dir="ltr" data-testid="join-link">{joinUrl}</a>
        </div>
        <a href="/dashboard/poster" className="btn-ghost">{t(lang, "nav.poster")}</a>
      </div>
      <ProgramForm lang={lang} merchantName={merchant.name} program={program} icons={STAMP_ICONS} labels={labels} />
    </>
  );
}
