import { notFound } from "next/navigation";
import Link from "next/link";
import { passViewBySerial } from "@/server/wallet/pass-view";
import { wallet } from "@/server/wallet";
import { safeEqual } from "@/server/domain/customers";
import { qrSvg } from "@/server/qr";
import { getLang } from "@/server/web";
import { t } from "@/lib/i18n";
import { CardFace } from "@/components/card-face";
import { LangToggle } from "@/components/lang-toggle";
import { DeleteMyData } from "./delete-form";

export const metadata = { title: "Card", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function WebCard({ params, searchParams }: { params: Promise<{ serial: string }>; searchParams: Promise<{ k?: string; new?: string }> }) {
  const { serial } = await params;
  const { k = "", new: isNew } = await searchParams;
  const view = /^[A-Z0-9]{8,40}$/.test(serial) ? await passViewBySerial(serial) : null;
  if (!view || !k || !safeEqual(view.authToken, k) || view.status === "VOID") notFound();
  const lang = await getLang();
  const w = wallet();
  const qs = `k=${encodeURIComponent(k)}`;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center px-4 pb-10 pt-3">
      <div className="flex w-full justify-end"><LangToggle lang={lang} /></div>
      <h1 className="sr-only">{t(lang, "card.webCard")}</h1>
      <div className="mt-2 w-full">
        <CardFace
          lang={lang}
          merchantName={view.merchantName}
          programName={view.programName}
          rewardDescription={view.rewardDescription}
          stampsRequired={view.stampsRequired}
          currentStamps={view.currentStamps}
          rewardsAvailable={view.rewardsAvailable}
          customerName={view.customerName}
          design={view.design}
          qrSvg={await qrSvg(view.barcode)}
          altText={view.serial.slice(-6)}
        />
      </div>
      <div className="mt-6 grid w-full gap-3">
        {w.appleAvailable() && (
          <a href={`/api/wallet/apple/pass/${view.serial}?${qs}`} className="btn w-full bg-black py-3.5 text-base text-white hover:bg-neutral-800"> {t(lang, "card.addApple")}</a>
        )}
        {w.googleAvailable() && (
          <a href={`/api/wallet/google/${view.serial}?${qs}`} className="btn w-full border border-neutral-300 bg-white py-3.5 text-base text-neutral-900 hover:bg-neutral-50">{t(lang, "card.addGoogle")}</a>
        )}
        {!w.appleAvailable() && !w.googleAvailable() && <p className="rounded-xl bg-cream-200 px-4 py-3 text-center text-sm text-espresso-700">{t(lang, "card.mockNotice")}</p>}
        {isNew && <p className="text-center text-xs text-espresso-500">{t(lang, "card.bookmark")}</p>}
      </div>
      {view.terms && (
        <details className="mt-6 w-full rounded-xl bg-cream-50 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">{t(lang, "card.terms")}</summary>
          <p className="mt-2 whitespace-pre-wrap text-espresso-700">{view.terms}</p>
        </details>
      )}
      <div className="mt-auto flex w-full items-center justify-between pt-10">
        <Link href="/privacy" className="text-xs text-espresso-500 hover:underline">{t(lang, "privacy.title")}</Link>
        <DeleteMyData serial={view.serial} k={k} label={t(lang, "card.deleteMyData")} confirm={t(lang, "card.deleteMyDataConfirm")} />
      </div>
    </main>
  );
}
