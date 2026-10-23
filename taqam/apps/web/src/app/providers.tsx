'use client';
import { AuthProvider } from '@/lib/auth';
import { LangProvider } from '@/lib/i18n';
import { ToastProvider } from '@/components/ui/Toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LangProvider>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </LangProvider>
  );
}
