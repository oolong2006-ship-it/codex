'use client';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CloudOff, Fingerprint, KeyRound, LocateFixed, LogIn, LogOut, MapPin, MapPinOff, RefreshCw, Timer, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { time as fmtTime, minutesToHours } from '@/lib/format';
import { label, ATTENDANCE_STATUS } from '@/lib/labels';
import { useToast } from '@/components/ui/Toast';
import type { MeHome } from './types';
import { formatDistance, haversineMeters } from './utils';
import { IS_DEMO } from '@/lib/paths';
import { getSimulateLocation, onSimulateLocationChange, setSimulateLocation } from '@/demo/location';
import { enqueuePunch, flushPunches, pendingPunches, type QueuedPunch } from '@/lib/offlineQueue';
import { isAwaitingDevice, isPermanentPunchError, punchMode, riyadhDate, sendQueuedPunch } from './punch';

const OFFLINE_BANNER: [string, string] = ['لا يوجد اتصال — سيُرسل التسجيل تلقائياً عند عودة الاتصال', 'No connection — the punch will be sent automatically when you are back online'];
const RETRY_MS = 60_000;
const BRANCH_CODE_MISSING: [string, string] = ['أدخل رمز الفرع الظاهر على شاشة الحضور', 'Enter the branch code shown on the attendance screen'];

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return;
    setOnline(navigator.onLine !== false);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

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
  const [branchCode, setBranchCode] = useState('');
  const [pending, setPending] = useState<QueuedPunch[]>([]);
  const [othersQueued, setOthersQueued] = useState(0);
  const [awaitingDevice, setAwaitingDevice] = useState(false);
  const online = useOnline();
  const { user } = useAuth();
  /** queued punches belong to this employee: a shared browser never replays someone else's punch with this session */
  const employeeId = home.employee.id ?? user?.employeeId ?? null;

  const { today, branch } = home;
  const requireCode = !!home.attendancePolicy?.requireBranchCode;
  const sim = useSimulatedLocation();
  const locateHere = useCallback(async (): Promise<Pos> => (sim && branch ? { lat: branch.lat, lng: branch.lng, accuracy: 5 } : locate()), [sim, branch]);
  const todayDate = today.date ?? (now ? riyadhDate(now) : riyadhDate(new Date()));
  const mode = punchMode(today, pending, todayDate);
  const queuedTime = (k: 'IN' | 'OUT') => pending.find((p) => p.kind === k && riyadhDate(p.capturedAt) === todayDate)?.capturedAt ?? null;

  // ---- offline queue: replay on load and whenever the connection comes back ----
  const refreshQueue = useCallback(async () => {
    if (!employeeId) return;
    const [mine, all] = await Promise.all([pendingPunches(employeeId), pendingPunches()]);
    setPending(mine);
    setOthersQueued(all.length - mine.length);
  }, [employeeId]);

  const flush = useCallback(async () => {
    if (!employeeId) return null;
    const res = await flushPunches((p) => sendQueuedPunch(p, (path, body) => api.post(path, body)), {
      employeeId,
      isPermanent: (e, p) => isPermanentPunchError(e, p),
      onRejected: (p, e) => {
        const msg = e instanceof ApiError ? e.display : '';
        const title = p.kind === 'IN' ? t('تعذّر إرسال بصمة الحضور المسجلة دون اتصال', 'An offline check-in was refused') : t('تعذّر إرسال بصمة الانصراف المسجلة دون اتصال', 'An offline check-out was refused');
        setFeedback({ kind: 'error', title, detail: `${msg}${msg ? ' — ' : ''}${t('الوقت', 'Time')}: ${fmtTime(p.capturedAt)}` });
        toast(title, 'error');
      },
    });
    await refreshQueue();
    setAwaitingDevice(res.failed > 0 && isAwaitingDevice(res.lastError));
    if (res.sent > 0) {
      toast(t('تم إرسال البصمات المسجلة دون اتصال', 'Offline punches sent'));
      onChanged();
    }
    return res;
  }, [employeeId, onChanged, refreshQueue, t, toast]);

  useEffect(() => {
    void refreshQueue().catch(() => {});
  }, [refreshQueue]);
  // latest flush without re-running the effects when the parent passes a new onChanged
  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; }, [flush]);
  useEffect(() => {
    if (online) void flushRef.current().catch(() => {});
  }, [online]);
  // while punches wait: retry every minute and whenever the app comes back to the foreground
  const hasPending = pending.length > 0;
  useEffect(() => {
    if (!online || !hasPending || typeof window === 'undefined') return;
    const id = window.setInterval(() => void flushRef.current().catch(() => {}), RETRY_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void flushRef.current().catch(() => {}); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [online, hasPending]);

  const queuePunch = async (kind: 'IN' | 'OUT', p: Pos, capturedAt: string) => {
    try {
      if (!employeeId) throw new Error('no employee');
      const code = branchCode.trim();
      await enqueuePunch({ kind, lat: p.lat, lng: p.lng, capturedAt, employeeId, ...(code ? { branchCode: code } : {}) });
      setBranchCode('');
      await refreshQueue();
      const f: Feedback = { kind: 'warning', title: t(...OFFLINE_BANNER), detail: `${t('وقت البصمة المحفوظ', 'Saved punch time')}: ${fmtTime(capturedAt)}` };
      setFeedback(f);
      toast(f.title, 'info');
    } catch {
      // never lose a punch silently: nothing on this device can hold it
      const f: Feedback = { kind: 'error', title: t('تعذّر حفظ البصمة على هذا الجهاز دون اتصال', 'This device cannot keep the punch offline'), detail: t('اتصل بالإنترنت ثم أعد المحاولة — لم تُسجَّل البصمة.', 'Connect to the internet and try again — the punch was not recorded.') };
      setFeedback(f);
      toast(f.title, 'error');
    }
  };
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
      const kind = mode === 'in' ? 'IN' : 'OUT';
      const capturedAt = new Date().toISOString();
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { await queuePunch(kind, p, capturedAt); return; }
      // earlier offline punches first, so this one never overtakes them
      if (pending.length) await flush().catch(() => null);
      if (requireCode && !branchCode.trim()) {
        const f: Feedback = { kind: 'error', title: t(...BRANCH_CODE_MISSING) };
        setFeedback(f); toast(f.title, 'error');
        return;
      }
      try {
        await api.post(`/me/attendance/${mode === 'in' ? 'check-in' : 'check-out'}`, { lat: p.lat, lng: p.lng, ...(requireCode ? { branchCode: branchCode.trim() } : {}) });
        setBranchCode('');
        const msg = mode === 'in' ? t('تم تسجيل حضورك بنجاح', 'Checked in successfully') : t('تم تسجيل انصرافك بنجاح', 'Checked out successfully');
        setFeedback({ kind: 'success', title: msg, detail: `${t('الوقت', 'Time')}: ${fmtTime(new Date())}` });
        toast(msg);
        onChanged();
      } catch (e) {
        const err = e instanceof ApiError ? e : null;
        if (err?.status === 0) { await queuePunch(kind, p, capturedAt); return; } // connection dropped: keep it for later
        const d = branch ? haversineMeters(p, branch) : null;
        const isGeofence = !!err && typeof (err.body as { distanceMeters?: unknown } | undefined)?.distanceMeters === 'number';
        let f: Feedback;
        if (err?.status === 400 && isGeofence) {
          f = { kind: 'error', title: err.messageAr || t('أنت خارج نطاق الفرع', 'You are outside the branch geofence'),
            detail: d !== null && branch ? t(`تبعد ${formatDistance(d, 'ar')} عن الفرع، والنطاق المسموح ${branch.radiusMeters} م. اقترب من الفرع وأعد المحاولة.`, `You are ${formatDistance(d, 'en')} away; allowed radius is ${branch.radiusMeters} m.`) : undefined };
        } else if (err?.status === 400) {
          f = { kind: 'error', title: err.display };
        } else if (err?.status === 403) {
          f = { kind: 'error', title: err.display, detail: (err.body as { code?: string } | undefined)?.code === 'DEVICE_NOT_REGISTERED' ? t('أُرسل طلب اعتماد هذا الجهاز إلى الموارد البشرية، ويمكنك البصمة منه بعد الاعتماد.', 'A request to approve this device was sent to HR; you can punch from it once approved.') : undefined };
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
  const inAt = today.checkIn ?? queuedTime('IN');
  const outAt = today.checkOut ?? queuedTime('OUT');
  if (inAt) {
    const start = new Date(inAt).getTime();
    const end = outAt ? new Date(outAt).getTime() : (now?.getTime() ?? start);
    workedMin = Math.max(0, Math.floor((end - start) / 60000));
  }

  const clock = now ? now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Riyadh' }) : '--:--:--';
  const gDate = now ? now.toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Riyadh' }) : '';
  const hDate = now ? now.toLocaleDateString('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }) : '';

  const btn = {
    in: { label: t('تسجيل الحضور', 'Check in'), icon: LogIn, cls: 'bg-accent text-night ess-pulse' },
    out: { label: t('تسجيل الانصراف', 'Check out'), icon: LogOut, cls: 'bg-white text-primary' },
    done: { label: t('اكتمل يومك', 'Day complete'), icon: CheckCircle2, cls: 'bg-white/15 text-white' },
  }[mode];
  const BtnIcon = btn.icon;

  return (
    <div className="relative overflow-hidden rounded-[28px] bg-night text-white shadow-lift">
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

          {requireCode && mode !== 'done' && (
            <label className="mt-5 flex w-full max-w-[260px] flex-col items-center gap-1.5">
              <span className="flex items-center gap-1.5 text-xs text-white/75"><KeyRound className="h-3.5 w-3.5" />{online ? t('رمز الفرع الظاهر على شاشة الحضور', 'Branch code on the attendance screen') : t('رمز الفرع إن كان ظاهراً على الشاشة (يُحفظ مع البصمة)', 'Branch code if shown on the screen (saved with the punch)')}</span>
              <input value={branchCode} onChange={(e) => setBranchCode(e.target.value.replace(/[^\d٠-٩]/g, '').slice(0, 6))}
                inputMode="numeric" autoComplete="one-time-code" dir="ltr" placeholder="••••••" aria-label={t('رمز الفرع', 'Branch code')}
                className="num h-12 w-full rounded-2xl bg-white/[.1] text-center text-2xl font-bold tracking-[0.4em] text-white placeholder:text-white/30 ring-1 ring-white/20 focus:outline-none focus:ring-2 focus:ring-accent" />
            </label>
          )}

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
            <input type="checkbox" className="h-4 w-4 accent-[#14D1C3]" checked={sim} onChange={(e) => setSimulateLocation(e.target.checked)} />
            {t('محاكاة الموقع داخل الفرع', 'Simulate being at the branch')}
            <span className="rounded-full bg-accent/20 px-1.5 text-[10px] text-accent">{t('تجريبي', 'demo')}</span>
          </label>
        )}

        {othersQueued > 0 && (
          <p className="mt-3 text-center text-xs text-white/60">{t('توجد بصمات محفوظة لمستخدم آخر على هذا المتصفح — ستُرسل عندما يسجّل دخوله.', 'Another user has punches saved on this browser — they are sent when that user signs in.')}</p>
        )}

        {(!online || pending.length > 0) && (
          <div role="status" className="mt-4 flex items-start gap-2.5 rounded-2xl bg-warning-50 p-3 text-sm text-[#7a5c00]">
            <CloudOff className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">{!online ? t(...OFFLINE_BANNER) : awaitingDevice ? t('بانتظار اعتماد الجهاز', 'Waiting for device approval') : t(`بانتظار إرسال ${pending.length} بصمة مسجلة دون اتصال`, `${pending.length} offline punch(es) waiting to be sent`)}</p>
              {online && awaitingDevice && <p className="mt-0.5 text-[13px] opacity-90">{t('ستُرسل البصمات المحفوظة تلقائياً بعد أن تعتمد الموارد البشرية هذا الجهاز (خلال 12 ساعة من وقتها).', 'Saved punches are sent automatically once HR approves this device (within 12 hours of their time).')}</p>}
              {pending.length > 0 && <p className="num mt-0.5 text-[13px] opacity-90">{pending.map((p) => `${p.kind === 'IN' ? t('حضور', 'In') : t('انصراف', 'Out')} ${fmtTime(p.capturedAt)}`).join(' · ')}</p>}
            </div>
            {online && pending.length > 0 && (
              <button onClick={() => void flush()} className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-xs font-medium">{t('إرسال الآن', 'Send now')}</button>
            )}
          </div>
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
          <TimeCell label={t('الحضور', 'In')} value={fmtTime(today.checkIn ?? queuedTime('IN'))} />
          <TimeCell label={t('الانصراف', 'Out')} value={fmtTime(today.checkOut ?? queuedTime('OUT'))} />
          <TimeCell label={t('ساعات العمل', 'Worked')} value={inAt ? minutesToHours(workedMin) : '—'} highlight={mode === 'out'} />
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
