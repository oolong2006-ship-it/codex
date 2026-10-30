import type { Metadata } from 'next';
import './globals.css';
import { LangProvider } from '@/lib/lang-context';

export const metadata: Metadata = {
  title: 'MASAR 34 | مسار 34',
  description: 'Smart crowd, queue and operations management platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Default document direction is RTL (Arabic default); the client LangProvider
  // updates <html dir/lang> on language change. The inline script applies the
  // stored/system theme before paint to avoid a flash.
  const themeScript = `(function(){try{var t=localStorage.getItem('masar_theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
  return (
    <html lang="ar" dir="rtl">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
