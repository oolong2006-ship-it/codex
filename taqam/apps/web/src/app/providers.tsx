'use client';
import { AuthProvider } from '@/lib/auth';
import { LangProvider } from '@/lib/i18n';
import { ToastProvider } from '@/components/ui/Toast';
import { IS_DEMO } from '@/lib/paths';
import { DemoBanner } from '@/demo/DemoBanner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LangProvider>
      <AuthProvider>
        <ToastProvider>{children}{IS_DEMO && <DemoBanner />}</ToastProvider>
      </AuthProvider>
    </LangProvider>
  );
}
