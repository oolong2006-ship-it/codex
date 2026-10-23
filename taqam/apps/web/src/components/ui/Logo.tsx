import clsx from 'clsx';

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-2 font-bold', light ? 'text-white' : 'text-primary', className)}>
      <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden>
        <rect width="64" height="64" rx="16" fill={light ? '#FAF6EF' : '#0F3D3E'} />
        <path d="M18 22h28v6H35v20h-6V28H18z" fill={light ? '#0F3D3E' : '#FAF6EF'} />
        <circle cx="46" cy="44" r="5" fill="#F2A541" />
      </svg>
      <span className="text-xl">طاقم</span>
    </span>
  );
}
