'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Building, CalendarDays, History, ListChecks, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { AuditSection, CompanySection, HolidaysSection, LeaveTypesSection, UsersSection } from '@/components/app/SettingsSections';
import { useLang } from '@/lib/i18n';

type Tab = 'company' | 'users' | 'leave-types' | 'holidays' | 'audit';

export default function SettingsPage() {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>('company');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (q) setTab(q);
  }, []);
  const select = (v: Tab) => { setTab(v); window.history.replaceState(null, '', `?tab=${v}`); };
  const tabs: { v: Tab; l: string; icon: React.ElementType }[] = [
    { v: 'company', l: t('بيانات المنشأة', 'Company'), icon: Building },
    { v: 'users', l: t('المستخدمون والأدوار', 'Users & roles'), icon: Users },
    { v: 'leave-types', l: t('أنواع الإجازات', 'Leave types'), icon: ListChecks },
    { v: 'holidays', l: t('العطل الرسمية', 'Holidays'), icon: CalendarDays },
    { v: 'audit', l: t('سجل التدقيق', 'Audit log'), icon: History },
  ];
  return (
    <>
      <PageHeader title={t('الإعدادات', 'Settings')} subtitle={t('إعدادات المنشأة والمستخدمين والسياسات', 'Company, users and policy settings')} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-white p-1.5 lg:flex-col lg:self-start">
          {tabs.map((x) => (
            <button key={x.v} onClick={() => select(x.v)}
              className={clsx('flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                tab === x.v ? 'bg-primary text-white' : 'text-ink-muted hover:bg-sand hover:text-primary')}>
              <x.icon className={clsx('h-4 w-4', tab === x.v && 'text-accent')} />{x.l}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {tab === 'company' && <CompanySection />}
          {tab === 'users' && <UsersSection />}
          {tab === 'leave-types' && <LeaveTypesSection />}
          {tab === 'holidays' && <HolidaysSection />}
          {tab === 'audit' && <AuditSection />}
        </div>
      </div>
    </>
  );
}
