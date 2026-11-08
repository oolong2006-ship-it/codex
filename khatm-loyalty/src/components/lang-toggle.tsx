import { toggleLang } from "@/app/actions";
import { t, type Lang } from "@/lib/i18n";

export function LangToggle({ lang, className = "" }: { lang: Lang; className?: string }) {
  return (
    <form action={toggleLang} className={className}>
      <button type="submit" className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-espresso-700 hover:bg-cream-200" lang={lang === "ar" ? "en" : "ar"}>
        {t(lang, "common.language")}
      </button>
    </form>
  );
}
