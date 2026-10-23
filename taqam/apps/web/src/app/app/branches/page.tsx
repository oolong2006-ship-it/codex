'use client';
import { useState } from 'react';
import { Flag, MapPin, Pencil, Plus, Trash2, Users, UserRound, ExternalLink, Radius } from 'lucide-react';
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select } from '@/components/ui';
import { Async, BAND_COLOR, ConfirmModal } from '@/components/app/primitives';
import { useEmployeeOptions } from '@/components/app/hooks';
import { can, ADMIN, useAction } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { num, pct } from '@/lib/format';
import { NITAQAT_BAND, label } from '@/lib/labels';
import type { Branch } from '@/lib/types';

export default function BranchesPage() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const admin = can(user, ADMIN);
  const { data, loading, error, reload } = useFetch(() => api.get<Branch[]>('/branches'), []);
  const [edit, setEdit] = useState<Branch | 'new' | null>(null);
  const [del, setDel] = useState<Branch | null>(null);
  const { busy, run } = useAction();

  const remove = async () => {
    if (!del) return;
    if (await run('del', () => api.del(`/branches/${del.id}`), t('تم حذف الفرع', 'Branch deleted'))) { setDel(null); reload(); }
  };

  return (
    <>
      <PageHeader title={t('الفروع', 'Branches')} subtitle={t('كل فرع بنطاقه الجغرافي ونسبة سعودته', 'Each branch with its geofence and Saudization rate')}
        actions={admin && <Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />{t('إضافة فرع', 'Add branch')}</Button>} />
      <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
        {!data?.length ? <Card><EmptyState title={t('لا توجد فروع بعد', 'No branches yet')} action={admin && <Button size="sm" onClick={() => setEdit('new')}>{t('إضافة فرع', 'Add branch')}</Button>} /></Card> : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {data.map((b) => (
              <Card key={b.id} className="flex flex-col overflow-hidden">
                <div className="h-1.5" style={{ background: BAND_COLOR[b.nitaqatBand] }} />
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold text-ink">{lang === 'en' ? b.nameEn || b.nameAr : b.nameAr}</h3>
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-muted"><MapPin className="h-3.5 w-3.5" />{b.city}{b.address ? ` · ${b.address}` : ''}</p>
                    </div>
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: BAND_COLOR[b.nitaqatBand] }}>{label(NITAQAT_BAND, b.nitaqatBand, lang)}</span>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-sand p-2.5"><Users className="mx-auto h-4 w-4 text-ink-soft" /><p className="num mt-1 font-bold text-ink">{num(b.employeesCount)}</p><p className="text-[11px] text-ink-soft">{t('موظف', 'staff')}</p></div>
                    <div className="rounded-xl bg-sand p-2.5"><Flag className="mx-auto h-4 w-4 text-ink-soft" /><p className="num mt-1 font-bold text-ink">{num(b.saudis)}</p><p className="text-[11px] text-ink-soft">{t('سعودي', 'Saudi')}</p></div>
                    <div className="rounded-xl bg-sand p-2.5"><Radius className="mx-auto h-4 w-4 text-ink-soft" /><p className="num mt-1 font-bold text-ink">{num(b.radiusMeters)}</p><p className="text-[11px] text-ink-soft">{t('متر', 'm')}</p></div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs"><span className="text-ink-muted">{t('نسبة السعودة', 'Saudization')}</span><span className="num font-semibold text-ink">{pct(b.saudizationRate)}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-sand-200"><div className="h-full rounded-full" style={{ width: `${Math.min(100, b.saudizationRate)}%`, background: BAND_COLOR[b.nitaqatBand] }} /></div>
                  </div>
                  <p className="mb-5 mt-4 flex items-center gap-1.5 text-sm text-ink-muted"><UserRound className="h-4 w-4" />{t('المدير:', 'Manager:')} <span className="text-ink">{b.managerName || '—'}</span></p>
                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-4">
                    <a href={`https://www.google.com/maps?q=${b.lat},${b.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-500 hover:underline">
                      <ExternalLink className="h-4 w-4" />{t('عرض على الخريطة', 'View on map')}
                    </a>
                    {admin && (
                      <div className="flex gap-1">
                        <button onClick={() => setEdit(b)} className="rounded-lg p-2 text-ink-soft hover:bg-sand hover:text-primary" aria-label="edit"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => setDel(b)} className="rounded-lg p-2 text-ink-soft hover:bg-danger-50 hover:text-danger" aria-label="delete"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Async>
      {edit && <BranchModal branch={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger loading={busy === 'del'} confirmLabel={t('حذف', 'Delete')}
        title={t('حذف الفرع', 'Delete branch')} message={t('لا يمكن حذف فرع مرتبط بموظفين. هل تريد المتابعة؟', 'Branches with employees cannot be deleted. Continue?')} />
    </>
  );
}

function BranchModal({ branch, onClose, onSaved }: { branch: Branch | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const { busy, run } = useAction();
  const { options: empOpts } = useEmployeeOptions();
  const [f, setF] = useState({
    nameAr: branch?.nameAr ?? '', nameEn: branch?.nameEn ?? '', city: branch?.city ?? '', address: branch?.address ?? '',
    lat: branch ? String(branch.lat) : '', lng: branch ? String(branch.lng) : '', radiusMeters: String(branch?.radiusMeters ?? 150), managerEmployeeId: branch?.managerEmployeeId ?? '',
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => setF((s) => ({ ...s, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })));
  const save = async () => {
    const lat = Number(f.lat); const lng = Number(f.lng);
    if (!f.nameAr.trim() || !f.city.trim() || !f.lat || !f.lng || isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      setErr(t('أكمل الاسم والمدينة وإحداثيات صحيحة', 'Fill name, city and valid coordinates')); return;
    }
    const body = { nameAr: f.nameAr.trim(), nameEn: f.nameEn.trim() || undefined, city: f.city.trim(), address: f.address.trim() || undefined, lat, lng, radiusMeters: Number(f.radiusMeters) || 150, managerEmployeeId: f.managerEmployeeId || null };
    const ok = await run('save', () => (branch ? api.patch(`/branches/${branch.id}`, body) : api.post('/branches', body)), t('تم حفظ الفرع', 'Branch saved'));
    if (ok) onSaved();
  };
  return (
    <Modal open onClose={onClose} size="lg" title={branch ? t('تعديل الفرع', 'Edit branch') : t('فرع جديد', 'New branch')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={save} loading={busy === 'save'}>{t('حفظ', 'Save')}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('اسم الفرع (عربي)', 'Name (Arabic)')} required><Input value={f.nameAr} onChange={set('nameAr')} /></Field>
        <Field label={t('اسم الفرع (إنجليزي)', 'Name (English)')}><Input dir="ltr" value={f.nameEn} onChange={set('nameEn')} /></Field>
        <Field label={t('المدينة', 'City')} required><Input value={f.city} onChange={set('city')} /></Field>
        <Field label={t('العنوان', 'Address')}><Input value={f.address} onChange={set('address')} /></Field>
        <Field label={t('خط العرض', 'Latitude')} required><Input dir="ltr" inputMode="decimal" value={f.lat} onChange={set('lat')} placeholder="24.7136" /></Field>
        <Field label={t('خط الطول', 'Longitude')} required><Input dir="ltr" inputMode="decimal" value={f.lng} onChange={set('lng')} placeholder="46.6753" /></Field>
        <Field label={t('نطاق البصمة (متر)', 'Geofence radius (m)')} hint={t('المسافة المسموح بها للبصمة من موقع الفرع', 'Allowed check-in distance from the branch')}>
          <Input type="number" min={20} max={5000} dir="ltr" value={f.radiusMeters} onChange={set('radiusMeters')} />
        </Field>
        <Field label={t('مدير الفرع', 'Branch manager')}><Select value={f.managerEmployeeId} onChange={set('managerEmployeeId')} placeholder="—" options={empOpts} /></Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={locate}><MapPin className="h-4 w-4" />{t('استخدم موقعي الحالي', 'Use my location')}</Button>
        {f.lat && f.lng && <a className="text-sm text-primary-500 hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${f.lat},${f.lng}`}>{t('معاينة على الخريطة', 'Preview on map')}</a>}
      </div>
      {err && <p className="mt-3 rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger">{err}</p>}
    </Modal>
  );
}
