'use client';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Delete, KeyRound, Loader2, LogIn, LogOut, Maximize, MonitorSmartphone, ShieldAlert, WifiOff } from 'lucide-react';
import { LogoMark } from '@/components/ui/LogoMark';
import { ApiError } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { IS_DEMO } from '@/lib/paths';
import { DEMO_KIOSK_EMPLOYEE_NUMBER, DEMO_KIOSK_PIN, DEMO_KIOSK_TOKEN, isKioskToken, keypadAppend, normalizeDigits } from '@/lib/kiosk';
import { getKioskToken, isTokenRejected, kioskRequest, setKioskToken, type KioskInfo, type KioskPunchResult } from '@/lib/kioskClient';

const RESULT_MS = 5000;
const IDLE_MS = 30_000;
const NUMBER_MAX = 10;
const PIN_MAX = 6;

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.display : fallback);

/**
 * The branch kiosk: a paired shared tablet. Employees type their employee number and PIN on a large keypad; the
 * screen also shows the rotating branch code (30 s) that ESS punches may require. Never uses the camera.
 */
export function KioskScreen() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => { setToken(getKioskToken()); }, []);
  const unpair = useCallback(() => { setKioskToken(null); setToken(null); }, []);
  return (
    <div className="min-h-screen bg-night text-white" dir="rtl">
      {token === undefined ? (
        <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-white/60" /></div>
      ) : token ? (
        <PunchScreen token={token} onRejected={unpair} />
      ) : (
        <PairingScreen onPaired={(t) => { setKioskToken(t); setToken(t.trim().toLowerCase()); }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- pairing
function PairingScreen({ onPaired }: { onPaired: (token: string) => void }) {
  const { t } = useLang();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pair = async (raw: string) => {
    const value = raw.replace(/\s+/g, '').toLowerCase();
    if (!isKioskToken(value)) { setError(t('رمز الجهاز يتكون من 64 حرفاً ورقماً — انسخه كما ظهر عند الربط', 'The device code is 64 letters and digits — copy it exactly as shown when pairing')); return; }
    setBusy(true);
    setError(null);
    try {
      await kioskRequest<KioskInfo>('GET', '/kiosk/me', value);
      onPaired(value);
    } catch (e) {
      setError(isTokenRejected(e) ? t('رمز الجهاز غير صحيح أو أُلغي ربطه', 'This device code is wrong or was revoked') : errText(e, t('تعذر الاتصال بالخادم', 'Could not reach the server')));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <div className="flex items-center gap-3">
        <LogoMark size={52} />
        <div>
          <p className="text-sm text-white/60">{t('شؤون', 'Shuoon')}</p>
          <h1 className="font-display text-2xl font-bold">{t('جهاز الحضور في الفرع', 'Branch attendance kiosk')}</h1>
        </div>
      </div>
      <form className="mt-10 rounded-3xl bg-white p-6 text-ink shadow-lift sm:p-8" onSubmit={(e) => { e.preventDefault(); void pair(code); }}>
        <label htmlFor="kiosk-code" className="flex items-center gap-2 font-display text-xl font-bold"><KeyRound className="h-6 w-6 text-primary" />{t('أدخل رمز الجهاز', 'Enter the device code')}</label>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {t('يظهر الرمز مرة واحدة عند ربط الجهاز من «الفروع ← أجهزة الحضور». يُحفظ على هذا الجهاز فقط ولا يحتاج تسجيل دخول.', 'The code is shown once when the device is paired under “Branches → Attendance kiosks”. It is stored on this device only; no login needed.')}
        </p>
        <textarea id="kiosk-code" value={code} onChange={(e) => setCode(e.target.value)} rows={3} dir="ltr" spellCheck={false} autoComplete="off" autoCapitalize="off"
          className="mt-5 w-full resize-none rounded-2xl border border-line bg-sand px-4 py-3 font-mono text-base tracking-wider text-ink outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          placeholder="e.g. 3f9a…" />
        {error && <p role="alert" className="mt-3 rounded-xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger">{error}</p>}
        <button type="submit" disabled={busy || !code.trim()} className="mt-5 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-bold text-white transition-colors hover:bg-primary-600 disabled:opacity-50">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <MonitorSmartphone className="h-5 w-5" />}{t('ربط الجهاز', 'Pair this device')}
        </button>
        {IS_DEMO && (
          <button type="button" disabled={busy} onClick={() => { setCode(DEMO_KIOSK_TOKEN); void pair(DEMO_KIOSK_TOKEN); }}
            className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-2xl border border-accent bg-accent-50 text-base font-semibold text-night transition-colors hover:bg-accent-100 disabled:opacity-50">
            {t('عرض تجريبي: استخدم جهاز «فرع العليا»', 'Demo: use the «Olaya branch» kiosk')}
          </button>
        )}
      </form>
      <p className="mt-6 text-center text-xs text-white/50">{t('لا كاميرا ولا صور — رقم الموظف ورمزه السري فقط', 'No camera, no photos — employee number and PIN only')}</p>
    </main>
  );
}

// ---------------------------------------------------------------- punching
type Step = 'number' | 'pin';
type Notice = { tone: 'error' | 'locked'; text: string } | null;

function PunchScreen({ token, onRejected }: { token: string; onRejected: () => void }) {
  const { t, lang } = useLang();
  const [info, setInfo] = useState<KioskInfo | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [step, setStep] = useState<Step>('number');
  const [number, setNumber] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [result, setResult] = useState<KioskPunchResult | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const lastInput = useRef(Date.now());

  // branch info + rotating code: refreshed when the code expires (and every 10 s while offline)
  const load = useCallback(async () => {
    try {
      const i = await kioskRequest<KioskInfo>('GET', '/kiosk/me', token);
      setInfo(i);
      setFetchedAt(Date.now());
      setOffline(false);
    } catch (e) {
      if (isTokenRejected(e)) onRejected();
      else setOffline(true);
    }
  }, [token, onRejected]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const secondsLeft = info ? Math.max(0, info.codeExpiresInSeconds - Math.floor((now.getTime() - fetchedAt) / 1000)) : 0;
  useEffect(() => {
    if (!info) return;
    if (secondsLeft <= 0) void load();
  }, [info, secondsLeft, load]);
  useEffect(() => {
    if (!offline) return;
    const id = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(id);
  }, [offline, load]);

  const reset = useCallback(() => { setStep('number'); setNumber(''); setPin(''); setNotice(null); }, []);

  // success screen for 5 s, then back to the keypad; half-typed input is cleared after 30 s idle (privacy)
  useEffect(() => {
    if (!result) return;
    const id = window.setTimeout(() => { setResult(null); reset(); }, RESULT_MS);
    return () => window.clearTimeout(id);
  }, [result, reset]);
  useEffect(() => {
    if ((number || pin || notice) && !result && Date.now() - lastInput.current > IDLE_MS) reset();
  }, [now, number, pin, notice, result, reset]);

  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const submit = useCallback(async () => {
    if (busy || !number || pin.length < 4) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await kioskRequest<KioskPunchResult>('POST', '/kiosk/punch', token, { employeeNumber: number, pin });
      setResult(r);
    } catch (e) {
      if (isTokenRejected(e)) { onRejected(); return; }
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 423) { reset(); setNotice({ tone: 'locked', text: errText(e, '') }); }
      else if (status === 401) { setPin(''); setStep('pin'); setNotice({ tone: 'error', text: errText(e, '') }); }
      else { reset(); setNotice({ tone: 'error', text: status === 0 ? t('تعذر الاتصال بالخادم — حاول مرة أخرى', 'Could not reach the server — try again') : errText(e, '') }); }
    } finally {
      setBusy(false);
      lastInput.current = Date.now();
    }
  }, [busy, number, pin, token, onRejected, reset, t]);

  const press = useCallback((key: string) => {
    if (result || busy) return;
    lastInput.current = Date.now();
    if (key === 'back') {
      if (step === 'pin') { if (pin) setPin((p) => p.slice(0, -1)); else setStep('number'); }
      else setNumber((n) => n.slice(0, -1));
      return;
    }
    if (key === 'clear') { reset(); return; }
    if (key === 'ok') {
      if (step === 'number') { if (number) { setStep('pin'); setNotice(null); } }
      else void submit();
      return;
    }
    if (step === 'number') setNumber((n) => keypadAppend(n, key, NUMBER_MAX));
    else setPin((p) => keypadAppend(p, key, PIN_MAX));
  }, [result, busy, step, pin, number, reset, submit]);

  // physical keyboard (Arabic-Indic digits too)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const d = normalizeDigits(e.key);
      if (/^\d$/.test(d)) { e.preventDefault(); press(d); }
      else if (e.key === 'Backspace') { e.preventDefault(); press('back'); }
      else if (e.key === 'Enter') { e.preventDefault(); press('ok'); }
      else if (e.key === 'Escape') press('clear');
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [press]);

  const goFullscreen = () => { void document.documentElement.requestFullscreen?.().catch(() => undefined); };
  const locale = lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB';
  const clock = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' });
  const today = now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' });
  const demo = IS_DEMO && token === DEMO_KIOSK_TOKEN;

  return (
    <div className="flex min-h-screen flex-col">
      {/* header: branch + clock */}
      <header className="flex items-center justify-between gap-4 px-5 pb-2 pt-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <LogoMark size={44} />
          <div className="min-w-0">
            <p className="truncate text-sm text-white/60">{info?.companyName ?? '…'}</p>
            <h1 className="truncate font-display text-xl font-bold sm:text-2xl">{info?.branchName ?? t('جهاز الحضور', 'Attendance kiosk')}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-end">
            <p className="num font-display text-3xl font-bold leading-none tracking-tight sm:text-4xl" dir="ltr">{clock}</p>
            <p className="mt-1 text-xs text-white/60 sm:text-sm">{today}</p>
          </div>
          {!fullscreen && (
            <button type="button" onClick={goFullscreen} className="hidden h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white/80 hover:bg-white/20 sm:inline-flex" aria-label={t('ملء الشاشة', 'Full screen')} title={t('ملء الشاشة', 'Full screen')}>
              <Maximize className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      {offline && (
        <div role="status" className="mx-5 mt-2 flex items-center gap-2 rounded-2xl bg-warning px-4 py-3 text-sm font-semibold text-night sm:mx-8">
          <WifiOff className="h-5 w-5 shrink-0" />{t('لا يوجد اتصال بالخادم — نعيد المحاولة تلقائياً', 'No connection to the server — retrying automatically')}
        </div>
      )}

      <main className="grid flex-1 grid-cols-1 content-start gap-4 px-5 pb-20 pt-3 sm:px-8 lg:pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start lg:gap-8">
        <BranchCodeCard info={info} secondsLeft={secondsLeft} />

        {/* entry */}
        <section className="rounded-3xl bg-white p-5 text-ink shadow-lift sm:p-7" aria-label={t('تسجيل الحضور والانصراف', 'Check in / out')}>
          <div className="grid grid-cols-2 gap-3">
            <EntryField label={t('رقم الموظف', 'Employee number')} active={step === 'number'} onClick={() => { setStep('number'); setPin(''); lastInput.current = Date.now(); }}>
              {number ? <span className="num" dir="ltr">{number}</span> : <span className="text-ink-soft">—</span>}
            </EntryField>
            <EntryField label={t('الرمز السري (PIN)', 'PIN')} active={step === 'pin'} onClick={() => { if (number) setStep('pin'); lastInput.current = Date.now(); }}>
              <span className="flex items-center gap-1.5" dir="ltr" aria-label={t(`${pin.length} أرقام`, `${pin.length} digits`)}>
                {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
                  <span key={i} className={clsx('h-3.5 w-3.5 rounded-full', i < pin.length ? 'bg-night' : 'bg-sand-200')} />
                ))}
              </span>
            </EntryField>
          </div>

          <p className="mt-2 min-h-[1.25rem] text-center text-sm text-ink-muted lg:mt-3">
            {step === 'number' ? t('اكتب رقمك الوظيفي ثم «التالي»', 'Type your employee number, then “Next”') : t('اكتب رمزك السري (4–6 أرقام) ثم «تسجيل»', 'Type your PIN (4–6 digits), then “Punch”')}
          </p>

          {notice && (
            <div role="alert" className={clsx('mt-2 flex items-start gap-2 rounded-2xl px-4 py-3 text-base font-semibold', notice.tone === 'locked' ? 'bg-warning-50 text-night' : 'bg-danger-50 text-danger')}>
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />{notice.text}
            </div>
          )}

          <Keypad onPress={press} disabled={busy}
            okLabel={step === 'number' ? t('التالي', 'Next') : t('تسجيل', 'Punch')}
            okDisabled={step === 'number' ? !number : pin.length < 4}
            busy={busy} labels={{ clear: t('مسح', 'Clear'), back: t('حذف', 'Delete') }} />

          {demo && (
            <p className="mt-3 rounded-2xl border border-dashed border-accent bg-accent-50 px-4 py-2.5 text-center text-sm text-night lg:mt-4">
              {t('عرض تجريبي: رقم الموظف', 'Demo: employee number')} <b className="num" dir="ltr">{DEMO_KIOSK_EMPLOYEE_NUMBER}</b> {t('(سعود الدوسري) والرمز', '(Saud Al-Dosari), PIN')} <b className="num" dir="ltr">{DEMO_KIOSK_PIN}</b>
              {t(' — كل موظفي فرع العليا رمزهم 1234', ' — every Olaya employee has PIN 1234')}
            </p>
          )}
        </section>
      </main>

      {result && <ResultOverlay result={result} onDone={() => { setResult(null); reset(); }} />}
    </div>
  );
}

function EntryField({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={clsx('flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-3 transition-colors lg:h-24 lg:gap-2', active ? 'border-primary bg-primary-50' : 'border-line bg-sand')}>
      <span className="text-sm font-medium text-ink-muted">{label}</span>
      <span className="font-display text-3xl font-bold tracking-[0.15em] text-ink">{children}</span>
    </button>
  );
}

function Keypad({ onPress, disabled, okLabel, okDisabled, busy, labels }:
  { onPress: (k: string) => void; disabled: boolean; okLabel: string; okDisabled: boolean; busy: boolean; labels: { clear: string; back: string } }) {
  const key = 'flex h-16 items-center justify-center rounded-2xl text-3xl font-bold transition-colors active:scale-[0.98] disabled:opacity-50 lg:h-[4.5rem]';
  return (
    <div className="mt-4" dir="ltr">
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" disabled={disabled} onClick={() => onPress(d)} className={clsx(key, 'num bg-sand text-ink hover:bg-sand-200')}>{d}</button>
        ))}
        <button type="button" disabled={disabled} onClick={() => onPress('clear')} className={clsx(key, 'bg-white text-lg text-ink-muted ring-1 ring-line hover:bg-sand')} dir="rtl">{labels.clear}</button>
        <button type="button" disabled={disabled} onClick={() => onPress('0')} className={clsx(key, 'num bg-sand text-ink hover:bg-sand-200')}>0</button>
        <button type="button" disabled={disabled} onClick={() => onPress('back')} className={clsx(key, 'bg-white text-ink-muted ring-1 ring-line hover:bg-sand')} aria-label={labels.back}><Delete className="h-7 w-7" /></button>
      </div>
      <button type="button" disabled={disabled || okDisabled} onClick={() => onPress('ok')} dir="rtl"
        className="mt-3 inline-flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-2xl font-bold text-white transition-colors hover:bg-primary-600 disabled:opacity-40 lg:h-[4.5rem]">
        {busy && <Loader2 className="h-6 w-6 animate-spin" />}{okLabel}
      </button>
    </div>
  );
}

