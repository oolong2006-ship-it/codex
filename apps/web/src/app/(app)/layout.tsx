'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken, getUser, clearSession, AuthUser } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useLang } from '@/lib/lang-context';
import { LangToggle } from '@/components/LangToggle';

const NAV: { href: string; key: Parameters<typeof t>[0]; icon: string }[] = [
  { href: '/dashboard', key: 'dashboard', icon: '▦' },
  { href: '/crowd', key: 'crowd', icon: '👥' },
  { href: '/queues', key: 'queues', icon: '⧗' },
  { href: '/alerts', key: 'alerts', icon: '⚠' },
  { href: '/simulation', key: 'simulation', icon: '⚙' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setUser(getUser());
  }, [router]);

  function logout() {
    clearSession();
    router.replace('/login');
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-e border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-masar-700 dark:text-masar-300">
            {t('appName', lang)}
          </h1>
          <p className="text-xs text-slate-500">{t('tagline', lang)}</p>
        </div>
        <nav className="space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'bg-masar-600 text-white'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                {t(item.key, lang)}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-sm text-slate-500">
            {lang === 'ar' ? user.arabicName || user.fullName : user.fullName}
            <span className="mx-2 rounded bg-masar-50 px-2 py-0.5 text-xs text-masar-700 dark:bg-masar-900 dark:text-masar-300">
              {user.roles.join(', ')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <LangToggle />
            <button
              onClick={logout}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {t('logout', lang)}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
