import type { Metadata, Viewport } from 'next';
import { EssShell } from '@/components/ess/EssShell';

export const metadata: Metadata = {
  title: 'الخدمة الذاتية',
  appleWebApp: { capable: true, title: 'طاقم', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = { themeColor: '#0F3D3E', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function MeLayout({ children }: { children: React.ReactNode }) {
  return <EssShell>{children}</EssShell>;
}
