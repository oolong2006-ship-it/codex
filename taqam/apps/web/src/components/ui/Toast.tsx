'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import clsx from 'clsx';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; message: string }
const Ctx = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, message }]);
    setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), 3500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <div key={i.id} className={clsx('pointer-events-auto rounded-xl px-4 py-3 text-sm text-white shadow-lift',
            i.kind === 'success' && 'bg-primary', i.kind === 'error' && 'bg-danger', i.kind === 'info' && 'bg-info')}>
            {i.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
/** const toast = useToast(); toast('تم الحفظ'); toast(err.display, 'error') */
export const useToast = () => useContext(Ctx);
