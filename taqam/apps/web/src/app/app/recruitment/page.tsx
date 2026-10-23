'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Briefcase, Building2, MoreHorizontal, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui';
import { Async, Chips, ConfirmModal, StatusBadge } from '@/components/app/primitives';
import { useBranches, useDepartments } from '@/components/app/hooks';
import { useAction } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date, num } from '@/lib/format';
import type { Job } from '@/lib/types';

const JOB_STATUS: Record<string, [string, string]> = { OPEN: ['مفتوحة', 'Open'], CLOSED: ['مغلقة', 'Closed'] };
const EMPLOYMENT: Record<string, [string, string]> = { FULL_TIME: ['دوام كامل', 'Full-time'], PART_TIME: ['دوام جزئي', 'Part-time'], CONTRACT: ['عقد مؤقت', 'Contract'], INTERNSHIP: ['تدريب', 'Internship'] };

export default function RecruitmentPage() {
  const { t, lang } = useLang();
  const { data, loading, error, reload } = useFetch(() => api.get<Job[]>('/jobs'), []);
  const { branches } = useBranches();
  const [status, setStatus] = useState('OPEN');
  const [edit, setEdit] = useState<Job | 'new' | null>(null);
  const [del, setDel] = useState<Job | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const { busy, run } = useAction();
  const jobs = (data ?? []).filter((j) => !status || j.status === status);
  const branchName = (j: Job) => j.branch?.nameAr ?? branches.find((b) => b.id === j.branchId)?.nameAr;

  const toggle = async (j: Job) => {
    setMenu(null);
    if (await run('toggle', () => api.patch(`/jobs/${j.id}`, { status: j.status === 'OPEN' ? 'CLOSED' : 'OPEN' }), j.status === 'OPEN' ? t('تم إغلاق الوظيفة', 'Job closed') : t('تم فتح الوظيفة', 'Job reopened'))) reload();
  };
  const remove = async () => { if (del && await run('del', () => api.del(`/jobs/${del.id}`), t('تم حذف الوظيفة', 'Job deleted'))) { setDel(null); reload(); } };

  return (
    <>
      <PageHeader title={t('التوظيف', 'Recruitment')} subtitle={t('الوظائف الشاغرة ومسار المرشحين', 'Job openings and candidate pipeline')}
        actions={<Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />{t('وظيفة جديدة', 'New job')}</Button>} />
      <div className="mb-5">
        <Chips value={status} onChange={setStatus} options={[
          { value: 'OPEN', label: t('مفتوحة', 'Open'), count: (data ?? []).filter((j) => j.status === 'OPEN').length },
          { value: 'CLOSED', label: t('مغلقة', 'Closed'), count: (data ?? []).filter((j) => j.status === 'CLOSED').length },
          { value: '', label: t('الكل', 'All'), count: data?.length ?? 0 },
        ]} />
      </div>
      <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
        {!jobs.length ? <Card><EmptyState title={t('لا توجد وظائف', 'No jobs')} action={<Button size="sm" onClick={() => setEdit('new')}>{t('أضف وظيفة', 'Add a job')}</Button>} /></Card> : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map((j) => (
              <Card key={j.id} className="relative flex flex-col p-5 transition-shadow hover:shadow-lift">
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-xl bg-accent-100 p-2.5 text-accent-600"><Briefcase className="h-5 w-5" /></span>
                  <div className="flex items-center gap-1">
                    <StatusBadge map={JOB_STATUS} value={j.status} />
                    <div className="relative">
                      <button onClick={() => setMenu(menu === j.id ? null : j.id)} className="rounded-lg p-1.5 text-ink-soft hover:bg-sand" aria-label="menu"><MoreHorizontal className="h-4 w-4" /></button>
                      {menu === j.id && (
                        <div className="absolute end-0 top-8 z-10 w-40 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lift" onMouseLeave={() => setMenu(null)}>
                          <button onClick={() => { setMenu(null); setEdit(j); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-sand"><Pencil className="h-4 w-4" />{t('تعديل', 'Edit')}</button>
                          <button onClick={() => toggle(j)} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-sand">{j.status === 'OPEN' ? t('إغلاق الوظيفة', 'Close job') : t('إعادة الفتح', 'Reopen')}</button>
                          <button onClick={() => { setMenu(null); setDel(j); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger-50"><Trash2 className="h-4 w-4" />{t('حذف', 'Delete')}</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <Link href={`/app/recruitment/${j.id}`} className="mt-3 block flex-1">
                  <h3 className="text-lg font-semibold text-ink hover:text-primary-500">{j.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-muted">
                    {branchName(j) && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{branchName(j)}</span>}
                    {j.department?.name && <span>· {j.department.name}</span>}
                    <Badge tone="neutral">{EMPLOYMENT[j.employmentType]?.[lang === 'ar' ? 0 : 1] ?? j.employmentType}</Badge>
                  </div>
                  {j.description && <p className="mt-3 line-clamp-2 text-sm text-ink-muted">{j.description}</p>}
                </Link>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-sm">
                  <span className="inline-flex items-center gap-1.5 text-ink"><Users className="h-4 w-4 text-ink-soft" /><span className="num font-semibold">{num(j.candidatesCount)}</span> {t('مرشح', 'candidates')}</span>
                  {j.createdAt && <span className="text-xs text-ink-soft">{date(j.createdAt, lang)}</span>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Async>
      {edit && <JobModal job={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger loading={busy === 'del'} confirmLabel={t('حذف', 'Delete')}
        title={t('حذف الوظيفة', 'Delete job')} message={t('سيتم حذف الوظيفة وجميع مرشحيها.', 'The job and its candidates will be deleted.')} />
    </>
  );
}

function JobModal({ job, onClose, onSaved }: { job: Job | null; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useLang();
  const { busy, run } = useAction();
  const { options: branchOpts } = useBranches();
  const { options: deptOpts } = useDepartments();
  const [f, setF] = useState({ title: job?.title ?? '', branchId: job?.branchId ?? '', departmentId: job?.departmentId ?? '', employmentType: job?.employmentType ?? 'FULL_TIME', description: job?.description ?? '', status: job?.status ?? 'OPEN' });
  const save = async () => {
    if (!f.title.trim()) return;
    const body = { ...f, title: f.title.trim(), branchId: f.branchId || null, departmentId: f.departmentId || null };
    if (await run('save', () => (job ? api.patch(`/jobs/${job.id}`, body) : api.post('/jobs', body)), t('تم حفظ الوظيفة', 'Job saved'))) onSaved();
  };
  return (
    <Modal open onClose={onClose} title={job ? t('تعديل وظيفة', 'Edit job') : t('وظيفة جديدة', 'New job')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={save} loading={busy === 'save'} disabled={!f.title.trim()}>{t('حفظ', 'Save')}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('المسمى الوظيفي', 'Title')} required className="sm:col-span-2"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label={t('الفرع', 'Branch')}><Select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })} options={branchOpts} placeholder="—" /></Field>
        <Field label={t('القسم', 'Department')}><Select value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })} options={deptOpts} placeholder="—" /></Field>
        <Field label={t('نوع التوظيف', 'Employment type')}><Select value={f.employmentType} onChange={(e) => setF({ ...f, employmentType: e.target.value })} options={Object.entries(EMPLOYMENT).map(([v, l]) => ({ value: v, label: lang === 'ar' ? l[0] : l[1] }))} /></Field>
        <Field label={t('الحالة', 'Status')}><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as 'OPEN' | 'CLOSED' })} options={Object.entries(JOB_STATUS).map(([v, l]) => ({ value: v, label: lang === 'ar' ? l[0] : l[1] }))} /></Field>
        <Field label={t('الوصف', 'Description')} className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={4} /></Field>
      </div>
    </Modal>
  );
}