function BranchCodeCard({ info, secondsLeft }: { info: KioskInfo | null; secondsLeft: number }) {
  const { t } = useLang();
  const r = 26;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, Math.max(0, secondsLeft / 30));
  const code = info?.branchCode ?? '------';
  const ring = (
    <div className="relative h-14 w-14 shrink-0 lg:h-16 lg:w-16" title={t('يتغير الرمز كل 30 ثانية', 'The code changes every 30 seconds')}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" className={secondsLeft <= 5 ? 'text-warning' : 'text-accent'}
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: 'stroke-dashoffset 0.9s linear' }} />
      </svg>
      <span className="num absolute inset-0 flex items-center justify-center text-base font-bold lg:text-lg" aria-label={t(`يتغير خلال ${secondsLeft} ثانية`, `Changes in ${secondsLeft} s`)}>{info ? secondsLeft : '–'}</span>
    </div>
  );
  return (
    <section className="rounded-3xl bg-night-800 p-4 ring-1 ring-white/10 sm:p-5 lg:p-7" aria-live="polite" aria-label={t('رمز الفرع', 'Branch code')}>
      {/* portrait tablets / phones: one compact row so the keypad stays on screen */}
      <div className="flex items-center gap-4 lg:hidden">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold sm:text-lg">{t('رمز الفرع', 'Branch code')}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-white/65 sm:text-sm">{t('للبصمة من جوالك: أدخل هذا الرمز في تطبيق شؤون', 'Punching from your phone? Enter this code in the Shuoon app')}</p>
        </div>
        <p className="num shrink-0 font-display text-4xl font-bold tracking-[0.15em] text-accent sm:text-5xl" dir="ltr">{code.slice(0, 3)}<span className="inline-block w-2" />{code.slice(3)}</p>
        {ring}
      </div>
      <div className="hidden lg:block">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold">{t('رمز الفرع', 'Branch code')}</h2>
            <p className="mt-1 text-sm leading-relaxed text-white/65">{t('للبصمة من جوالك: أدخل هذا الرمز في تطبيق شؤون', 'Punching from your phone? Enter this code in the Shuoon app')}</p>
          </div>
          {ring}
        </div>
        <p className="num mt-4 text-center font-display text-7xl font-bold tracking-[0.2em] text-accent" dir="ltr">
          {code.slice(0, 3)}<span className="inline-block w-4" />{code.slice(3)}
        </p>
        <p className="mt-3 text-center text-sm text-white/60">
          {info ? t(`يتغير خلال ${secondsLeft} ثانية`, `Changes in ${secondsLeft} s`) : t('جارٍ التحميل…', 'Loading…')}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/10 pt-4 text-sm text-white/75">
          <p className="flex items-center gap-2"><LogIn className="h-4 w-4 text-accent" />{t('أول تسجيل اليوم = حضور', 'First punch today = check-in')}</p>
          <p className="flex items-center gap-2"><LogOut className="h-4 w-4 text-accent" />{t('التسجيل التالي = انصراف', 'Next punch = check-out')}</p>
        </div>
        <p className="mt-3 text-xs text-white/45">{t('لا كاميرا ولا صور — رقم الموظف ورمزه السري فقط', 'No camera, no photos — employee number and PIN only')}</p>
      </div>
    </section>
  );
}

