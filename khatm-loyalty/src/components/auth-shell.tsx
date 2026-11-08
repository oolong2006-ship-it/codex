import Link from "next/link";
import { Logo } from "./logo";
import { LangToggle } from "./lang-toggle";
import { t, type Lang } from "@/lib/i18n";

export function AuthShell({ lang, title, children }: { lang: Lang; title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Logo label={t(lang, "brand.name")} />
        </Link>
        <LangToggle lang={lang} />
      </div>
      <div className="card mt-10 p-6 sm:p-8">
        <h1 className="mb-6 text-2xl font-bold">{title}</h1>
        {children}
      </div>
    </main>
  );
}
