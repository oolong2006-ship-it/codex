'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell, ChevronDown, Languages, LogOut, Menu, PanelRightClose, PanelRightOpen, Smartphone, UserRound, X, CheckCheck, Search, Loader2,
} from 'lucide-react';
import { Logo } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { api, type Paginated } from '@/lib/api';
import { label, ROLE } from '@/lib/labels';
import type { AppNotification, Employee } from '@/lib/types';
import { NAV, isActive } from './nav';
import { Avatar } from './primitives';
import { employeeName } from './utils';
import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner';

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOut]);
}

const COLLAPSE_KEY = 'taqam.sidebar.collapsed';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  useEffect(() => { try { setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1'); } catch { /* ignore */ } }, []);
  useEffect(() => { setDrawer(false); }, [pathname]);
  const toggleCollapsed = () => setCollapsed((c) => { try { window.localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* ignore */ } return !c; });

  return (
    <div className="min-h-screen bg-sand">
      {/* Desktop sidebar */}
      <aside className={clsx('fixed inset-y-0 start-0 z-30 hidden flex-col border-e border-line bg-white transition-[width] duration-200 lg:flex', collapsed ? 'w-20' : 'w-64')}>
        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      </aside>
      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-primary/40 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-lift">
            <Sidebar onClose={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <div className={clsx('transition-[padding] duration-200', collapsed ? 'lg:ps-20' : 'lg:ps-64')}>
        <Topbar onMenu={() => setDrawer(true)} />
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({ collapsed, onToggle, onClose }: { collapsed?: boolean; onToggle?: () => void; onClose?: () => void }) {
  const { user } = useAuth();
  const { t, lang } = useLang();
  const pathname = usePathname();
  if (!user) return null;
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(user.role)) })).filter((g) => g.items.length);
  const company = user.company ? (lang === 'en' ? user.company.nameEn || user.company.nameAr : user.company.nameAr) : '';
  return (
    <>
      <div className={clsx('flex h-16 shrink-0 items-center border-b border-line', collapsed ? 'justify-center px-2' : 'justify-between px-5')}>
        <Link href="/app" className="flex items-center">{collapsed ? <Logo className="[&>span:last-child]:hidden" /> : <Logo />}</Link>
        {onClose && <button onClick={onClose} className="rounded-lg p-1.5 text-ink-muted hover:bg-sand" aria-label="close"><X className="h-5 w-5" /></button>}
      </div>
      {!collapsed && company && (
        <div className="mx-4 mt-4 rounded-xl bg-primary-50 px-3 py-2.5">
          <p className="text-[11px] text-ink-soft">{t('المنشأة', 'Company')}</p>
          <p className="truncate text-sm font-semibold text-primary">{company}</p>
        </div>
      )}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((g) => (
          <div key={g.label[0]} className="mb-4">
            {!collapsed && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{lang === 'ar' ? g.label[0] : g.label[1]}</p>}
            {collapsed && <div className="mx-auto mb-2 h-px w-8 bg-line" />}
            <ul className="space-y-0.5">
              {g.items.map((i) => {
                const active = isActive(i, pathname);
                const Icon = i.icon;
                const text = lang === 'ar' ? i.label[0] : i.label[1];
                return (
                  <li key={i.href}>
                    <Link href={i.href} title={collapsed ? text : undefined}
                      className={clsx('group flex items-center gap-3 rounded-xl py-2 text-sm font-medium transition-colors',
                        collapsed ? 'justify-center px-2' : 'px-3',
                        active ? 'bg-primary text-white shadow-soft' : 'text-ink-muted hover:bg-sand hover:text-primary')}>
                      <Icon className={clsx('h-[18px] w-[18px] shrink-0', active ? 'text-accent' : 'text-ink-soft group-hover:text-primary')} />
                      {!collapsed && <span className="truncate">{text}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      {onToggle && (
        <button onClick={onToggle} className="flex h-12 shrink-0 items-center justify-center gap-2 border-t border-line text-xs text-ink-muted hover:bg-sand hover:text-primary">
          {collapsed
            ? <PanelRightOpen className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
            : <><PanelRightClose className="h-4 w-4 ltr:rotate-180" />{t('طي القائمة', 'Collapse')}</>}
        </button>
      )}
    </>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user } = useAuth();
  const { lang, setLang, t } = useLang();
  const company = user?.company ? (lang === 'en' ? user.company.nameEn || user.company.nameAr : user.company.nameAr) : '';
  return (
    <div className="sticky top-0 z-20">
    <ImpersonationBanner />
    <header className="flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button onClick={onMenu} className="rounded-lg p-2 text-ink-muted hover:bg-sand lg:hidden" aria-label="menu"><Menu className="h-5 w-5" /></button>
      <div className="hidden min-w-0 md:block">
        <p className="truncate text-sm font-semibold text-ink">{company}</p>
      </div>
      <div className="flex min-w-0 flex-1 justify-center md:px-4"><GlobalSearch /></div>
      <div className="flex items-center gap-1">
        <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} title={t('English', 'العربية')}
          className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-ink-muted hover:bg-sand hover:text-primary">
          <Languages className="h-[18px] w-[18px]" /><span className="hidden sm:inline">{lang === 'ar' ? 'EN' : 'ع'}</span>
        </button>
        <NotificationsBell />
        <UserMenu />
      </div>
    </header>
    </div>
  );
}

function GlobalSearch() {
  const { t, lang } = useLang();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Employee[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    const h = setTimeout(async () => {
      try { setResults((await api.get<Paginated<Employee>>('/employees', { search: q.trim(), pageSize: 6 })).data); }
      catch { setResults([]); }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(h);
  }, [q]);
  const go = (id: string) => { setOpen(false); setQ(''); router.push(`/app/employees/${id}`); };
  return (
    <div ref={ref} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) go(results[0].id); if (e.key === 'Escape') setOpen(false); }}
        placeholder={t('ابحث عن موظف بالاسم أو الرقم…', 'Search employees…')}
        className="h-10 w-full rounded-xl border border-line bg-sand/60 pe-3 ps-9 text-sm placeholder:text-ink-soft focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100" />
      {open && q.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-12 z-30 overflow-hidden rounded-xl border border-line bg-white shadow-lift">
          {loading && <div className="flex items-center gap-2 px-4 py-3 text-sm text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" />{t('جارٍ البحث…', 'Searching…')}</div>}
          {!loading && !results.length && <div className="px-4 py-3 text-sm text-ink-muted">{t('لا نتائج', 'No results')}</div>}
          {!loading && results.map((e) => (
            <button key={e.id} onClick={() => go(e.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-primary-50">
              <Avatar name={employeeName(e, lang)} color={e.avatarColor} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{employeeName(e, lang)}</span>
                <span className="block truncate text-xs text-ink-soft">{e.jobTitle} · {e.branch?.nameAr ?? ''}</span>
              </span>
              <span className="num text-xs text-ink-soft">{e.employeeNumber}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string, lang: 'ar' | 'en') {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
  if (s < 60) return rtf.format(-Math.round(s), 'second');
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}
export { timeAgo };

function NotificationsBell() {
  const { t, lang } = useLang();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));
  const load = useCallback(async () => {
    try { setItems(await api.get<AppNotification[]>('/notifications')); } catch { /* silent */ } finally { setLoaded(true); }
  }, []);
  useEffect(() => { void load(); const h = setInterval(load, 60_000); return () => clearInterval(h); }, [load]);
  const unread = items.filter((n) => !n.readAt).length;
  const open1 = async (n: AppNotification) => {
    if (!n.readAt) {
      setItems((s) => s.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      api.post(`/notifications/${n.id}/read`).catch(() => {});
    }
    if (n.link) {
      setOpen(false);
      // API links are relative to the module ("/leaves"); dashboard routes live under /app, ESS under /me.
      const href = /^https?:\/\//.test(n.link) || n.link.startsWith('/app') || n.link.startsWith('/me') ? n.link : `/app${n.link.startsWith('/') ? '' : '/'}${n.link}`;
      if (/^https?:\/\//.test(href)) window.open(href, '_blank'); else router.push(href);
    }
  };
  const readAll = async () => {
    setItems((s) => s.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    api.post('/notifications/read-all').catch(() => {});
  };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-ink-muted hover:bg-sand hover:text-primary" aria-label={t('الإشعارات', 'Notifications')}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="num absolute -top-0.5 end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-16 z-30 overflow-hidden rounded-2xl border border-line bg-white shadow-lift sm:absolute sm:inset-x-auto sm:end-0 sm:top-12 sm:w-96">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold text-ink">{t('الإشعارات', 'Notifications')}</p>
            {unread > 0 && <button onClick={readAll} className="inline-flex items-center gap-1 text-xs font-medium text-primary-500 hover:underline"><CheckCheck className="h-3.5 w-3.5" />{t('تحديد الكل كمقروء', 'Mark all read')}</button>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {!loaded && <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-primary-500" /></div>}
            {loaded && !items.length && <p className="px-4 py-10 text-center text-sm text-ink-muted">{t('لا توجد إشعارات', 'No notifications')}</p>}
            {items.map((n) => (
              <button key={n.id} onClick={() => open1(n)} className={clsx('flex w-full gap-3 border-b border-line/60 px-4 py-3 text-start last:border-0 hover:bg-sand/60', !n.readAt && 'bg-accent-50/60')}>
                <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-accent')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{n.title}</span>
                  {n.body && <span className="mt-0.5 block text-xs text-ink-muted">{n.body}</span>}
                  <span className="mt-1 block text-[11px] text-ink-soft">{timeAgo(n.createdAt, lang)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));
  if (!user) return null;
  const item = 'flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-ink hover:bg-sand';
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl p-1 hover:bg-sand sm:pe-2">
        <Avatar name={user.name} size="sm" />
        <span className="hidden text-start leading-tight sm:block">
          <span className="block max-w-[140px] truncate text-sm font-medium text-ink">{user.name}</span>
          <span className="block text-[11px] text-ink-soft">{label(ROLE, user.role, lang)}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-ink-soft sm:block" />
      </button>
      {open && (
        <div className="absolute end-0 top-12 z-30 w-60 overflow-hidden rounded-2xl border border-line bg-white py-1 shadow-lift">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-soft" dir="ltr">{user.email}</p>
          </div>
          <Link href="/app/profile" onClick={() => setOpen(false)} className={item}><UserRound className="h-4 w-4 text-ink-soft" />{t('الملف الشخصي', 'Profile')}</Link>
          {user.employeeId && <Link href="/me" className={item}><Smartphone className="h-4 w-4 text-ink-soft" />{t('خدمتي الذاتية', 'My self-service')}</Link>}
          <button onClick={logout} className={clsx(item, 'text-danger')}><LogOut className="h-4 w-4" />{t('تسجيل الخروج', 'Log out')}</button>
        </div>
      )}
    </div>
  );
}
