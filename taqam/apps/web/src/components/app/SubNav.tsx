'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth, type Role } from '@/lib/auth';
import { useLang } from '@/lib/i18n';

/** Pill links between sibling pages of a section (e.g. attendance, payroll). */
export function SubNav({ items }: { items: { href: string; label: [string, string]; roles?: Role[] }[] }) {
  const pathname = usePathname();
  const { lang } = useLang();
  const { user } = useAuth();
  const visible = items.filter((i) => !i.roles || (user && i.roles.includes(user.role)));
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1 sm:w-fit">
      {visible.map((i) => (
        <Link key={i.href} href={i.href}
          className={clsx('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            pathname === i.href ? 'bg-primary text-white' : 'text-ink-muted hover:bg-sand hover:text-primary')}>
          {lang === 'ar' ? i.label[0] : i.label[1]}
        </Link>
      ))}
    </div>
  );
}

export const ATTENDANCE_NAV: { href: string; label: [string, string]; roles?: Role[] }[] = [
  { href: '/app/attendance', label: ['اليومي', 'Daily'], roles: ['OWNER', 'HR_ADMIN', 'BRANCH_MANAGER'] },
  { href: '/app/attendance/roster', label: ['جدول الورديات', 'Roster'], roles: ['OWNER', 'HR_ADMIN', 'BRANCH_MANAGER'] },
  { href: '/app/attendance/shifts', label: ['الورديات', 'Shifts'], roles: ['OWNER', 'HR_ADMIN', 'BRANCH_MANAGER'] },
  { href: '/app/attendance/summary', label: ['الملخص', 'Summary'] },
];
export const PAYROLL_NAV: { href: string; label: [string, string] }[] = [
  { href: '/app/payroll', label: ['المسيرات', 'Runs'] },
  { href: '/app/payroll/adjustments', label: ['الإضافات والخصومات', 'Adjustments'] },
  { href: '/app/payroll/loans', label: ['السلف', 'Loans'] },
];
