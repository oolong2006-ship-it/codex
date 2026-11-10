"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Card = {
  serial: string;
  customerName: string;
  phoneMasked: string;
  currentStamps: number;
  stampsRequired: number;
  rewardsAvailable: number;
  rewardDescription: string;
  maxStampsPerScan: number;
  lastStampAt: string | null;
  cooldownRemainingMinutes: number;
  rewardsEarned?: number;
  redeemed?: string;
};

type Labels = Record<
  | "scan" | "startCamera" | "stopCamera" | "manual" | "lookup" | "cameraError" | "addStamp" | "addStamps" | "redeem" | "stamped"
  | "rewardEarned" | "redeemed" | "next" | "quantity" | "firstVisit" | "lastVisit" | "offline" | "rewardsReady" | "reward" | "cooldown" | "generic",
  string
>;

const fill = (s: string, p: Record<string, string | number>) => Object.entries(p).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, String(v)), s);

async function post<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? "error" };
  } catch {
    return { ok: false, error: "network" };
  }
}

export function Terminal({ labels, lang }: { labels: Labels; lang: "ar" | "en" }) {
  const [card, setCard] = useState<Card | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [online, setOnline] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    on();
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  const reset = useCallback(() => {
    setCard(null);
    setQty(1);
    setError(null);
    setSuccess(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const lookup = useCallback(async (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    const isToken = /^K[a-z0-9]{1,8}\./i.test(v);
    const r = await post<Card>("/api/pos/lookup", isToken ? { token: v } : { phone: v });
    setBusy(false);
    if (r.ok) {
      setCard(r.data);
      setQty(1);
    } else setError(r.error === "network" ? labels.offline : r.error);
  }, [labels.offline]);

  const stopCamera = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setCamera(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 150 });
      setCamera(true);
      await new Promise((r) => setTimeout(r, 0));
      const controls = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, videoRef.current!, (result) => {
        if (result) {
          controls.stop();
          stopRef.current = null;
          setCamera(false);
          if (navigator.vibrate) navigator.vibrate(60);
          void lookup(result.getText());
        }
      });
      stopRef.current = () => controls.stop();
    } catch {
      setCamera(false);
      setError(labels.cameraError);
    }
  }, [labels.cameraError, lookup]);

  useEffect(() => () => stopRef.current?.(), []);

  const stamp = async () => {
    if (!card) return;
    setBusy(true);
    setError(null);
    const r = await post<Card>("/api/pos/stamp", { serial: card.serial, quantity: qty });
    setBusy(false);
    if (!r.ok) return setError(r.error === "network" ? labels.offline : r.error);
    setCard(r.data);
    setSuccess(r.data.rewardsEarned ? `${fill(labels.stamped, { n: qty })} — ${labels.rewardEarned}` : fill(labels.stamped, { n: qty }));
    setQty(1);
  };

  const redeem = async () => {
    if (!card) return;
    setBusy(true);
    setError(null);
    const r = await post<Card>("/api/pos/redeem", { serial: card.serial });
    setBusy(false);
    if (!r.ok) return setError(r.error === "network" ? labels.offline : r.error);
    setCard(r.data);
    setSuccess(fill(labels.redeemed, { reward: r.data.redeemed ?? "" }));
  };

  const since = (iso: string | null) => {
    if (!iso) return labels.firstVisit;
    const rtf = new Intl.RelativeTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en", { numeric: "auto" });
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    const when = mins < 60 ? rtf.format(-mins, "minute") : mins < 1440 ? rtf.format(-Math.round(mins / 60), "hour") : rtf.format(-Math.round(mins / 1440), "day");
    return fill(labels.lastVisit, { when });
  };

  return (
    <div className="mx-auto w-full max-w-md">
      {!online && <div className="mb-3 rounded-xl bg-rose-50 px-4 py-2 text-center text-sm font-medium text-rose-600">{labels.offline}</div>}

      {!card && (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            {camera ? (
              <div className="relative aspect-square bg-black">
                <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                <div className="pointer-events-none absolute inset-10 rounded-3xl border-4 border-sun-400/90" />
                <button type="button" onClick={stopCamera} className="btn absolute bottom-3 start-3 bg-white/90 text-espresso-900">{labels.stopCamera}</button>
              </div>
            ) : (
              <button type="button" onClick={startCamera} className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-saffron-500 to-saffron-600 text-white transition hover:brightness-105" data-testid="start-camera">
                <svg viewBox="0 0 24 24" className="h-14 w-14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" strokeLinecap="round" />
                  <rect x="8" y="8" width="8" height="8" rx="1.5" />
                </svg>
                <span className="text-lg font-semibold">{labels.scan}</span>
                <span className="text-sm opacity-70">{labels.startCamera}</span>
              </button>
            )}
          </div>
          <form
            className="card flex gap-2 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void lookup(inputRef.current?.value ?? "");
            }}
          >
            <input ref={inputRef} name="q" autoFocus placeholder={labels.manual} className="input" dir="ltr" inputMode="tel" autoComplete="off" data-testid="lookup-input" />
            <button className="btn-primary shrink-0" disabled={busy}>{labels.lookup}</button>
          </form>
        </div>
      )}

      {card && (
        <div className="card overflow-hidden" data-testid="pos-card">
          <div className="bg-gradient-to-br from-grape-500 to-grape-700 px-5 py-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-bold">{card.customerName}</div>
                <div className="text-sm opacity-70" dir="ltr">{card.phoneMasked}</div>
              </div>
              <div className="text-end text-xs opacity-80">{since(card.lastStampAt)}</div>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div className="text-4xl font-bold tabular-nums" data-testid="pos-progress">{card.currentStamps}<span className="text-xl opacity-60"> / {card.stampsRequired}</span></div>
              {card.rewardsAvailable > 0 && <div className="rounded-full bg-sun-400 px-3 py-1 text-sm font-bold text-espresso-900" data-testid="pos-rewards">🎁 {card.rewardsAvailable} {labels.rewardsReady}</div>}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-sun-400 transition-all" style={{ width: `${(card.currentStamps / card.stampsRequired) * 100}%` }} />
            </div>
          </div>

          <div className="space-y-4 p-5">
            {success && <p role="status" className="rounded-xl bg-mint-50 px-4 py-3 text-center font-semibold text-mint-600" data-testid="pos-success">{success}</p>}
            {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-center text-sm font-medium text-rose-600" data-testid="pos-error">{error}</p>}

            {card.maxStampsPerScan > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-espresso-700">{labels.quantity}</span>
                <div className="flex items-center gap-2">
                  <button type="button" className="btn-ghost h-11 w-11 p-0 text-xl" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="-">−</button>
                  <span className="w-8 text-center text-xl font-bold tabular-nums">{qty}</span>
                  <button type="button" className="btn-ghost h-11 w-11 p-0 text-xl" onClick={() => setQty((q) => Math.min(card.maxStampsPerScan, q + 1))} aria-label="+">+</button>
                </div>
              </div>
            )}

            <button type="button" onClick={stamp} disabled={busy} className="btn-accent w-full py-4 text-lg" data-testid="pos-stamp">
              {qty === 1 ? labels.addStamp : fill(labels.addStamps, { n: qty })}
            </button>
            {card.rewardsAvailable > 0 && (
              <button type="button" onClick={redeem} disabled={busy} className="btn-primary w-full py-4 text-lg" data-testid="pos-redeem">
                🎁 {labels.redeem} — {card.rewardDescription}
              </button>
            )}
            <button type="button" onClick={reset} className="btn-ghost w-full py-3" data-testid="pos-next">{labels.next}</button>
          </div>
        </div>
      )}
    </div>
  );
}
