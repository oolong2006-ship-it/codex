export function Logo({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#3B2418" />
        <circle cx="16" cy="16" r="8.5" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeDasharray="3.2 2.2" />
        <circle cx="16" cy="16" r="4" fill="#F59E0B" />
      </svg>
      <span className="text-xl tracking-tight">{label}</span>
    </span>
  );
}
