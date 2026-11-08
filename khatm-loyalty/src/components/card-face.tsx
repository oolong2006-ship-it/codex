import { t, type Lang } from "@/lib/i18n";

export type CardFaceProps = {
  lang: Lang;
  merchantName: string;
  programName: string;
  rewardDescription: string;
  stampsRequired: number;
  currentStamps: number;
  rewardsAvailable: number;
  customerName?: string;
  design: { bg: string; fg: string; accent: string; icon: string };
  qrSvg?: string;
  altText?: string;
};

/** The pass face, rendered identically for preview, web card and marketing. */
export function CardFace(p: CardFaceProps) {
  const slots = Array.from({ length: p.stampsRequired }, (_, i) => i < p.currentStamps);
  const remaining = p.stampsRequired - p.currentStamps;
  return (
    <div
      className="w-full max-w-sm overflow-hidden rounded-[22px] shadow-[0_18px_40px_-18px_rgba(28,17,11,0.55)]"
      style={{ background: p.design.bg, color: p.design.fg }}
      data-testid="card-face"
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <div className="truncate text-lg font-bold">{p.merchantName}</div>
          <div className="truncate text-sm opacity-75">{p.programName}</div>
        </div>
        <div className="shrink-0 text-end">
          <div className="text-[11px] font-medium uppercase opacity-70" style={{ color: p.design.accent }}>
            {t(p.lang, "card.rewardsReady")}
          </div>
          <div className="text-2xl font-bold leading-tight" data-testid="rewards-available">
            {p.rewardsAvailable}
          </div>
        </div>
      </div>

      <div className="px-5 pt-4">
        <div className="text-[11px] font-medium opacity-70" style={{ color: p.design.accent }}>
          {t(p.lang, "card.stamps")}
        </div>
        <div className="text-3xl font-bold tabular-nums" data-testid="stamp-progress">
          {p.currentStamps} <span className="text-lg opacity-60">/ {p.stampsRequired}</span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 px-5 pt-3" aria-hidden>
        {slots.map((filled, i) => (
          <div
            key={i}
            className="flex aspect-square items-center justify-center rounded-full text-xl transition"
            style={
              filled
                ? { background: p.design.accent, boxShadow: `0 0 0 3px ${p.design.bg}, 0 0 0 4px ${p.design.accent}` }
                : { border: `2px dashed ${p.design.fg}40` }
            }
          >
            {filled ? p.design.icon : ""}
          </div>
        ))}
      </div>

      <div className="flex items-end justify-between gap-3 px-5 pb-5 pt-4 text-sm">
        <div className="min-w-0">
          <div className="text-[11px] font-medium opacity-70" style={{ color: p.design.accent }}>
            {t(p.lang, "card.reward")}
          </div>
          <div className="truncate font-semibold">{p.rewardDescription}</div>
          <div className="mt-1 text-xs opacity-70">
            {p.rewardsAvailable > 0 ? t(p.lang, "card.rewardReadyBanner") : t(p.lang, "card.remaining", { n: remaining })}
          </div>
        </div>
        {p.customerName && (
          <div className="shrink-0 text-end">
            <div className="text-[11px] font-medium opacity-70" style={{ color: p.design.accent }}>
              {t(p.lang, "card.member")}
            </div>
            <div className="font-semibold">{p.customerName}</div>
          </div>
        )}
      </div>

      {p.qrSvg && (
        <div className="flex flex-col items-center gap-1.5 bg-white px-5 py-5 text-espresso-900">
          <div className="h-44 w-44" dangerouslySetInnerHTML={{ __html: p.qrSvg }} data-testid="card-qr" />
          {p.altText && <div className="font-mono text-xs tracking-widest text-espresso-500">{p.altText}</div>}
          <div className="text-xs text-espresso-500">{t(p.lang, "card.showToCashier")}</div>
        </div>
      )}
    </div>
  );
}