/** «12 دقيقة» / «2 س 05 د» */
function lateText(m: number, lang: 'ar' | 'en') {
  if (m < 60) return lang === 'ar' ? `${m} دقيقة` : `${m} min`;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return lang === 'ar' ? `${h} س ${mm} د` : `${h} h ${mm} min`;
}

function ResultOverlay({ result, onDone }: { result: KioskPunchResult; onDone: () => void }) {
  const { t } = useLang();
  const isIn = result.action === 'IN';
  const at = new Date(result.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' });
  return (
    <div role="dialog" aria-modal="true" aria-label={isIn ? t('تم تسجيل الحضور', 'Checked in') : t('تم تسجيل الانصراف', 'Checked out')}
      className={clsx('fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center', isIn ? 'bg-primary' : 'bg-night')} onClick={onDone}>
      <CheckCircle2 className="h-28 w-28 text-white" strokeWidth={1.5} />
      <p className="mt-6 text-2xl text-white/85">{t('أهلاً', 'Hello')}</p>
      <p className="mt-1 font-display text-4xl font-bold text-white sm:text-5xl">{result.employeeName}</p>
      <p className={clsx('mt-8 inline-flex items-center gap-3 rounded-full px-6 py-3 text-2xl font-bold', isIn ? 'bg-white text-primary' : 'bg-accent text-night')}>
        {isIn ? <LogIn className="h-7 w-7" /> : <LogOut className="h-7 w-7" />}
        {isIn ? t('تم تسجيل الحضور', 'Checked in') : t('تم تسجيل الانصراف', 'Checked out')}
      </p>
      <p className="num mt-6 font-display text-6xl font-bold text-white" dir="ltr">{at}</p>
      {isIn && result.lateMinutes > 0 && (
        <p className="mt-4 rounded-xl bg-white/15 px-4 py-2 text-lg text-white">{t(`متأخر ${lateText(result.lateMinutes, 'ar')} عن بداية الوردية`, `${lateText(result.lateMinutes, 'en')} late for the shift`)}</p>
      )}
      <div className="absolute inset-x-0 bottom-0 h-2 bg-white/20">
        <div className="h-full origin-right bg-white" style={{ animation: `kiosk-countdown ${RESULT_MS}ms linear forwards` }} />
      </div>
      <style>{'@keyframes kiosk-countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }'}</style>
    </div>
  );
}
