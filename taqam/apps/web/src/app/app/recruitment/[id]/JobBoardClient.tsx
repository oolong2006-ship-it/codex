'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Mail, Phone, Plus, UserPlus } from 'lucide-react';
import { Button, Field, Input, Modal, PageHeader, Select, Textarea, useToast } from '@/components/ui';
import { Async, Avatar, StatusBadge } from '@/components/app/primitives';
import { NATIONALITIES, nationalityLabel } from '@/components/app/EmployeeForm';
import { useAction, errMsg } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { money, num } from '@/lib/format';
import { CANDIDATE_STAGE, label } from '@/lib/labels';
import type { Candidate, CandidateStage, Job } from '@/lib/types';

const STAGES: CandidateStage[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];
const STAGE_COLOR: Record<CandidateStage, string> = { APPLIED: '#5E6E69', SCREENING: '#2F6F9F', INTERVIEW: '#D99A1E', OFFER: '#FFB547', HIRED: '#1B7F53', REJECTED: '#C2412D' };

export default function JobBoardPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useLang();
  const toast = useToast();
  const job = useFetch(async () => (await api.get<Job[]>('/jobs')).find((j) => j.id === id) ?? null, [id]);
  const cands = useFetch(() => api.get<Candidate[]>(`/jobs/${id}/candidates`), [id]);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<Candidate | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<CandidateStage | null>(null);

  const byStage = useMemo(() => {
    const m = Object.fromEntries(STAGES.map((s) => [s, [] as Candidate[]])) as Record<CandidateStage, Candidate[]>;
    (cands.data ?? []).forEach((c) => (m[c.stage] ?? m.APPLIED).push(c));
    return m;
  }, [cands.data]);

  const move = async (c: Candidate, stage: CandidateStage) => {
    if (c.stage === stage) return;
    const prev = cands.data;
    cands.setData((d) => (d ?? []).map((x) => (x.id === c.id ? { ...x, stage } : x)));
    setView((v) => (v && v.id === c.id ? { ...v, stage } : v));
    try {
      await api.patch(`/candidates/${c.id}`, { stage });
      toast(`${c.name} ← ${label(CANDIDATE_STAGE, stage, lang)}`);
    } catch (e) { cands.setData(prev ?? null); toast(errMsg(e), 'error'); }
  };
  const step = (c: Candidate, dir: 1 | -1) => {
    const i = STAGES.indexOf(c.stage) + dir;
    if (i >= 0 && i < STAGES.length) void move(c, STAGES[i]);
  };

  return (
    <>
      <Link href="/app/recruitment" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-primary"><ArrowRight className="h-4 w-4 ltr:rotate-180" />{t('التوظيف', 'Recruitment')}</Link>
      <Async loading={job.loading} error={job.error} onRetry={job.reload} hasData={!!job.data}>
        <PageHeader title={job.data?.title ?? t('وظيفة غير موجودة', 'Job not found')}
          subtitle={job.data ? `${job.data.branch?.nameAr ?? ''}${job.data.department?.name ? ` · ${job.data.department.name}` : ''} · ${num(cands.data?.length ?? 0)} ${t('مرشح', 'candidates')}` : undefined}
          actions={job.data && <Button onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" />{t('إضافة مرشح', 'Add candidate')}</Button>} />
        <Async loading={cands.loading} error={cands.error} onRetry={cands.reload} hasData={!!cands.data}>
          <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
            <div className="flex min-w-max gap-4">
              {STAGES.map((s) => (
                <div key={s}
                  onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)}
                  onDrop={() => { const c = cands.data?.find((x) => x.id === dragId); if (c) void move(c, s); setDragId(null); setOver(null); }}
                  className={clsx('flex w-72 shrink-0 flex-col rounded-2xl border bg-sand-200/60 transition-colors', over === s ? 'border-primary-500 bg-primary-50' : 'border-transparent')}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STAGE_COLOR[s] }} />{label(CANDIDATE_STAGE, s, lang)}</span>
                    <span className="num rounded-full bg-white px-2 text-xs text-ink-muted">{byStage[s].length}</span>
                  </div>
                  <div className="flex min-h-[120px] flex-1 flex-col gap-2.5 px-3 pb-3">
                    {byStage[s].map((c) => (
                      <div key={c.id} draggable onDragStart={() => setDragId(c.id)} onDragEnd={() => setDragId(null)}
                        className={clsx('cursor-grab rounded-xl border border-line bg-white p-3 shadow-soft transition active:cursor-grabbing', dragId === c.id && 'opacity-50')}>
                        <button onClick={() => setView(c)} className="flex w-full items-center gap-2.5 text-start">
                          <Avatar name={c.name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                            <p className="truncate text-xs text-ink-soft">{nationalityLabel(c.nationality, lang)}{c.expectedSalary ? ` · ${money(c.expectedSalary, { decimals: 0 })}` : ''}</p>
                          </div>
                        </button>
                        <div className="mt-2.5 flex items-center gap-1 border-t border-line/70 pt-2">
                          <button onClick={() => step(c, -1)} disabled={s === STAGES[0]} className="rounded-md p-1 text-ink-soft hover:bg-sand hover:text-primary disabled:opacity-30" aria-label="back"><ChevronRight className="h-4 w-4 ltr:rotate-180" /></button>
                          <select value={c.stage} onChange={(e) => move(c, e.target.value as CandidateStage)} className="h-7 flex-1 rounded-md border border-line bg-white px-1 text-xs text-ink-muted focus:outline-none">
                            {STAGES.map((x) => <option key={x} value={x}>{label(CANDIDATE_STAGE, x, lang)}</option>)}
                          </select>
                          <button onClick={() => step(c, 1)} disabled={s === STAGES[STAGES.length - 1]} className="rounded-md p-1 text-ink-soft hover:bg-sand hover:text-primary disabled:opacity-30" aria-label="forward"><ChevronLeft className="h-4 w-4 ltr:rotate-180" /></button>
                        </div>
                      </div>
                    ))}
                    {s === 'APPLIED' && (
                      <button onClick={() => setAdding(true)} className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-sand-300 py-2.5 text-sm text-ink-muted hover:border-primary-500 hover:text-primary">
                        <Plus className="h-4 w-4" />{t('مرشح', 'Candidate')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Async>
      </Async>
      {adding && <CandidateModal jobId={id} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); cands.reload(); }} />}
      {view && <CandidateView c={view} onClose={() => setView(null)} onMove={(s) => move(view, s)} onSaved={(c) => { setView(null); cands.setData((d) => (d ?? []).map((x) => (x.id === c.id ? { ...x, ...c } : x))); }} />}
    </>
  );
}

