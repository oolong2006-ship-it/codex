"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3200);
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div role="status" aria-live="polite"
        className="pointer-events-none fixed inset-x-4 top-[calc(16px+env(safe-area-inset-top,0px))] z-50 flex justify-center">
        {msg && (
          <div className="max-w-[420px] rounded-[10px] bg-ink px-4 py-3 text-center text-bg shadow-lg">{msg}</div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
