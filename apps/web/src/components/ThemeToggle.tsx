'use client';

import { useEffect, useState } from 'react';
import { effectiveTheme, toggleTheme, setTheme, Theme } from '@/lib/theme';
import { Icon } from '@/components/ui/Icon';

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const t = effectiveTheme();
    setTheme(t);
    setThemeState(t);
  }, []);

  function onToggle() {
    setThemeState(toggleTheme());
  }

  return (
    <button
      onClick={onToggle}
      aria-label="Toggle theme"
      className="grid h-9 w-9 place-items-center rounded-sm border border-border bg-surface text-text-dim transition hover:bg-surface-2"
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
    </button>
  );
}
