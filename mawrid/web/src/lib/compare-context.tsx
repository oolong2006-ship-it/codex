"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MAX_COMPARE } from "./constants";

interface CompareState {
  ids: string[];
  has: (id: string) => boolean;
  /** يعيد false إذا امتلأت قائمة المقارنة */
  toggle: (id: string) => boolean;
  remove: (id: string) => void;
  clear: () => void;
}

const Ctx = createContext<CompareState | null>(null);
const KEY = "mawrid-compare";

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(saved)) setIds(saved.filter((x) => typeof x === "string").slice(0, MAX_COMPARE));
    } catch { /* التخزين غير متاح */ }
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* تجاهل */ }
  }, [ids]);

  const toggle = useCallback((id: string) => {
    let ok = true;
    setIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_COMPARE) { ok = false; return cur; }
      return [...cur, id];
    });
    return ok;
  }, []);

  const value = useMemo<CompareState>(() => ({
    ids,
    has: (id) => ids.includes(id),
    toggle,
    remove: (id) => setIds((cur) => cur.filter((x) => x !== id)),
    clear: () => setIds([]),
  }), [ids, toggle]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCompare() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCompare must be used within CompareProvider");
  return c;
}
