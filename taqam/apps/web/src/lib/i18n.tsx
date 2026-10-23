'use client';
import { createContext, useContext, useEffect, useState } from 'react';

// Lightweight bilingual helper: write UI strings inline as t('عربي', 'English').
export type Lang = 'ar' | 'en';
interface LangCtx { lang: Lang; setLang: (l: Lang) => void; t: (ar: string, en: string) => string; dir: 'rtl' | 'ltr' }
const Ctx = createContext<LangCtx>({ lang: 'ar', setLang: () => {}, t: (ar) => ar, dir: 'rtl' });
const KEY = 'taqam.lang';

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ar');
  useEffect(() => {
    try { const s = window.localStorage.getItem(KEY); if (s === 'en' || s === 'ar') setLangState(s); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);
  const setLang = (l: Lang) => { setLangState(l); try { window.localStorage.setItem(KEY, l); } catch { /* ignore */ } };
  const t = (ar: string, en: string) => (lang === 'ar' ? ar : en);
  return <Ctx.Provider value={{ lang, setLang, t, dir: lang === 'ar' ? 'rtl' : 'ltr' }}>{children}</Ctx.Provider>;
}
export const useLang = () => useContext(Ctx);
