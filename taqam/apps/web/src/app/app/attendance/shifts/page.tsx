'use client';
import clsx from 'clsx';
import { useState } from 'react';
import { Clock, Coffee, Pencil, Plus, Timer, Trash2 } from 'lucide-react';
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select } from '@/components/ui';
import { Async, Chips, ConfirmModal } from '@/components/app/primitives';
import { SubNav, ATTENDANCE_NAV } from '@/components/app/SubNav';
import { useBranches, useShifts } from '@/components/app/hooks';
import { DAY_NAMES, useAction } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import type { Shift } from '@/lib/types';

const COLORS = ['#1F7A7C', '#F2A541', '#3B7EA1', '#2E8B57', '#C8553D', '#6B5B95', '#0F3D3E', '#D98B23'];

function shiftHours(s: { startTime: string; endTime: string; breakMinutes: number }) {
  const [sh, sm] = s.startTime.split(':').map(Number); const [eh, em] = s.endTime.split(':').map(Number);
  let m = eh * 60 + em - (sh * 60 + sm); if (m <= 0) m += 1440;
  return Math.max(0, (m - (s.breakMinutes || 0)) / 60);
}

export default function ShiftsPage() {
  const { t, lang } = useLang();
  const { branches, options: branchOpts } = useBranches();
  const [branchId, setBranchId] = useState('');
  const { shifts, loading, error, reload, data } = useShifts(branchId || undefined);
  const [edit, setEdit] = useState<Shift | 'new' | null>(null);
  const [del, setDel] = useState<Shift | null>(null);
  const { busy, run } = useAction();
  const branchName = (id: string) => branches.find((b) => b.id === id)?.nameAr ?? '';
  const remove = async () => { if (del && await run('del', () => api.del(`/shifts/${del.id}`), t('تم حذف الوردية', 'Shift deleted'))) { setDel(null); reload(); } };

  return (
    <>
      <PageHeader title={t('الورديات', 'Shifts')} subtitle={t('أوقات العمل وفترات السماح لكل فرع', 'Working hours and grace periods per branch')}
        actions={<Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />{t('وردية جديدة', 'New shift')}</Button>} />
      <SubNav items={ATTENDANCE_NAV} />
      <div className="mb-4">
        <Chips value={branchId} onChange={setBranchId} options={[{ value: '', label: t('كل الفروع', 'All branches') }, ...branchOpts]} />
      </div>
      <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
        {!shifts.length ? <Card><EmptyState title={t('لا توجد ورديات', 'No shifts')} action={<Button size="sm" onClick={() => setEdit('new')}>{t('إنشاء وردية', 'Create shift')}</Button>} /></Card> : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shifts.map((s) => (
              <Card key={s.id} className="overflow-hidden">
                <div className="flex items-stretch">
                  <div className="w-1.5 shrink-0" style={{ background: s.color }} />
                  <div className="flex-1 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-ink">{s.name}</h3>
                        <p className="text-xs text-ink-soft">{branchName(s.branchId)}</p>
                      </div>
                      <div className="flex">
                        <button onClick={() => setEdit(s)} className="rounded-lg p-1.5 text-ink-soft hover:bg-sand hover:text-primary" aria-label="edit"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => setDel(s)} className="rounded-lg p-1.5 text-ink-soft hover:bg-danger-50 hover:text-danger" aria-label="delete"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    <p className="num mt-3 text-2xl font-bold text-ink" dir="ltr">{s.startTime} – {s.endTime}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-muted">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{shiftHours(s).toFixed(1)} {t('ساعة', 'h')}</span>
                      <span className="inline-flex items-center gap-1"><Coffee className="h-3.5 w-3.5" />{s.breakMinutes} {t('د استراحة', 'm break')}</span>
                      <span className="inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5" />{s.graceMinutes} {t('د سماح', 'm grace')}</span>
                    </div>
                    <div className="mt-4 flex gap-1">
                      {DAY_NAMES.map((d, i) => (
                        <span key={i} className={clsx('flex h-7 flex-1 items-center justify-center rounded-md text-[11px] font-medium', s.days.includes(i) ? 'text-white' : 'bg-sand text-ink-soft')}
                          style={s.days.includes(i) ? { background: s.color } : undefined}>{lang === 'ar' ? d[0].slice(0, 3) : d[1].slice(0, 2)}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Async>
      {edit && <ShiftModal shift={edit === 'new' ? null : edit} defaultBranch={branchId || branches[0]?.id || ''} branchOpts={branchOpts} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger loading={busy === 'del'} confirmLabel={t('حذف', 'Delete')}
        title={t('حذف الوردية', 'Delete shift')} message={t('سيتم حذف الوردية وإزالتها من جدول الورديات.', 'The shift will be removed from the roster.')} />
    </>
  );
}

function ShiftModal({ shift, defaultBranch, branchOpts, onClose, onSaved }:
  { shift: Shift | null; defaultBranch: string; branchOpts: { value: string; label: string }[]; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useLang();
  const { busy, run } = useAction();
  const [f, setF] = useState({
    branchId: shift?.branchId ?? defaultBranch, name: shift?.name ?? '', startTime: shift?.startTime ?? '09:00', endTime: shift?.endTime ?? '17:00',
    breakMinutes: String(shift?.breakMinutes ?? 60), graceMinutes: String(shift?.graceMinutes ?? 15), days: shift?.days ?? [0, 1, 2, 3, 4], color: shift?.color ?? COLORS[0],
  });
  const toggleDay = (d: number) => setF((s) => ({ ...s, days: s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d].sort() }));
  const valid = f.branchId && f.name.trim() && f.startTime && f.endTime && f.days.length;
  const save = async () => {
    if (!valid) return;
    const body = { ...f, name: f.name.trim(), breakMinutes: Number(f.breakMinutes) || 0, graceMinutes: Number(f.graceMinutes) || 0 };
    if (await run('save', () => (shift ? api.patch(`/shifts/${shift.id}`, body) : api.post('/shifts', body)), t('تم حفظ الوردية', 'Shift saved'))) onSaved();
  };
  return (
    <Modal open onClose={onClose} title={shift ? t('تعديل وردية', 'Edit shift') : t('وردية جديدة', 'New shift')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={save} loading={busy === 'save'} disabled={!valid}>{t('حفظ', 'Save')}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('الفرع', 'Branch')} required><Select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })} options={branchOpts} placeholder={t('اختر', 'Select')} /></Field>
        <Field label={t('اسم الوردية', 'Shift name')} required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('صباحية', 'Morning')} /></Field>
        <Field label={t('البداية', 'Start')} required><Input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></Field>
        <Field label={t('النهاية', 'End')} required hint={t('يسمح بالورديات الليلية الممتدة لليوم التالي', 'Overnight shifts allowed')}><Input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></Field>
        <Field label={t('الاستراحة (دقيقة)', 'Break (min)')}><Input type="number" min={0} dir="ltr" value={f.breakMinutes} onChange={(e) => setF({ ...f, breakMinutes: e.target.value })} /></Field>
        <Field label={t('فترة السماح (دقيقة)', 'Grace (min)')}><Input type="number" min={0} dir="ltr" value={f.graceMinutes} onChange={(e) => setF({ ...f, graceMinutes: e.target.value })} /></Field>
      </div>
      <div className="mt-4">
        <p className="field-label">{t('أيام العمل', 'Working days')}</p>
        <div className="flex flex-wrap gap-1.5">
          {DAY_NAMES.map((d, i) => (
            <button key={i} type="button" onClick={() => toggleDay(i)}
              className={clsx('rounded-lg border px-3 py-1.5 text-sm', f.days.includes(i) ? 'border-primary bg-primary text-white' : 'border-line bg-white text-ink-muted hover:border-primary-500')}>
              {lang === 'ar' ? d[0] : d[1]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <p className="field-label">{t('اللون', 'Color')}</p>
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={c}
              className={clsx('h-8 w-8 rounded-full ring-offset-2 transition', f.color === c && 'ring-2 ring-primary')} style={{ background: c }} />
          ))}
        </div>
      </div>
    </Modal>
  );
}
