import Link from "next/link";
import { Logo } from "./logo";
import { LangToggle } from "./lang-toggle";
import { t, type Lang } from "@/lib/i18n";

type Photo = "pay" | "barista" | "interior" | "lattes";

const CAPTIONS: Record<Photo, { ar: string; en: string }> = {
  pay: { ar: "عميلك يرجع لك، كل مرة.", en: "Bring customers back, every time." },
  barista: { ar: "ختم واحد بلمسة، والبطاقة تتحدّث فوراً.", en: "One tap to stamp. The card updates instantly." },
  interior: { ar: "كل فروعك في بطاقة واحدة.", en: "All your branches on one card." },
  lattes: { ar: "مكافأة يحبها عملاؤك المعتادون.", en: "A reward your regulars love." },
};

/** Split sign-in layout: form on one side, café photography with a floating product card on the other. */
export function AuthShell({ lang, title, children, photo = "pay" }: { lang: Lang; title: string; children: React.ReactNode; photo?: Photo }) {
  return (
    <main className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/">
            <Logo label={t(lang, "brand.name")} />
          </Link>
          <LangToggle lang={lang} />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="mb-8 text-3xl font-bold leading-snug sm:text-4xl">{title}</h1>
          {children}
        </div>
      </div>
      <aside className="relative hidden overflow-hidden lg:block" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/img/${photo}.webp`} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-espresso-900/85 via-espresso-900/20 to-transparent" />
        <div className="absolute inset-x-10 bottom-10 flex flex-col gap-5">
          <div className="w-72 rounded-3xl bg-gradient-to-br from-grape-500 to-grape-700 p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-[family-name:var(--font-display)] font-bold">{lang === "ar" ? "مقهى الحيّ" : "Corner Café"}</div>
                <div className="text-xs opacity-80">{lang === "ar" ? "بطاقة القهوة" : "Coffee card"}</div>
              </div>
              <div className="font-[family-name:var(--font-display)] text-2xl font-bold">7 <span className="text-sm opacity-75">/ 10</span></div>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-1.5">
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className={`flex aspect-square items-center justify-center rounded-full text-xs ${i < 7 ? "bg-sun-400" : "border-2 border-dashed border-white/40"}`}>
                  {i < 7 ? "☕" : ""}
                </div>
              ))}
            </div>
          </div>
          <p className="max-w-md font-[family-name:var(--font-display)] text-3xl font-bold leading-snug text-white">{CAPTIONS[photo][lang]}</p>
        </div>
      </aside>
    </main>
  );
}
