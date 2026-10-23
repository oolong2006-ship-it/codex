'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

/** const { data, loading, error, reload } = useFetch(() => api.get<X>('/x'), [dep]) */
export function useFetch<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fnRef.current()); }
    catch (e) { setError(e instanceof ApiError ? e.display : String(e)); }
    finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, deps);
  return { data, setData, loading, error, reload };
}
