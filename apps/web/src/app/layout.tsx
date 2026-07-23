import type { Metadata } from 'next';
import './globals.css';
import { LangProvider } from '@/lib/lang-context';

export const metadata: Metadata = {
  title: 'MASAR 34 | مسار 34',
  description: 'Smart crowd, queue and operations management platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Default document direction is RTL (Arabic default); the client LangProvider
  // updates <html dir/lang> on language change.
  return (
    <html lang="ar" dir="rtl">
      <body>
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
