'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bell, CalendarDays, Clock4, Home, LayoutGrid, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { api } from '@/lib/api';
import { IS_DEMO, withBase } from '@/lib/paths';
import { Logo } from '@/components/ui/Logo';
import { Spinner } from '@/components/ui/States';
import { asArray, type Notification } from './types';
import { riyadhHour } from './utils';

const TABS = [
  { href: '/me', ar: 'الرئيسية', en: 'Home', icon: Home },
  { href: '/me/attendance', ar: 'الحضور', en: 'Attendance', icon: Clock4 },
  { href: '/me/leaves', ar: 'الإجازات', en: 'Leaves', icon: CalendarDays },
  { href: '/me/payslips', ar: 'الرواتب', en: 'Payslips', icon: Wallet },
  { href: '/me/more', ar: 'المزيد', en: 'More', icon: LayoutGrid },
];

// Scoped styles for the ESS app (globals.css is shared, so we keep ours here).
const ESS_CSS = `
.ess-sheet { animation: ess-up .28s cubic-bezier(.2,.8,.2,1); }
@keyframes ess-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
.ess-pulse { animation: ess-pulse 2.4s ease-out infinite; }
@keyframes ess-pulse { 0% { box-shadow: 0 0 0 0 rgba(242,165,65,.45); } 70% { box-shadow: 0 0 0 22px rgba(242,165,65,0); } 100% { box-shadow: 0 0 0 0 rgba(242,165,65,0); } }
.ess-scroll-x { scrollbar-width: none; } .ess-scroll-x::-webkit-scrollbar { display: none; }
@media print { html, body { background: #fff !important; } @page { size: A4; margin: 14mm; } }
`;

function isActive(pathname: string, href: string) {
  return href === '/me' ? pathname === '/me' : pathname === href || pathname.startsWith(`${href}/`);
}

export function EssShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useLang();
  const router = useRouter();
  const pathname = usePathname() || '/me';
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Unread notifications badge; refreshed on navigation.
  useEffect(() => {
    if (!user?.employeeId) return;
    let alive = true;
    api.get<unknown>('/notifications')
      .then((r) => { if (alive) setUnread(asArray<Notification>(r).filter((n) => !n.readAt).length); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user?.employeeId, pathname]);

  // Offline shell caching (production only, to keep dev HMR clean).
  useEffect(() => {
    // Not in the static demo: the worker's cache rules assume the app is served from the domain root.
    if (IS_DEMO || process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(withBase('/sw.js'), { scope: withBase('/') }).catch(() => {});
  }, []);

  if (loading || !user) {
    return (
      <Frame>
        <style>{ESS_CSS}</style>
        <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-primary">
          <Logo light className="scale-125" />
          <Spinner className="h-6 w-6 text-accent" />
        </div>
      </Frame>
    );
  }

  if (!user.employeeId) {
    return (
      <Frame>
        <style>{ESS_CSS}</style>
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
          <Logo />
          <h1 className="text-xl font-bold text-ink">{t('حسابك غير مرتبط بملف موظف', 'Your account is not linked to an employee')}</h1>
          <p className="text-sm text-ink-muted">{t('الخدمة الذاتية متاحة للموظفين فقط. يمكنك إدارة المنشأة من لوحة الشركة.', 'Self-service is for employees. You can manage the company from the dashboard.')}</p>
          <Link href="/app" className="flex h-12 items-center rounded-2xl bg-primary px-6 font-semibold text-white">{t('الانتقال إلى لوحة الشركة', 'Go to dashboard')}</Link>
        </div>
      </Frame>
    );
  }

  const firstName = user.name.trim().split(/\s+/)[0];
  const hour = riyadhHour();
  const greeting = hour < 12 ? t('صباح الخير', 'Good morning') : t('مساء الخير', 'Good evening');

  return (
    <Frame>
      <style>{ESS_CSS}</style>
      {/* Top app bar */}
      <header className="sticky top-0 z-30 bg-primary pt-[env(safe-area-inset-top)] text-white print:hidden">
        <div className="flex h-16 items-center gap-3 px-4">
          <Link href="/me/more" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-lg font-bold text-accent" aria-label={t('حسابي', 'My account')}>
            {firstName.slice(0, 1)}
          </Link>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[15px] font-semibold">{greeting}، {firstName}</p>
            <p className="truncate text-xs text-white/65">{user.company?.nameAr ?? ''}</p>
          </div>
          <Link href="/me/notifications" className="relative grid h-11 w-11 place-items-center rounded-2xl bg-white/10 transition active:scale-95" aria-label={t('الإشعارات', 'Notifications')}>
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="num absolute -top-0.5 end-0 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-primary ring-2 ring-primary">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-4 print:p-0">{children}</main>

      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[440px] border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden">
        <ul className="grid grid-cols-5">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <Link href={tab.href} className={clsx('flex h-[64px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors', active ? 'text-primary' : 'text-ink-soft')}
                  aria-current={active ? 'page' : undefined}>
                  <span className={clsx('grid h-8 w-14 place-items-center rounded-full transition-colors', active && 'bg-accent-100')}>
                    <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.8} />
                  </span>
                  {t(tab.ar, tab.en)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </Frame>
  );
}

/** Phone-width column on desktop, full-bleed on mobile. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-sand-200/70 print:bg-white">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-sand shadow-[0_0_40px_rgba(15,61,62,0.08)] print:max-w-none print:bg-white print:shadow-none">
        {children}
      </div>
    </div>
  );
}
