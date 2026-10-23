'use client';
import { useState } from 'react';
import { Megaphone, Plus, Trash2, Building2, Globe2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui';
import { Async, ConfirmModal } from '@/components/app/primitives';
import { timeAgo } from '@/components/app/AppShell';
import { useBranches } from '@/components/app/hooks';
import { can, ADMIN, useAction } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date } from '@/lib/format';
import type { Announcement } from '@/lib/types';

export default function AnnouncementsPage() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const admin = can(user, ADMIN);
  const { data, loading, error, reload } = useFetch(() => api.get<Announcement[] | { data: Announcement[] }>('/announcements'), []);
  const list = Array.isArray(data) ? data : data?.data ?? [];
  const { branches } = useBranches();
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState<Announcement | null>(null);
  const { busy, run } = useAction();
  const branchName = (a: Announcement) => a.branchName ?? a.branch?.nameAr ?? branches.find((b) => b.id === a.branchId)?.nameAr;
  const remove = async () => { if (del && await run('del', () => api.del(`/announcements/${del.id}`), t('تم حذف الإعلان', 'Announcement deleted'))) { setDel(null); reload(); } };

  return (
    <>
      <PageHeader title={t('الإعلانات', 'Announcements')} subtitle={t('رسائل تظهر للموظفين في تطبيق الخدمة الذاتية', 'Messages shown to employees in the self-service app')}
        actions={admin && <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" />{t('إعلان جديد', 'New announcement')}</Button>} />
      <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
        {!list.length ? <Card><EmptyState title={t('لا توجد إعلانات', 'No announcements')} /></Card> : (
          <div className="mx-auto max-w-3xl space-y-4">
            {list.map((a) => (
              <Card key={a.id} className="p-5">
                <div className="flex items-start gap-4">
                  <span className="rounded-xl bg-accent-100 p-2.5 text-accent-600"><Megaphone className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-ink">{a.title}</h3>
                      {a.branchId ? <Badge tone="info"><Building2 className="h-3 w-3" />{branchName(a) ?? t('فرع', 'Branch')}</Badge> : <Badge tone="primary"><Globe2 className="h-3 w-3" />{t('جميع الفروع', 'All branches')}</Badge>}
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-muted">{a.body}</p>
                    <p className="mt-3 text-xs text-ink-soft">{a.authorName ? `${a.authorName} · ` : ''}<span title={date(a.createdAt, lang)}>{timeAgo(a.createdAt, lang)}</span></p>
                  </div>
                  {admin && <button onClick={() => setDel(a)} className="rounded-lg p-1.5 text-ink-soft hover:bg-danger-50 hover:text-danger" aria-label="delete"><Trash2 className="h-4 w-4" /></button>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Async>
      {adding && <NewModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger loading={busy === 'del'} confirmLabel={t('حذف', 'Delete')}
        title={t('حذف الإعلان', 'Delete announcement')} message={del?.title} />
    </>
  );
}

function NewModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const { busy, run } = useAction();
  const { options } = useBranches();
  const [f, setF] = useState({ title: '', body: '', branchId: '' });
  const valid = f.title.trim() && f.body.trim();
  const save = async () => { if (valid && await run('save', () => api.post('/announcements', { title: f.title.trim(), body: f.body.trim(), branchId: f.branchId || undefined }), t('تم نشر الإعلان', 'Announcement published'))) onSaved(); };
  return (
    <Modal open onClose={onClose} title={t('إعلان جديد', 'New announcement')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={save} loading={busy === 'save'} disabled={!valid}>{t('نشر', 'Publish')}</Button></>}>
      <div className="space-y-4">
        <Field label={t('العنوان', 'Title')} required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label={t('النص', 'Message')} required><Textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={5} /></Field>
        <Field label={t('الجمهور', 'Audience')}><Select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })} options={options} placeholder={t('جميع الفروع', 'All branches')} /></Field>
      </div>
    </Modal>
  );
}
