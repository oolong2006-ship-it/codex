import type { Metadata, Viewport } from 'next';
import { EssShell } from '@/components/ess/EssShell';
import { SuperAdminRedirect } from '@/components/admin/SuperAdminRedirect';

export const metadata: Metadata = {
  title: 'الخدمة الذاتية',
  appleWebApp: { capable: true, title: 'شؤون', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = { themeColor: '#0C1F24', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function MeLayout({ children }: { children: React.ReactNode }) {
  return <SuperAdminRedirect><EssShell>{children}</EssShell></SuperAdminRedirect>;
}
