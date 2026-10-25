import type { Metadata, Viewport } from 'next';
import { Noto_Kufi_Arabic, Noto_Sans_Arabic } from 'next/font/google';
import { BRAND } from '@/lib/brand';
import './globals.css';
import { Providers } from './providers';
import { withBase } from '@/lib/paths';

// Brand Kit typography: Noto Kufi Arabic for headings, Noto Sans Arabic for the interface.
const display = Noto_Kufi_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['300', '500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const sans = Noto_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'شؤون | منصة شؤون لإدارة الموارد البشرية', template: '%s | شؤون' },
  description: 'كل شؤون موظفيك، في مكان واحد. شؤون منصة سعودية للموارد البشرية والرواتب والحضور مصممة للمنشآت متعددة الفروع: رواتب وحماية أجور، حضور بالموقع، إجازات، سعودة، وتطبيق خدمة ذاتية للموظف.',
  manifest: withBase('/manifest.webmanifest'),
};

export const viewport: Viewport = { themeColor: BRAND.night, width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
