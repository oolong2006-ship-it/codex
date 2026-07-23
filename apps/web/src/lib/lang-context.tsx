'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Lang, DEFAULT_LANG } from './i18n';

interface LangCtx {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang: (l: Lang) => void;
  toggle: () => void;
}

const Ctx = createContext<LangCtx>({
  lang: DEFAULT_LANG,
  dir: 'rtl',
  setLang: () => undefined,
  toggle: () => undefined,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem('masar_lang')) as Lang | null;
    if (saved === 'ar' || saved === 'en') setLangState(saved);
  }, []);

  useEffect(() => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
    if (typeof window !== 'undefined') localStorage.setItem('masar_lang', lang);
  }, [lang]);

  const setLang = (l: Lang) => setLangState(l);
  const toggle = () => setLangState((prev) => (prev === 'ar' ? 'en' : 'ar'));

  return (
    <Ctx.Provider value={{ lang, dir: lang === 'ar' ? 'rtl' : 'ltr', setLang, toggle }}>
      {children}
    </Ctx.Provider>
  );
}

export const useLang = () => useContext(Ctx);
