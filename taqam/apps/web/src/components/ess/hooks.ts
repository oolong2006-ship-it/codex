'use client';
import { useEffect, useState } from 'react';

/**
 * Read a query param once on mount and strip it from the URL (used for deep links
 * like /me/leaves?new=1). Avoids useSearchParams so pages need no Suspense boundary.
 */
export function useConsumeParam(name: string) {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const v = url.searchParams.get(name);
    if (v !== null) {
      setValue(v);
      url.searchParams.delete(name);
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  }, [name]);
  return value;
}
