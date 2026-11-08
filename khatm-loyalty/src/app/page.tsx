import Link from "next/link";
import { getLang } from "@/server/web";
import { t } from "@/lib/i18n";
import { Logo } from "@/components/logo";
import { LangToggle } from "@/components/lang-toggle";
import { CardFace } from "@/components/card-face";

export default async function Landing() {
  const lang = await getLang();
  const features = ["f1", "f2", "f3", "f4"] as const;
  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <Logo label={t(lang, "brand.name")} />
        <nav className="flex items-center gap-1 sm:gap-2">
          <LangToggle lang={lang} />
          <Link href="/pos" className="hidden rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-cream-200 sm:inline-flex">
            {t(lang, "landing.staff")}
          </Link>
          <Link href="/login" className="btn-ghost">
            {t(lang, "landing.login")}
          </Link>
        </nav>
      </header>

      <section className="grid items-center gap-10 pt-8 md:grid-cols-[1.15fr_1fr] md:pt-16">
        <div>
          <h1 className="text-4xl font-bold leading-[1.25] tracking-tight text-espresso-900 sm:text-5xl">{t(lang, "landing.hero")}</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-espresso-700">{t(lang, "landing.sub")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-accent px-6 py-3 text-base">
              {t(lang, "landing.cta")}
            </Link>
            <Link href="/login" className="btn-ghost px-6 py-3 text-base">
              {t(lang, "landing.login")}
            </Link>
          </div>
        </div>
        <div className="relative flex justify-center">
          <div className="absolute inset-x-8 top-10 -z-10 h-64 rounded-full bg-saffron-400/25 blur-3xl" />
          <div className="w-full max-w-sm -rotate-2">
            <CardFace
              lang={lang}
              merchantName={lang === "ar" ? "محمصة الرياض" : "Riyadh Roasters"}
              programName={lang === "ar" ? "بطاقة القهوة" : "Coffee card"}
              rewardDescription={lang === "ar" ? "مشروب مجاني بأي حجم" : "A free drink, any size"}
              stampsRequired={10}
              currentStamps={7}
              rewardsAvailable={0}
              customerName={lang === "ar" ? "سارة" : "Sara"}
              design={{ bg: "#3B2418", fg: "#FFF7ED", accent: "#F59E0B", icon: "☕" }}
            />
          </div>
        </div>
      </section>

      <section className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <div key={f} className="card p-5">
            <h2 className="font-semibold">{t(lang, `landing.${f}.title`)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-espresso-700">{t(lang, `landing.${f}.body`)}</p>
          </div>
        ))}
      </section>

      <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-cream-300 pt-6 text-sm text-espresso-500">
        <span>© {new Date().getFullYear()} {t(lang, "brand.name")}</span>
        <Link href="/privacy" className="hover:underline">
          {t(lang, "privacy.title")}
        </Link>
      </footer>
    </main>
  );
}
