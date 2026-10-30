'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken, getUser, clearSession, AuthUser, api } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useLang } from '@/lib/lang-context';
import { LangToggle } from '@/components/LangToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NAV_ITEMS } from '@/lib/nav';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/lib/format';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setUser(getUser());
  }, [router]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = () =>
      api
        .alerts()
        .then((a) => alive && setAlertCount(a.filter((x) => x.status !== 'RESOLVED').length))
        .catch(() => undefined);
    load();
    const id = setInterval(load, 6000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [user]);

  function logout() {
    clearSession();
    router.replace('/login');
  }

  if (!user) return null;

  const brand = (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-sm" style={{ background: 'var(--header-grad)' }}>
        <Icon name="map" size={19} style={{ color: '#fff' }} />
      </span>
      <div className="leading-tight">
        <div className="text-md font-extrabold text-accent-2">{t('appName', lang)}</div>
        <div className="text-xs text-text-faint">{t('controlRoom', lang)}</div>
      </div>
    </div>
  );

  function navLink(item: (typeof NAV_ITEMS)[number], variant: 'side' | 'tab') {
    const active = pathname === item.href;
    const badge = item.key === 'alerts' && alertCount > 0;
    if (variant === 'tab') {
      return (
        <Link
          key={item.href}
          href={item.href}
          className={cx(
            'relative grid justify-items-center gap-0.5 rounded-sm py-1.5 text-[10px] font-semibold',
            active ? 'text-accent' : 'text-text-dim',
          )}
        >
          <Icon name={item.icon} size={21} />
          {t(item.key, lang)}
          {badge && (
            <span
              className="absolute top-0 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white"
              style={{ insetInlineEnd: '18px' }}
            >
              {alertCount}
            </span>
          )}
        </Link>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cx(
          'flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-semibold transition',
          active
            ? 'bg-accent text-accent-contrast'
            : 'text-text-dim hover:bg-surface-2 hover:text-text',
        )}
      >
        <Icon name={item.icon} size={19} />
        <span className="flex-1">{t(item.key, lang)}</span>
        {badge && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {alertCount}
          </span>
        )}
      </Link>
    );
  }

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-e border-border bg-surface p-4 md:flex">
        <div className="mb-6">{brand}</div>
        <nav className="flex flex-col gap-1">{NAV_ITEMS.map((i) => navLink(i, 'side'))}</nav>
        <div className="mt-auto rounded-sm border border-border bg-surface-2 p-3 text-xs text-text-dim">
          <div className="font-bold text-text">{lang === 'ar' ? user.arabicName || user.fullName : user.fullName}</div>
          <div className="mt-0.5">{user.roles.join(', ')}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 py-2.5 backdrop-blur md:px-6">
          <div className="md:hidden">{brand}</div>
          <div className="hidden text-sm text-text-dim md:block">
            {lang === 'ar' ? user.arabicName || user.fullName : user.fullName}
            <span className="mx-2 rounded-sm bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-2">
              {user.roles.join(', ')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
            <button
              onClick={logout}
              aria-label={t('logout', lang)}
              className="grid h-9 w-9 place-items-center rounded-sm border border-border bg-surface text-text-dim transition hover:bg-surface-2"
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden p-4 pb-24 md:p-6 md:pb-6">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-border bg-surface/95 px-1 py-1.5 backdrop-blur md:hidden">
        {NAV_ITEMS.map((i) => navLink(i, 'tab'))}
      </nav>
    </div>
  );
}
