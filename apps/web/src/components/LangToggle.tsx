'use client';

import { useLang } from '@/lib/lang-context';

export function LangToggle() {
  const { lang, toggle } = useLang();
  return (
    <button
      onClick={toggle}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      aria-label="Toggle language"
    >
      {lang === 'ar' ? 'English' : 'العربية'}
    </button>
  );
}
