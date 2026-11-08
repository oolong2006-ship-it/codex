import { requireDashboardActor, getLang } from "@/server/web";
import { getProgram, getMerchant } from "@/server/domain/management";
import { env } from "@/server/env";
import { qrSvg } from "@/server/qr";
import { t } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "./print-button";

export const metadata = { title: "Poster" };

export default async function PosterPage() {
  const actor = await requireDashboardActor();
  const lang = await getLang();
  const [program, merchant] = await Promise.all([getProgram(actor), getMerchant(actor)]);
  const url = `${env().APP_URL}/join/${program.slug}`;
  const svg = await qrSvg(url, { dark: program.design.bg });
  return (
    <>
      <div className="no-print">
        <PageHeader
          title={t(lang, "poster.title")}
          sub={t(lang, "poster.help")}
          actions={
            <>
              <a href="/api/poster/qr.png" className="btn-ghost">{t(lang, "poster.downloadPng")}</a>
              <PrintButton label={t(lang, "common.print")} />
            </>
          }
        />
      </div>
      <div
        className="mx-auto flex aspect-[1/1.414] w-full max-w-md flex-col items-center justify-between overflow-hidden rounded-3xl p-8 text-center shadow-xl print:max-w-none print:rounded-none print:shadow-none"
        style={{ background: program.design.bg, color: program.design.fg }}
      >
        <div>
          <div className="text-sm font-medium opacity-80">{merchant.name}</div>
          <h2 className="mt-3 text-3xl font-bold leading-snug">{t(lang, "poster.headline")}</h2>
          <p className="mt-3 text-lg font-semibold" style={{ color: program.design.accent }}>
            {program.design.icon} {t(lang, "poster.sub", { n: program.stampsRequired, reward: program.rewardDescription })}
          </p>
        </div>
        <div className="w-3/4 rounded-3xl bg-white p-4 shadow-lg" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="text-sm opacity-80">{t(lang, "poster.noApp")}</p>
      </div>
    </>
  );
}
