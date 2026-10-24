'use client';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { Play, Plus, Lock, Star, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Table, Textarea, type Column } from '@/components/ui';
import { Async, Avatar, Chips, ConfirmModal, SearchInput, StatusBadge } from '@/components/app/primitives';
import { can, ADMIN, useAction } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date, num } from '@/lib/format';
import type { Goal, PerformanceCycle, PerformanceReview } from '@/lib/types';

const CYCLE_STATUS: Record<string, [string, string]> = { DRAFT: ['مسودة', 'Draft'], ACTIVE: ['نشطة', 'Active'], CLOSED: ['مغلقة', 'Closed'] };
const REVIEW_STATUS: Record<string, [string, string]> = { PENDING: ['قيد التقييم', 'Pending'], SUBMITTED: ['مكتمل', 'Submitted'] };
const SCORE_LABEL: [string, string][] = [['ضعيف', 'Poor'], ['يحتاج تحسين', 'Needs improvement'], ['جيد', 'Meets'], ['جيد جداً', 'Exceeds'], ['ممتاز', 'Outstanding']];

function weighted(goals: Goal[]) {
  const scored = goals.filter((g) => g.score && g.weight > 0);
  const w = scored.reduce((a, g) => a + g.weight, 0);
  return w ? scored.reduce((a, g) => a + g.weight * (g.score ?? 0), 0) / w : null;
}
function ScoreBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) return <span className="text-ink-soft">—</span>;
  const tone = score >= 4 ? 'success' : score >= 3 ? 'primary' : score >= 2 ? 'warning' : 'danger';
  return <Badge tone={tone}><Star className="h-3 w-3" /><span className="num">{score.toFixed(2)}</span></Badge>;
}

