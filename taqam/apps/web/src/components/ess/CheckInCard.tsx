'use client';
import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Fingerprint, LocateFixed, LogIn, LogOut, MapPin, MapPinOff, RefreshCw, Timer, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { time as fmtTime, minutesToHours } from '@/lib/format';
import { label, ATTENDANCE_STATUS } from '@/lib/labels';
import { useToast } from '@/components/ui/Toast';
import type { MeHome } from './types';
import { formatDistance, haversineMeters } from './utils';
import { IS_DEMO } from '@/lib/paths';
import { getSimulateLocation, onSimulateLocationChange, setSimulateLocation } from '@/demo/location';

type Pos = { lat: number; lng: number; accuracy: number };
type Feedback = { kind: 'success' | 'error' | 'warning'; title: string; detail?: string } | null;

const GEO_OPTS: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };

function locate(): Promise<Pos> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { reject({ code: -1 }); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(e),
      GEO_OPTS,
    );
  });
}

/** Demo build only: optionally pretend the device is at the branch so visitors anywhere can try the geofenced punch. */
function useSimulatedLocation() {
  const [sim, setSim] = useState(false);
  useEffect(() => {
    if (!IS_DEMO) return;
    setSim(getSimulateLocation());
    return onSimulateLocationChange(() => setSim(getSimulateLocation()));
  }, []);
  return sim;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function CheckInCard({ home, onChanged }: { home: MeHome; onChanged: () => void }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const now = useNow(1000);
  const [pos, setPos] = useState<Pos | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const { today, branch } = home;
  const sim = useSimulatedLocation();
  const locateHere = useCallback(async (): Promise<Pos> => (sim && branch ? { lat: branch.lat, lng: branch.lng, accuracy: 5 } : locate()), [sim, branch]);
  const mode: 'in' | 'out' | 'done' = !today.checkIn ? 'in' : !today.checkOut ? 'out' : 'done';
  const distance = pos && branch ? haversineMeters(pos, branch) : null;
  const inside = distance !== null && branch ? distance <= branch.radiusMeters : null;

  const geoError = useCallback((e: unknown): Feedback => {
    const code = (e as { code?: number })?.code;
    if (code === 1) return { kind: 'error', title: t('تم رفض إذن الموقع', 'Location permission denied'), detail: t('فعّل صلاحية الموقع لهذا الموقع من إعدادات المتصفح ثم أعد المحاولة. البصمة تتطلب التحقق من وجودك في الفرع.', 'Enable location access for this site in browser settings and try again.') };
    if (code === 3) return { kind: 'error', title: t('انتهت مهلة تحديد الموقع', 'Location timed out'), detail: t('تأكد من تشغيل GPS وأنك في مكان مفتوح، ثم أعد المحاولة.', 'Make sure GPS is on and try again.') };
    if (code === -1) return { kind: 'error', title: t('جهازك لا يدعم تحديد الموقع', 'Geolocation not supported') };
    return { kind: 'error', title: t('تعذر تحديد موقعك', 'Could not get your location'), detail: t('تحقق من تشغيل خدمات الموقع ثم أعد المحاولة.', 'Check location services and retry.') };
  }, [t]);

  const refreshLocation = useCallback(async (silent = false) => {
    setLocating(true);
    try { const p = await locateHere(); setPos(p); if (!silent) setFeedback(null); return p; }
    catch (e) { if (!silent) setFeedback(geoError(e)); return null; }
    finally { setLocating(false); }
  }, [geoError, locateHere]);

  // Pre-fetch location only when permission was already granted (no surprise prompt).
  useEffect(() => {
    if (mode !== 'done' && sim) { void refreshLocation(true); return; }
    if (!sim && IS_DEMO) setPos(null);
    if (mode === 'done' || typeof navigator === 'undefined' || !navigator.permissions?.query) return;
    navigator.permissions.query({ name: 'geolocation' as PermissionName })
      .then((s) => { if (s.state === 'granted') void refreshLocation(true); })
      .catch(() => {});
  }, [mode, refreshLocation, sim]);

  const punch = async () => {
    if (mode === 'done' || busy) return;
    setBusy(true); setFeedback(null);
    try {
      let p: Pos;
      try { p = await locateHere(); setPos(p); }
      catch (e) { const f = geoError(e); setFeedback(f); if (f) toast(f.title, 'error'); return; }
      try {
        await api.post(`/me/attendance/${mode === 'in' ? 'check-in' : 'check-out'}`, { lat: p.lat, lng: p.lng });
        const msg = mode === 'in' ? t('تم تسجيل حضورك بنجاح', 'Checked in successfully') : t('تم تسجيل انصرافك بنجاح', 'Checked out successfully');
        setFeedback({ kind: 'success', title: msg, detail: `${t('الوقت', 'Time')}: ${fmtTime(new Date())}` });
        toast(msg);
        onChanged();
      } catch (e) {
        const err = e instanceof ApiError ? e : null;
        const d = branch ? haversineMeters(p, branch) : null;
        let f: Feedback;
        if (err?.status === 400) {
          f = { kind: 'error', title: err.messageAr || t('أنت خارج نطاق الفرع', 'You are outside the branch geofence'),
            detail: d !== null && branch ? t(`تبعد ${formatDistance(d, 'ar')} عن الفرع، والنطاق المسموح ${branch.radiusMeters} م. اقترب من الفرع وأعد المحاولة.`, `You are ${formatDistance(d, 'en')} away; allowed radius is ${branch.radiusMeters} m.`) : undefined };
        } else if (err?.status === 409) {
          f = { kind: 'warning', title: err.messageAr || (mode === 'in' ? t('سجّلت حضورك مسبقاً اليوم', 'Already checked in today') : t('سجّلت انصرافك مسبقاً', 'Already checked out')) };
          onChanged();
        } else {
          f = { kind: 'error', title: err?.display || t('تعذر إتمام البصمة', 'Punch failed'), detail: t('حاول مرة أخرى بعد قليل.', 'Please try again shortly.') };
        }
        setFeedback(f);
        toast(f.title, f.kind === 'warning' ? 'info' : 'error');
      }
    } finally { setBusy(false); }
  };

  // Worked time today (live while checked in).
  let workedMin = 0;
  if (today.checkIn) {
    const start = new Date(today.checkIn).getTime();
    const end = today.checkOut ? new Date(today.checkOut).getTime() : (now?.getTime() ?? start);
    workedMin = Math.max(0, Math.floor((end - start) / 60000));
  }

  const clock = now ? now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Riyadh' }) : '--:--:--';
  const gDate = now ? now.toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Riyadh' }) : '';
  const hDate = now ? now.toLocaleDateString('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }) : '';

  const btn = {
    in: { label: t('تسجيل الحضور', 'Check in'), icon: LogIn, cls: 'bg-accent text-primary ess-pulse' },
    out: { label: t('تسجيل الانصراف', 'Check out'), icon: LogOut, cls: 'bg-white text-primary' },
    done: { label: t('اكتمل يومك', 'Day complete'), icon: CheckCircle2, cls: 'bg-white/15 text-white' },
  }[mode];
  const BtnIcon = btn.icon;

  return (
    <div className="relative overflow-hidden rounded-[28px] bg-primary text-white shadow-lift">
      {/* subtle najdi pattern */}
      <div className="taqam-pattern pointer-events-none absolute inset-0 opacity-30" aria-hidden />
      <div className="relative px-5 pb-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="num text-[34px] font-bold leading-none tracking-tight" dir="ltr">{clock}</p>
            <p className="mt-2 text-sm text-white/80">{gDate}</p>
            {lang === 'ar' && <p className="text-xs text-white/55">{hDate}</p>}
          </div>
          {today.status && (
            <span className="rounded-full bg-white/[.12] px-3 py-1 text-xs font-medium text-accent ring-1 ring-white/15">
              {label(ATTENDANCE_STATUS, today.status, lang)}
            </span>
          )}
        </div>

        {/* Shift */}
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/[.08] px-3 py-2.5 text-sm ring-1 ring-white/10">
          <Timer className="h-4 w-4 shrink-0 text-accent" />
          {today.shift ? (
            <span className="flex-1">
              <span className="font-semibold">{today.shift.name}</span>
              <span className="num text-white/75"> · <span dir="ltr">{today.shift.startTime} – {today.shift.endTime}</span></span>
            </span>
          ) : <span className="flex-1 text-white/75">{t('لا توجد وردية مجدولة اليوم', 'No shift scheduled today')}</span>}
          {home.employee.branchName && <span className="truncate text-xs text-white/60">{home.employee.branchName}</span>}
        </div>

        {/* Big punch button */}
        <div className="flex flex-col items-center pb-1 pt-6">
          <button onClick={punch} disabled={mode === 'done' || busy}
            className={clsx('relative grid h-44 w-44 place-items-center rounded-full shadow-lift ring-[10px] ring-white/10 transition active:scale-95 disabled:active:scale-100', btn.cls)}
            aria-label={btn.label}>
            <span className="flex flex-col items-center gap-2">
              {busy ? <span className="h-12 w-12 animate-spin rounded-full border-4 border-current border-t-transparent opacity-70" />
                : mode === 'done' ? <BtnIcon className="h-12 w-12" /> : <Fingerprint className="h-14 w-14" strokeWidth={1.6} />}
              <span className="text-lg font-bold">{busy ? t('جارٍ التحقق…', 'Verifying…') : btn.label}</span>
              {!busy && mode !== 'done' && <span className="flex items-center gap-1 text-xs opacity-70"><BtnIcon className="h-3.5 w-3.5" />{t('بالموقع', 'with location')}</span>}
            </span>
          </button>

          {/* Location status */}
          {mode !== 'done' && branch && (
            <button onClick={() => void refreshLocation()} disabled={locating}
              className={clsx('mt-5 flex min-h-[40px] items-center gap-2 rounded-full px-4 text-xs font-medium ring-1 transition',
                inside === null ? 'bg-white/[.08] text-white/80 ring-white/15' : inside ? 'bg-success/25 text-white ring-success/50' : 'bg-danger/25 text-white ring-danger/50')}>
              {locating ? <RefreshCw className="h-4 w-4 animate-spin" /> : inside === false ? <MapPinOff className="h-4 w-4" /> : distance !== null ? <MapPin className="h-4 w-4" /> : <LocateFixed className="h-4 w-4" />}
              {distance === null
                ? t('تحديد موقعي والمسافة من الفرع', 'Locate me & distance to branch')
                : <span className="num">{inside ? t('داخل نطاق الفرع', 'Inside branch zone') : t('خارج نطاق الفرع', 'Outside branch zone')} · {formatDistance(distance, lang)}{pos && pos.accuracy > 50 ? ` (±${Math.round(pos.accuracy)}${lang === 'ar' ? 'م' : 'm'})` : ''}</span>}
            </button>
          )}
        </div>

        {IS_DEMO && mode !== 'done' && branch && (
          <label className="mx-auto mt-3 flex w-fit cursor-pointer items-center gap-2 rounded-full bg-white/[.08] px-3 py-1.5 text-xs text-white/85 ring-1 ring-white/15">
            <input type="checkbox" className="h-4 w-4 accent-[#F2A541]" checked={sim} onChange={(e) => setSimulateLocation(e.target.checked)} />
            {t('محاكاة الموقع داخل الفرع', 'Simulate being at the branch')}
            <span className="rounded-full bg-accent/20 px-1.5 text-[10px] text-accent">{t('تجريبي', 'demo')}</span>
          </label>
        )}

        {feedback && (
          <div role="status" className={clsx('mt-4 flex gap-2.5 rounded-2xl p-3 text-sm',
            feedback.kind === 'success' ? 'bg-success-50 text-success' : feedback.kind === 'warning' ? 'bg-warning-50 text-[#7a5c00]' : 'bg-danger-50 text-danger')}>
            {feedback.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0" />}
            <div>
              <p className="font-semibold">{feedback.title}</p>
              {feedback.detail && <p className="mt-0.5 text-[13px] opacity-90">{feedback.detail}</p>}
            </div>
          </div>
        )}

        {/* Times */}
        <div className="mt-4 grid grid-cols-3 divide-x divide-white/10 rounded-2xl bg-white/[.08] py-3 text-center ring-1 ring-white/10 rtl:divide-x-reverse">
          <TimeCell label={t('الحضور', 'In')} value={fmtTime(today.checkIn)} />
          <TimeCell label={t('الانصراف', 'Out')} value={fmtTime(today.checkOut)} />
          <TimeCell label={t('ساعات العمل', 'Worked')} value={today.checkIn ? minutesToHours(workedMin) : '—'} highlight={mode === 'out'} />
        </div>
      </div>
    </div>
  );
}

function TimeCell({ label: l, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-white/60">{l}</p>
      <p className={clsx('num mt-0.5 text-lg font-bold', highlight && 'text-accent')} dir="ltr">{value}</p>
    </div>
  );
}