function CandidateModal({ jobId, onClose, onSaved }: { jobId: string; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useLang();
  const { busy, run } = useAction();
  const [f, setF] = useState({ name: '', email: '', phone: '', nationality: 'SA', expectedSalary: '', notes: '' });
  const save = async () => {
    if (!f.name.trim()) return;
    const body = { ...f, name: f.name.trim(), expectedSalary: f.expectedSalary ? Number(f.expectedSalary) : undefined, notes: f.notes || undefined };
    if (await run('save', () => api.post(`/jobs/${jobId}/candidates`, body), t('تمت إضافة المرشح', 'Candidate added'))) onSaved();
  };
  return (
    <Modal open onClose={onClose} title={t('إضافة مرشح', 'Add candidate')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={save} loading={busy === 'save'} disabled={!f.name.trim()}>{t('حفظ', 'Save')}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('الاسم', 'Name')} required className="sm:col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t('البريد', 'Email')}><Input type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label={t('الجوال', 'Phone')}><Input type="tel" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label={t('الجنسية', 'Nationality')}><Select value={f.nationality} onChange={(e) => setF({ ...f, nationality: e.target.value })} options={NATIONALITIES.map((n) => ({ value: n.code, label: lang === 'ar' ? n.ar : n.en }))} /></Field>
        <Field label={t('الراتب المتوقع', 'Expected salary')}><Input type="number" min={0} dir="ltr" value={f.expectedSalary} onChange={(e) => setF({ ...f, expectedSalary: e.target.value })} /></Field>
        <Field label={t('ملاحظات', 'Notes')} className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function CandidateView({ c, onClose, onMove, onSaved }: { c: Candidate; onClose: () => void; onMove: (s: CandidateStage) => void; onSaved: (c: Candidate) => void }) {
  const { t, lang } = useLang();
  const { busy, run } = useAction();
  const [notes, setNotes] = useState(c.notes ?? '');
  const save = async () => { if (await run('save', () => api.patch(`/candidates/${c.id}`, { stage: c.stage, notes }), t('تم الحفظ', 'Saved'))) onSaved({ ...c, notes }); };
  return (
    <Modal open onClose={onClose} title={c.name}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إغلاق', 'Close')}</Button><Button onClick={save} loading={busy === 'save'}>{t('حفظ الملاحظات', 'Save notes')}</Button></>}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={c.name} size="lg" />
          <div className="flex-1">
            <p className="font-semibold text-ink">{c.name}</p>
            <p className="text-sm text-ink-muted">{nationalityLabel(c.nationality, lang)}{c.expectedSalary ? ` · ${money(c.expectedSalary, { decimals: 0 })}` : ''}</p>
          </div>
          <StatusBadge map={CANDIDATE_STAGE} value={c.stage} />
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 text-primary-500 hover:underline" dir="ltr"><Mail className="h-4 w-4" />{c.email}</a>}
          {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 text-primary-500 hover:underline" dir="ltr"><Phone className="h-4 w-4" />{c.phone}</a>}
        </div>
        <div>
          <p className="field-label">{t('المرحلة', 'Stage')}</p>
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map((s) => (
              <button key={s} onClick={() => onMove(s)} className={clsx('rounded-lg border px-3 py-1.5 text-xs font-medium', c.stage === s ? 'border-transparent text-white' : 'border-line text-ink-muted hover:border-primary-500')}
                style={c.stage === s ? { background: STAGE_COLOR[s] } : undefined}>{label(CANDIDATE_STAGE, s, lang)}</button>
            ))}
          </div>
        </div>
        <Field label={t('ملاحظات', 'Notes')}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} /></Field>
      </div>
    </Modal>
  );
}
