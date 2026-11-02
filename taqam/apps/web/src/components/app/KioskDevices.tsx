'use client';
import { useState } from 'react';
import { Check, Copy, MonitorSmartphone, Plus, ShieldOff } from 'lucide-react';
import { Badge, Button, EmptyState, Field, Input, Modal } from '@/components/ui';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { dateTime } from '@/lib/format';
import { withBase } from '@/lib/paths';
import { Async, ConfirmModal } from './primitives';
import { useAction } from './utils';

export interface KioskRow { id: string; name: string; branchId: string; lastSeenAt: string | null; revokedAt: string | null; createdAt: string }

/** Kiosk URL to open on the branch tablet (absolute, with the demo base path). */
export function kioskUrl(origin: string): string {
  return `${origin}${withBase('/kiosk')}`;
}

/**
 * «أجهزة الحضور» of a branch: pair a shared tablet (the token is shown once, with a copy button), list and revoke.
 * The kiosk never uses the camera.
 */
export function KioskDevicesModal({ branch, onClose }: { branch: { id: string; nameAr: string }; onClose: () => void }) {
  const { t, lang } = useLang();
  const { data, loading, error, reload } = useFetch(() => api.get<KioskRow[]>(`/branches/${branch.id}/kiosks`), [branch.id]);
  const { busy, run } = useAction();
  const [name, setName] = useState('');
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [paired, setPaired] = useState<{ id: string; name: string; token: string } | null>(null);
  const [revoke, setRevoke] = useState<KioskRow | null>(null);
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const pair = async () => {
    if (!name.trim()) { setNameErr(t('أدخل اسماً للجهاز، مثل «جهاز المدخل»', 'Name the device, e.g. “Entrance tablet”')); return; }
    setNameErr(null);
    let res: { id: string; name: string; token: string } | null = null;
    if (await run('pair', async () => { res = await api.post(`/branches/${branch.id}/kiosks`, { name: name.trim() }); }, t('تم ربط الجهاز', 'Kiosk paired'))) {
      setPaired(res);
      setName('');
      setCopied(false);
      void reload();
    }
  };
  const copy = async () => {
    if (!paired) return;
    try { await navigator.clipboard.writeText(paired.token); setCopied(true); } catch { setCopied(false); }
  };
  const doRevoke = async () => {
    if (!revoke) return;
    let disabled = false;
    const ok = await run('revoke', async () => { disabled = (await api.del<{ ok: boolean; requireBranchCodeDisabled: boolean }>(`/kiosks/${revoke.id}`)).requireBranchCodeDisabled; }, t('تم إلغاء ربط الجهاز', 'Kiosk revoked'));
    if (ok) {
      setRevoke(null);
      if (paired?.id === revoke.id) setPaired(null);
      void reload();
      if (disabled) window.setTimeout(() => window.alert(t('أُوقف «طلب رمز الفرع المتغير» لأنه لم يبقَ جهاز حضور يعرض الرمز.', '“Require the rotating branch code” was switched off: no kiosk shows the code any more.')), 50);
    }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={<span className="flex items-center gap-2"><MonitorSmartphone className="h-5 w-5 text-primary-500" />{t('أجهزة الحضور', 'Attendance kiosks')} — {branch.nameAr}</span>}>
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-ink-muted">
          {t('جهاز لوحي ثابت في الفرع: يبصم عليه الموظف برقمه الوظيفي ورمزه السري، ويعرض رمز الفرع المتغير للبصمة من الجوال. لا كاميرا ولا صور.', 'A fixed tablet in the branch: employees punch with their employee number and PIN, and it shows the rotating branch code for phone punches. No camera, no photos.')}
        </p>

        {paired && (
          <div className="rounded-2xl border-2 border-accent bg-accent-50 p-4">
            <p className="font-semibold text-night">{t('رمز الجهاز', 'Device code')} — {paired.name}</p>
            <p className="mt-1 text-sm text-ink-muted">{t('يظهر مرة واحدة فقط. افتح الرابط على جهاز الفرع والصق الرمز.', 'Shown only once. Open the link on the branch device and paste the code.')}</p>
            <div className="mt-3 flex items-stretch gap-2">
              <code className="min-w-0 flex-1 break-all rounded-xl bg-white px-3 py-2 font-mono text-sm text-ink ring-1 ring-line" dir="ltr">{paired.token}</code>
              <Button variant="secondary" onClick={copy} className="h-auto shrink-0">{copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}{copied ? t('نُسخ', 'Copied') : t('نسخ', 'Copy')}</Button>
            </div>
            <p className="mt-3 text-sm text-ink">{t('رابط الجهاز:', 'Kiosk link:')} <a href={withBase('/kiosk')} target="_blank" rel="noreferrer" className="font-medium text-primary-500 hover:underline" dir="ltr">{kioskUrl(origin)}</a></p>
          </div>
        )}

        <div className="flex flex-col gap-2 rounded-2xl bg-sand p-4 sm:flex-row sm:items-end">
          <Field label={t('اسم الجهاز الجديد', 'New device name')} error={nameErr ?? undefined} className="flex-1">
            <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t('جهاز المدخل', 'Entrance tablet')} onKeyDown={(e) => { if (e.key === 'Enter') void pair(); }} />
          </Field>
          <Button onClick={pair} loading={busy === 'pair'}><Plus className="h-4 w-4" />{t('ربط جهاز', 'Pair a device')}</Button>
        </div>

        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          {!data?.length ? <EmptyState title={t('لا توجد أجهزة حضور مربوطة بهذا الفرع', 'No kiosks paired with this branch')} /> : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {data.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">{k.name}
                      {k.revokedAt ? <Badge tone="neutral">{t('أُلغي الربط', 'Revoked')}</Badge> : <Badge tone="success">{t('نشط', 'Active')}</Badge>}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {t('رُبط', 'Paired')} {dateTime(k.createdAt, lang)} · {k.revokedAt ? `${t('أُلغي', 'Revoked')} ${dateTime(k.revokedAt, lang)}` : k.lastSeenAt ? `${t('آخر اتصال', 'Last seen')} ${dateTime(k.lastSeenAt, lang)}` : t('لم يتصل بعد', 'Not connected yet')}
                    </p>
                  </div>
                  {!k.revokedAt && (
                    <button type="button" onClick={() => setRevoke(k)} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-danger hover:bg-danger-50"><ShieldOff className="h-4 w-4" />{t('إلغاء الربط', 'Revoke')}</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Async>
      </div>
      <ConfirmModal open={!!revoke} onClose={() => setRevoke(null)} onConfirm={doRevoke} danger loading={busy === 'revoke'} confirmLabel={t('إلغاء الربط', 'Revoke')}
        title={t('إلغاء ربط الجهاز', 'Revoke kiosk')} message={t(`سيتوقف «${revoke?.name ?? ''}» عن العمل فوراً وسيحتاج ربطاً جديداً. متابعة؟`, `“${revoke?.name ?? ''}” stops working immediately and needs to be paired again. Continue?`)} />
    </Modal>
  );
}
