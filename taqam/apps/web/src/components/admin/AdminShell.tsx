'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, Building2, ChevronDown, Languages, LayoutDashboard, LogOut, Megaphone, Menu, Settings, ShieldCheck, UserPlus, X, type LucideIcon,
} from 'lucide-react';
import { Logo, PageLoader } from '@/components/ui';
import { Avatar } from '@/components/app/primitives';
import { api, type Paginated } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { clearAdminToken } from './ImpersonationBanner';

interface Item { href: string; label: [string, string]; icon: LucideIcon; exact?: boolean; badge?: 'pending' | 'leads' }
const NAV: Item[] = [
  { href: '/admin', label: ['نظرة عامة', 'Overview'], icon: LayoutDashboard, exact: true },
  { href: '/admin/companies', label: ['المنشآت', 'Companies'], icon: Building2, badge: 'pending' },
  { href: '/admin/leads', label: ['العملاء المحتملون', 'Leads'], icon: UserPlus, badge: 'leads' },
  { href: '/admin/activity', label: ['سجل النشاط', 'Activity log'], icon: Activity },
  { href: '/admin/broadcast', label: ['تعميم للمنشآت', 'Broadcast'], icon: Megaphone },
  { href: '/admin/settings', label: ['الإعدادات', 'Settings'], icon: Settings },
];
const isActive = (i: Item, p: string) => (i.exact ? p === i.href : p === i.href || p.startsWith(`${i.href}/`));

/** Fired by pages after an action that changes the sidebar counters. */
export const ADMIN_COUNTS_EVENT = 'taqam:admin-counts';
export function refreshAdminCounts() { if (typeof window !== 'undefined') window.dispatchEvent(new Event(ADMIN_COUNTS_EVENT)); }

function useCounts(enabled: boolean) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<{ pending: number; leads: number }>({ pending: 0, leads: 0 });
  const load = useCallback(async () => {
    if (!enabled) return;
    const [p, l] = await Promise.allSettled([
      api.get<Paginated<unknown>>('/admin/companies', { status: 'PENDING', pageSize: 1 }),
      api.get<Paginated<unknown>>('/admin/leads', { status: 'NEW', pageSize: 1 }),
    ]);
    setCounts({ pending: p.status === 'fulfilled' ? p.value.total : 0, leads: l.status === 'fulfilled' ? l.value.total : 0 });
  }, [enabled]);
  useEffect(() => { void load(); }, [load, pathname]);
  useEffect(() => {
    const h = () => void load();
    window.addEventListener(ADMIN_COUNTS_EVENT, h);
    return () => window.removeEventListener(ADMIN_COUNTS_EVENT, h);
  }, [load]);
  return counts;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const ok = !loading && user?.role === 'SUPER_ADMIN';
  const counts = useCounts(ok);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (user.role !== 'SUPER_ADMIN') router.replace(homeFor(user));
    else clearAdminToken(); // back in the portal: any impersonation is over
  }, [user, loading, router, pathname]);
  useEffect(() => { setDrawer(false); }, [pathname]);

  if (!ok) return <div className="min-h-screen bg-sand"><PageLoader /></div>;

  return (
    <div className="min-h-screen bg-sand">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col bg-[#172C46] lg:flex">
        <Sidebar counts={counts} />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[#172C46]/50 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-[#172C46] shadow-lift">
            <Sidebar counts={counts} onClose={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <div className="lg:ps-64">
        <Topbar onMenu={() => setDrawer(true)} />
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({ counts, onClose }: { counts: { pending: number; leads: number }; onClose?: () => void }) {
  const { t, lang } = useLang();
  const pathname = usePathname();
  return (
    <>
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
        <Link href="/admin" className="flex items-center gap-2"><Logo light /></Link>
        {onClose && <button onClick={onClose} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10" aria-label="close"><X className="h-5 w-5" /></button>}
      </div>
      <div className="mx-4 mt-4 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
        <ShieldCheck className="h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold text-white">بوابة المنصة</p>
          <p className="text-[11px] tracking-wide text-white/50">Platform</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV.map((i) => {
            const active = isActive(i, pathname);
            const Icon = i.icon;
            const n = i.badge === 'pending' ? counts.pending : i.badge === 'leads' ? counts.leads : 0;
            return (
              <li key={i.href}>
                <Link href={i.href}
                  className={clsx('group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    active ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white')}>
                  <Icon className={clsx('h-[18px] w-[18px] shrink-0', active ? 'text-accent' : 'text-white/40 group-hover:text-white/80')} />
                  <span className="flex-1 truncate">{lang === 'ar' ? i.label[0] : i.label[1]}</span>
                  {n > 0 && (
                    <span className={clsx('num min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold',
                      i.badge === 'pending' ? 'bg-warning text-[#172C46]' : 'bg-accent text-[#172C46]')}
                      title={i.badge === 'pending' ? t('بانتظار الموافقة', 'Pending approval') : t('عملاء جدد', 'New leads')}>{n}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <p className="border-t border-white/10 px-5 py-3 text-[11px] text-white/35">{t('للاستخدام الداخلي لفريق شؤون', 'Internal — Shuoon team only')}</p>
    </>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { lang, setLang, t } = useLang();
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button onClick={onMenu} className="rounded-lg p-2 text-ink-muted hover:bg-sand lg:hidden" aria-label="menu"><Menu className="h-5 w-5" /></button>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#172C46] px-2.5 py-1 text-[11px] font-semibold text-white">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" />{t('بوابة المنصة', 'Platform portal')}
        </span>
      </div>
      <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} title={t('English', 'العربية')}
        className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-ink-muted hover:bg-sand hover:text-primary">
        <Languages className="h-[18px] w-[18px]" /><span className="hidden sm:inline">{lang === 'ar' ? 'EN' : 'ع'}</span>
      </button>
      <UserMenu />
    </header>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  if (!user) return null;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl p-1 hover:bg-sand sm:pe-2">
        <Avatar name={user.name} color="#172C46" size="sm" />
        <span className="hidden text-start leading-tight sm:block">
          <span className="block max-w-[140px] truncate text-sm font-medium text-ink">{user.name}</span>
          <span className="block text-[11px] text-ink-soft">{t('مدير المنصة', 'Super admin')}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-ink-soft sm:block" />
      </button>
      {open && (
        <div className="absolute end-0 top-12 z-30 w-60 overflow-hidden rounded-2xl border border-line bg-white py-1 shadow-lift">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-soft" dir="ltr">{user.email}</p>
          </div>
          <Link href="/admin/settings" onClick={() => setOpen(false)} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-ink hover:bg-sand">
            <Settings className="h-4 w-4 text-ink-soft" />{t('الإعدادات', 'Settings')}
          </Link>
          <button onClick={logout} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-danger hover:bg-sand"><LogOut className="h-4 w-4" />{t('تسجيل الخروج', 'Log out')}</button>
        </div>
      )}
    </div>
  );
}
