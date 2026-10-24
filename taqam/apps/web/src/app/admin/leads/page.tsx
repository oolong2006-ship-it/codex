'use client';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Mail, MessageSquareText, Phone, StickyNote, Users } from 'lucide-react';
import { Button, Card, EmptyState, Field, Modal, PageHeader, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Async, SearchInput } from '@/components/app/primitives';
import { errMsg } from '@/components/app/utils';
import { LeadStatusChip, timeAgo } from '@/components/admin/primitives';
import { refreshAdminCounts } from '@/components/admin/AdminShell';
import { api, type Paginated } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { useFetch } from '@/lib/useFetch';
import { date, num } from '@/lib/format';
import { label, SECTOR } from '@/lib/labels';
import { LEAD_STATUS, LEAD_STATUSES, lbl, type Lead, type LeadStatus } from '@/lib/adminTypes';

const COL_ACCENT: Record<LeadStatus, string> = { NEW: 'bg-accent', CONTACTED: 'bg-info', CONVERTED: 'bg-success', LOST: 'bg-ink-soft' };

export default function LeadsPage() {
  const { t, lang } = useLang();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const h = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(h); }, [search]);
  const { data, setData, loading, error, reload } = useFetch(() => api.get<Paginated<Lead>>('/admin/leads', { search: q || undefined, page: 1, pageSize: 200 }), [q]);
  const [open, setOpen] = useState<Lead | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const patchLocal = (l: Lead) => setData((d) => (d ? { ...d, data: d.data.map((x) => (x.id === l.id ? l : x)) } : d));
  const move = async (l: Lead, status: LeadStatus) => {
    setMoving(l.id);
    try {
      const r = await api.patch<Lead>(`/admin/leads/${l.id}`, { status });
      patchLocal(r); refreshAdminCounts();
      toast(t(`نُقل إلى «${lbl(LEAD_STATUS, status, 'ar')}»`, `Moved to “${lbl(LEAD_STATUS, status, 'en')}”`));
    } catch (e) { toast(errMsg(e), 'error'); } finally { setMoving(null); }
  };
  const leads = data?.data ?? [];

  return (
    <div>
      <PageHeader title={t('العملاء المحتملون', 'Leads')} subtitle={t('طلبات العرض والتواصل من الموقع', 'Demo & contact requests from the website')}
        actions={<SearchInput value={search} onChange={setSearch} placeholder={t('ابحث بالاسم أو المنشأة أو البريد…', 'Search name, company, email…')} className="w-full sm:w-72" />} />
      <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
        {data && !leads.length ? <Card><EmptyState title={q ? t('لا نتائج مطابقة', 'No matches') : t('لا يوجد عملاء محتملون بعد', 'No leads yet')} /></Card> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {LEAD_STATUSES.map((s) => {
              const items = leads.filter((l) => l.status === s);
              return (
                <section key={s} className="flex min-w-0 flex-col rounded-2xl border border-line bg-sand-200/40">
                  <header className="flex items-center gap-2 px-4 py-3">
                    <span className={clsx('h-2 w-2 rounded-full', COL_ACCENT[s])} />
                    <h2 className="text-sm font-semibold text-ink">{lbl(LEAD_STATUS, s, lang)}</h2>
                    <span className="num rounded-full bg-white px-2 text-xs text-ink-muted">{items.length}</span>
                  </header>
                  <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
                    {items.map((l) => (
                      <article key={l.id} className={clsx('rounded-xl border border-line bg-white p-3 shadow-soft', moving === l.id && 'opacity-60')}>
                        <button type="button" onClick={() => setOpen(l)} className="block w-full text-start">
                          <p className="truncate text-sm font-semibold text-ink">{l.company || l.name}</p>
                          <p className="truncate text-xs text-ink-muted">{l.name}{l.sector ? ` · ${label(SECTOR, l.sector, lang)}` : ''}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-soft">
                            {l.employeesCount ? <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /><span className="num">{num(l.employeesCount)}</span></span> : null}
                            {l.notes ? <span className="inline-flex items-center gap-1"><StickyNote className="h-3 w-3" />{t('ملاحظة', 'Note')}</span> : null}
                            <span>{timeAgo(l.createdAt, lang)}</span>
                          </div>
                          {l.message && <p className="mt-2 line-clamp-2 text-xs text-ink-muted">{l.message}</p>}
                        </button>
                        <div className="mt-2 flex flex-wrap gap-1 border-t border-line/70 pt-2">
                          {LEAD_STATUSES.filter((x) => x !== s).map((x) => (
                            <button key={x} type="button" disabled={moving === l.id} onClick={() => move(l, x)}
                              className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-muted hover:border-primary-500 hover:text-primary disabled:opacity-50">
                              {lbl(LEAD_STATUS, x, lang)}
                            </button>
                          ))}
                        </div>
                      </article>
                    ))}
                    {!items.length && <p className="px-2 py-6 text-center text-xs text-ink-soft">{t('لا يوجد', 'Empty')}</p>}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </Async>
      <LeadModal lead={open} onClose={() => setOpen(null)} onSaved={(l) => { patchLocal(l); refreshAdminCounts(); setOpen(null); }} />
    </div>
  );
}

function LeadModal({ lead, onClose, onSaved }: { lead: Lead | null; onClose: () => void; onSaved: (l: Lead) => void }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const [status, setStatus] = useState<LeadStatus>('NEW');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (lead) { setStatus(lead.status); setNotes(lead.notes ?? ''); } }, [lead]);
  if (!lead) return null;
  const save = async () => {
    setBusy(true);
    try { const r = await api.patch<Lead>(`/admin/leads/${lead.id}`, { status, notes }); toast(t('تم الحفظ', 'Saved')); onSaved(r); }
    catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={lead.company || lead.name}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={save} loading={busy}>{t('حفظ', 'Save')}</Button></>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><LeadStatusChip status={lead.status} /><span className="text-xs text-ink-soft">{date(lead.createdAt, lang)}</span></div>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p><span className="text-ink-soft">{t('الاسم', 'Name')}: </span>{lead.name}</p>
          <p><span className="text-ink-soft">{t('القطاع', 'Sector')}: </span>{label(SECTOR, lead.sector, lang)}</p>
          <p><span className="text-ink-soft">{t('عدد الموظفين', 'Employees')}: </span><span className="num">{lead.employeesCount ?? '—'}</span></p>
          {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-primary-500 hover:underline" dir="ltr"><Mail className="h-4 w-4" />{lead.email}</a>}
          {lead.phone && <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-primary-500 hover:underline" dir="ltr"><Phone className="h-4 w-4" />{lead.phone}</a>}
        </div>
        {lead.message && (
          <div className="rounded-xl bg-sand p-3 text-sm text-ink">
            <p className="mb-1 flex items-center gap-1.5 text-xs text-ink-soft"><MessageSquareText className="h-3.5 w-3.5" />{t('الرسالة', 'Message')}</p>
            {lead.message}
          </div>
        )}
        <Field label={t('الحالة', 'Status')}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LEAD_STATUSES.map((s) => (
              <button key={s} type="button" onClick={() => setStatus(s)}
                className={clsx('rounded-xl border px-2 py-2 text-xs font-medium', status === s ? 'border-primary bg-primary-50 text-primary ring-1 ring-primary' : 'border-line text-ink-muted hover:border-primary-500')}>
                {lbl(LEAD_STATUS, s, lang)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t('ملاحظات', 'Notes')}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('ملخص المكالمة، الخطوة التالية…', 'Call summary, next step…')} />
        </Field>
      </div>
    </Modal>
  );
}
