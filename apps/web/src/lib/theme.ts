export type Theme = 'light' | 'dark';

const KEY = 'masar_theme';

/** Reads the persisted theme, if any (null = follow system). */
export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/** Applies a theme to <html> and persists it. */
export function setTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

/** Current effective theme (stored, else system preference). */
export function effectiveTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/** Toggles light <-> dark and persists. Returns the new theme. */
export function toggleTheme(): Theme {
  const next: Theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