export default function PerformancePage() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const admin = can(user, ADMIN);
  const cycles = useFetch(() => api.get<PerformanceCycle[]>('/performance/cycles'), []);
  const [cycleId, setCycleId] = useState('');
  const [creating, setCreating] = useState(false);
  const [statusChange, setStatusChange] = useState<{ c: PerformanceCycle; to: 'ACTIVE' | 'CLOSED' } | null>(null);
  const [editing, setEditing] = useState<PerformanceReview | null>(null);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const { busy, run } = useAction();

  useEffect(() => {
    if (!cycleId && cycles.data?.length) setCycleId((cycles.data.find((c) => c.status === 'ACTIVE') ?? cycles.data[0]).id);
  }, [cycles.data, cycleId]);
  const reviews = useFetch(() => (cycleId ? api.get<PerformanceReview[]>('/performance/reviews', { cycleId }) : Promise.resolve([])), [cycleId]);
  const cycle = cycles.data?.find((c) => c.id === cycleId);
  const rows = useMemo(() => (reviews.data ?? []).filter((r) => (!filter || r.status === filter) && (!q || r.employee.name.toLowerCase().includes(q.toLowerCase()))), [reviews.data, filter, q]);
  const avg = useMemo(() => { const s = (reviews.data ?? []).filter((r) => r.overallScore); return s.length ? s.reduce((a, r) => a + (r.overallScore ?? 0), 0) / s.length : null; }, [reviews.data]);

  const changeStatus = async () => {
    if (!statusChange) return;
    const ok = await run('status', () => api.patch(`/performance/cycles/${statusChange.c.id}`, { status: statusChange.to }),
      statusChange.to === 'ACTIVE' ? t('تم تفعيل الدورة وإنشاء التقييمات', 'Cycle activated; reviews created') : t('تم إغلاق الدورة', 'Cycle closed'));
    if (ok) { setStatusChange(null); cycles.reload(); reviews.reload(); }
  };

  const columns: Column<PerformanceReview>[] = [
    { key: 'emp', header: t('الموظف', 'Employee'), render: (r) => (
      <div className="flex items-center gap-2.5"><Avatar name={r.employee.name} size="sm" /><div><p className="font-medium text-ink">{r.employee.name}</p><p className="text-xs text-ink-soft">{r.employee.jobTitle ?? r.employee.branchName ?? ''}</p></div></div>
    ) },
    { key: 'rev', header: t('المقيّم', 'Reviewer'), render: (r) => <span className="text-ink-muted">{r.reviewerName || '—'}</span> },
    { key: 'goals', header: t('الأهداف', 'Goals'), render: (r) => <span className="num">{r.goals?.length ?? 0}</span> },
    { key: 'score', header: t('الدرجة', 'Score'), render: (r) => <ScoreBadge score={r.overallScore} /> },
    { key: 'status', header: t('الحالة', 'Status'), render: (r) => <StatusBadge map={REVIEW_STATUS} value={r.status} /> },
  ];

  return (
    <>
      <PageHeader title={t('تقييم الأداء', 'Performance')} subtitle={t('دورات التقييم والأهداف الموزونة والدرجات', 'Review cycles, weighted goals and scores')}
        actions={admin && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />{t('دورة جديدة', 'New cycle')}</Button>} />
      <Async loading={cycles.loading} error={cycles.error} onRetry={cycles.reload} hasData={!!cycles.data}>
        {!cycles.data?.length ? <Card><EmptyState title={t('لا توجد دورات تقييم', 'No review cycles')} action={admin && <Button size="sm" onClick={() => setCreating(true)}>{t('إنشاء دورة', 'Create cycle')}</Button>} /></Card> : (
          <>
            <div className="mb-6 flex gap-4 overflow-x-auto pb-1">
              {cycles.data.map((c) => {
                const progress = c.reviewsCount ? (c.completedCount / c.reviewsCount) * 100 : 0;
                return (
                  <button key={c.id} onClick={() => setCycleId(c.id)}
                    className={clsx('min-w-[240px] rounded-2xl border bg-white p-4 text-start shadow-soft transition', c.id === cycleId ? 'border-primary ring-2 ring-primary-100' : 'border-line hover:border-primary-500')}>
                    <div className="flex items-center justify-between gap-2"><p className="font-semibold text-ink">{c.name}</p><StatusBadge map={CYCLE_STATUS} value={c.status} /></div>
                    <p className="mt-1 text-xs text-ink-soft">{date(c.startDate, lang)} — {date(c.endDate, lang)}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand-200"><div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} /></div>
                      <span className="num text-xs text-ink-muted">{c.completedCount}/{c.reviewsCount}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {cycle && (
              <Card>
                <CardHeader title={cycle.name} subtitle={avg !== null ? `${t('متوسط الدرجات', 'Average score')}: ${avg.toFixed(2)} / 5` : undefined}
                  action={admin && <div className="flex gap-2">
                    {cycle.status === 'DRAFT' && <Button size="sm" onClick={() => setStatusChange({ c: cycle, to: 'ACTIVE' })}><Play className="h-4 w-4" />{t('تفعيل', 'Activate')}</Button>}
                    {cycle.status === 'ACTIVE' && <Button size="sm" variant="secondary" onClick={() => setStatusChange({ c: cycle, to: 'CLOSED' })}><Lock className="h-4 w-4" />{t('إغلاق', 'Close')}</Button>}
                  </div>} />
                <div className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row sm:items-center">
                  <SearchInput value={q} onChange={setQ} placeholder={t('بحث بالموظف', 'Search employee')} className="sm:w-60" />
                  <Chips value={filter} onChange={setFilter} options={[{ value: '', label: t('الكل', 'All') }, { value: 'PENDING', label: t('قيد التقييم', 'Pending') }, { value: 'SUBMITTED', label: t('مكتمل', 'Submitted') }]} />
                </div>
                <Async loading={reviews.loading} error={reviews.error} onRetry={reviews.reload} hasData={!!reviews.data}>
                  <Table columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={cycle.status !== 'CLOSED' ? setEditing : undefined}
                    empty={<EmptyState title={cycle.status === 'DRAFT' ? t('فعّل الدورة لإنشاء التقييمات', 'Activate the cycle to create reviews') : t('لا توجد تقييمات', 'No reviews')} />} />
                </Async>
              </Card>
            )}
          </>
        )}
      </Async>
      {creating && <CycleModal onClose={() => setCreating(false)} onSaved={(c) => { setCreating(false); setCycleId(c.id); cycles.reload(); }} />}
      {editing && <ReviewModal review={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reviews.reload(); cycles.reload(); }} />}
      <ConfirmModal open={!!statusChange} onClose={() => setStatusChange(null)} onConfirm={changeStatus} loading={busy === 'status'}
        title={statusChange?.to === 'ACTIVE' ? t('تفعيل الدورة', 'Activate cycle') : t('إغلاق الدورة', 'Close cycle')}
        message={statusChange?.to === 'ACTIVE' ? t('سيتم إنشاء تقييم لكل موظف نشط ويكون المقيّم هو المدير المباشر.', 'A review will be created for each active employee, reviewed by their manager.') : t('لن يمكن تعديل التقييمات بعد الإغلاق.', 'Reviews cannot be edited after closing.')} />
    </>
  );
}

function CycleModal({ onClose, onSaved }: { onClose: () => void; onSaved: (c: PerformanceCycle) => void }) {
  const { t } = useLang();
  const { busy, run } = useAction();
  const [f, setF] = useState({ name: '', startDate: '', endDate: '' });
  const valid = f.name.trim() && f.startDate && f.endDate && f.endDate >= f.startDate;
  const save = async () => {
    let c: PerformanceCycle | null = null;
    if (valid && await run('save', async () => { c = await api.post<PerformanceCycle>('/performance/cycles', { ...f, name: f.name.trim() }); }, t('تم إنشاء الدورة', 'Cycle created')) && c) onSaved(c);
  };
  return (
    <Modal open onClose={onClose} size="sm" title={t('دورة تقييم جديدة', 'New review cycle')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={save} loading={busy === 'save'} disabled={!valid}>{t('إنشاء', 'Create')}</Button></>}>
      <div className="space-y-4">
        <Field label={t('اسم الدورة', 'Name')} required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('تقييم النصف الثاني 2026', 'H2 2026 review')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('من', 'From')} required><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
          <Field label={t('إلى', 'To')} required><Input type="date" value={f.endDate} min={f.startDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function ReviewModal({ review, onClose, onSaved }: { review: PerformanceReview; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useLang();
  const { busy, run } = useAction();
  const [goals, setGoals] = useState<Goal[]>(review.goals?.length ? review.goals.map((g) => ({ ...g })) : [{ title: '', weight: 100, score: null }]);
  const [comments, setComments] = useState(review.comments ?? '');
  const totalWeight = goals.reduce((a, g) => a + (Number(g.weight) || 0), 0);
  const score = weighted(goals);
  const upd = (i: number, patch: Partial<Goal>) => setGoals((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const complete = goals.every((g) => g.title.trim() && g.score) && totalWeight === 100;
  const save = async (status: 'PENDING' | 'SUBMITTED') => {
    const body = { goals: goals.filter((g) => g.title.trim()).map((g) => ({ title: g.title.trim(), weight: Number(g.weight) || 0, score: g.score })), comments, status };
    if (await run(status, () => api.patch(`/performance/reviews/${review.id}`, body), status === 'SUBMITTED' ? t('تم اعتماد التقييم', 'Review submitted') : t('تم حفظ المسودة', 'Draft saved'))) onSaved();
  };
  return (
    <Modal open onClose={onClose} size="lg" title={`${t('تقييم', 'Review')} — ${review.employee.name}`}
      footer={<>
        <Button variant="secondary" onClick={() => save('PENDING')} loading={busy === 'PENDING'}>{t('حفظ كمسودة', 'Save draft')}</Button>
        <Button onClick={() => save('SUBMITTED')} loading={busy === 'SUBMITTED'} disabled={!complete}>{t('اعتماد التقييم', 'Submit review')}</Button>
      </>}>
      <div className="mb-4 flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-white">
        <span className="text-sm">{t('الدرجة الموزونة', 'Weighted score')}</span>
        <span className="num text-2xl font-bold">{score !== null ? score.toFixed(2) : '—'} <span className="text-sm font-normal text-white/60">/ 5</span></span>
      </div>
      <div className="space-y-3">
        {goals.map((g, i) => (
          <div key={i} className="rounded-xl border border-line p-3">
            <div className="flex gap-2">
              <Input value={g.title} onChange={(e) => upd(i, { title: e.target.value })} placeholder={t(`الهدف ${i + 1}`, `Goal ${i + 1}`)} className="flex-1" />
              <div className="relative w-24"><Input type="number" min={0} max={100} dir="ltr" value={g.weight} onChange={(e) => upd(i, { weight: Number(e.target.value) })} className="pe-7" /><span className="absolute end-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-soft">%</span></div>
              {goals.length > 1 && <button onClick={() => setGoals((gs) => gs.filter((_, j) => j !== i))} className="rounded-lg p-2 text-ink-soft hover:bg-danger-50 hover:text-danger" aria-label="remove"><Trash2 className="h-4 w-4" /></button>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} type="button" onClick={() => upd(i, { score: s })} title={SCORE_LABEL[s - 1][lang === 'ar' ? 0 : 1]}
                  className={clsx('num h-9 w-9 rounded-lg border text-sm font-semibold transition', g.score === s ? 'border-accent bg-accent text-night' : 'border-line bg-white text-ink-muted hover:border-accent')}>{s}</button>
              ))}
              {g.score && <span className="ms-1 text-xs text-ink-muted">{SCORE_LABEL[g.score - 1][lang === 'ar' ? 0 : 1]}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={() => setGoals((gs) => [...gs, { title: '', weight: Math.max(0, 100 - totalWeight), score: null }])}><Plus className="h-4 w-4" />{t('إضافة هدف', 'Add goal')}</Button>
        <span className={clsx('num text-sm', totalWeight === 100 ? 'text-success' : 'text-danger')}>{t('مجموع الأوزان', 'Total weight')}: {num(totalWeight)}%</span>
      </div>
      <Field label={t('ملاحظات المقيّم', 'Reviewer comments')} className="mt-4"><Textarea value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
      {!complete && <p className="mt-2 text-xs text-ink-soft">{t('للاعتماد: يجب تقييم كل هدف وأن يكون مجموع الأوزان 100%.', 'To submit: score every goal and make weights total 100%.')}</p>}
    </Modal>
  );
}
