'use client';

import { useLang } from '@/lib/lang-context';
import { Icon } from '@/components/ui/Icon';

export function LangToggle() {
  const { lang, toggle } = useLang();
  return (
    <button
      onClick={toggle}
      className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border bg-surface px-3 text-sm font-semibold text-text-dim transition hover:bg-surface-2"
      aria-label="Toggle language"
    >
      <Icon name="globe" size={16} />
      {lang === 'ar' ? 'EN' : 'ع'}
    </button>
  );
}
