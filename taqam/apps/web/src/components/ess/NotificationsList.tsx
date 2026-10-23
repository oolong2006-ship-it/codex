'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date as fmtDate, time as fmtTime } from '@/lib/format';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { ListSkeleton } from './primitives';
import { asArray, type Notification } from './types';

/** Only follow links that belong to the self-service app (others are dashboard routes). */
function essLink(link?: string | null) {
  if (!link) return null;
  return link.startsWith('/me') ? link : null;
}

export function NotificationsList({ limit }: { limit?: number }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const { data, setData, loading, error, reload } = useFetch(() => api.get<unknown>('/notifications'), []);
  const all = asArray<Notification>(data);
  const items = limit ? all.slice(0, limit) : all;
  const unread = all.filter((n) => !n.readAt).length;

  const markRead = async (n: Notification) => {
    if (n.readAt) return;
    setData(all.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    api.post(`/notifications/${n.id}/read`).catch(() => {});
  };
  const readAll = async () => {
    try {
      await api.post('/notifications/read-all');
      setData(all.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    } catch (e) { toast(e instanceof ApiError ? e.display : String(e), 'error'); }
  };

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <ListSkeleton rows={3} />;
  if (!items.length) return <div className="rounded-3xl border border-line bg-white"><EmptyState title={t('لا توجد إشعارات', 'No notifications')} /></div>;

  return (
    <div className="space-y-2">
      {unread > 0 && (
        <div className="flex justify-end">
          <button onClick={readAll} className="flex h-9 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-primary-500"><CheckCheck className="h-4 w-4" />{t('تحديد الكل كمقروء', 'Mark all read')}</button>
        </div>
      )}
      <ul className="overflow-hidden rounded-3xl border border-line bg-white shadow-soft">
        {items.map((n) => {
          const href = essLink(n.link);
          const body = (
            <div className={clsx('flex gap-3 px-4 py-3.5', !n.readAt && 'bg-accent-50/60')}>
              <div className={clsx('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl', n.readAt ? 'bg-sand text-ink-soft' : 'bg-accent-100 text-accent-600')}><Bell className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className={clsx('text-sm', n.readAt ? 'text-ink' : 'font-semibold text-ink')}>{n.title}</p>
                  {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
                </div>
                {n.body && <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-muted">{n.body}</p>}
                <p className="num mt-1 text-[11px] text-ink-soft">{fmtDate(n.createdAt, lang)} · {fmtTime(n.createdAt)}</p>
              </div>
            </div>
          );
          return (
            <li key={n.id} className="border-b border-line/70 last:border-0">
              {href ? <Link href={href} onClick={() => markRead(n)} className="block">{body}</Link>
                : <button onClick={() => markRead(n)} className="block w-full text-start">{body}</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
