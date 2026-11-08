import { getLang } from "@/server/web";
import { t } from "@/lib/i18n";

export default async function Deleted() {
  const lang = await getLang();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-4 text-center">
      <div className="card p-8"><p className="text-lg font-semibold">✓ {t(lang, "card.deletedTitle")}</p></div>
    </main>
  );
}
