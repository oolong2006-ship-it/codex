"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { translate, type DictKey, type Lang } from "./dictionaries";

interface LangContextValue {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: DictKey) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({
  initialLang = "en",
  children,
}: {
  initialLang?: Lang;
  children: React.ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const apply = useCallback((l: Lang) => {
    const dir = l === "ar" ? "rtl" : "ltr";
    if (typeof document !== "undefined") {
      document.documentElement.lang = l;
      document.documentElement.dir = dir;
      document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
    }
  }, []);

  useEffect(() => {
    apply(lang);
  }, [lang, apply]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const toggle = useCallback(
    () => setLangState((prev) => (prev === "en" ? "ar" : "en")),
    [],
  );
  const t = useCallback((key: DictKey) => translate(lang, key), [lang]);

  return (
    <LangContext.Provider
      value={{ lang, dir: lang === "ar" ? "rtl" : "ltr", setLang, toggle, t }}
    >
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}
