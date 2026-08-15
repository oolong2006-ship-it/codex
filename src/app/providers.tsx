"use client";

import { SessionProvider } from "next-auth/react";
import { LangProvider } from "@/lib/i18n/context";
import type { Lang } from "@/lib/i18n/dictionaries";

export function Providers({
  initialLang,
  children,
}: {
  initialLang: Lang;
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <LangProvider initialLang={initialLang}>{children}</LangProvider>
    </SessionProvider>
  );
}
