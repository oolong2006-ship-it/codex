export function Logo({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect width="32" height="32" rx="10" fill="#FF5A3C" />
        <circle cx="16" cy="16" r="8.4" fill="none" stroke="#fff" strokeWidth="2.2" strokeDasharray="2.8 2.1" />
        <circle cx="16" cy="16" r="4" fill="#FFC233" />
      </svg>
      <span className="font-[family-name:var(--font-display)] text-2xl font-extrabold">{label}</span>
    </span>
  );
}
