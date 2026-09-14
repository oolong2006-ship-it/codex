export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "h-9 w-9 text-sm", md: "h-12 w-12 text-lg", lg: "h-16 w-16 text-2xl" };
  return (
    <span
      className={`inline-flex ${dims[size]} shrink-0 items-center justify-center rounded-xl
                  bg-gradient-to-bl from-brand-600 to-brand-800 font-extrabold text-gold-300
                  shadow-card ring-1 ring-brand-900/20`}
      aria-hidden
    >
      ن
    </span>
  );
}

export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Logo />
      <div>
        <p className="text-lg font-extrabold leading-tight text-brand-800">
          بوابة مشتريات الناضج
        </p>
        <p className="text-xs text-slate-500">
          {subtitle ?? "شركة مطاعم الناضج"}
        </p>
      </div>
    </div>
  );
}
