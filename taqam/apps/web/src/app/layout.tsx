import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const plex = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-plex',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'طاقم | منصة الموارد البشرية والرواتب للمنشآت متعددة الفروع', template: '%s | طاقم' },
  description: 'طاقم منصة سعودية للموارد البشرية والرواتب والحضور مصممة للمنشآت متعددة الفروع: رواتب وحماية أجور، حضور بالموقع، إجازات، سعودة، وتطبيق خدمة ذاتية للموظف.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = { themeColor: '#0F3D3E', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={plex.variable}>
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
