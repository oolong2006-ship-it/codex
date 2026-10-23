'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CalendarClock, FileWarning, FileX2, ShieldAlert } from 'lucide-react';
import { Card, EmptyState, PageHeader, Select, StatCard, Table, type Column } from '@/components/ui';
import { Async, Avatar, Chips, FilterBar, SearchInput, StatusBadge } from '@/components/app/primitives';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date, num, todayISO } from '@/lib/format';
import { DOC_TYPE, EXPIRY_STATUS, label } from '@/lib/labels';
import type { ExpiringDocument } from '@/lib/types';

function daysLeft(d: string) {
  return Math.floor((new Date(`${d.slice(0, 10)}T00:00:00`).getTime() - new Date(`${todayISO()}T00:00:00`).getTime()) / 86400000);
}

export default function DocumentsPage() {
  const { t, lang } = useLang();
  const [days, setDays] = useState('90');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useFetch(() => api.get<ExpiringDocument[]>('/documents/expiring', { days }), [days]);
  const all = useMemo(() => [...(data ?? [])].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)), [data]);
  const rows = all.filter((d) => (!status || d.status === status) && (!type || d.type === type) && (!q || d.employeeName.toLowerCase().includes(q.toLowerCase())));
  const count = (s: string) => all.filter((d) => d.status === s).length;

  const columns: Column<ExpiringDocument>[] = [
    { key: 'emp', header: t('الموظف', 'Employee'), render: (d) => (
      <Link href={`/app/employees/${d.employeeId}?tab=documents`} className="flex items-center gap-2.5 hover:text-primary-500"><Avatar name={d.employeeName} size="sm" /><span className="font-medium">{d.employeeName}</span></Link>
    ) },
    { key: 'type', header: t('المستند', 'Document'), render: (d) => label(DOC_TYPE, d.type, lang) },
    { key: 'num', header: t('الرقم', 'Number'), render: (d) => <span className="num text-ink-muted">{d.number || '—'}</span> },
    { key: 'exp', header: t('تاريخ الانتهاء', 'Expiry'), render: (d) => date(d.expiryDate, lang) },
    { key: 'left', header: t('المتبقي', 'Days left'), render: (d) => {
      const n = daysLeft(d.expiryDate);
      return <span className={`num font-semibold ${n < 0 ? 'text-danger' : n <= 30 ? 'text-accent-600' : 'text-ink'}`}>{n < 0 ? t(`منتهي منذ ${-n} يوم`, `${-n}d ago`) : t(`${n} يوم`, `${n}d`)}</span>;
    } },
    { key: 'status', header: t('الحالة', 'Status'), render: (d) => <StatusBadge map={EXPIRY_STATUS} value={d.status} /> },
  ];

  return (
    <>
      <PageHeader title={t('مركز المستندات', 'Documents center')} subtitle={t('الإقامات والجوازات والعقود المنتهية أو القريبة من الانتهاء', 'Expired and expiring iqamas, passports and contracts')} />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('منتهية', 'Expired')} value={num(count('EXPIRED'))} tone="danger" icon={<FileX2 className="h-5 w-5" />} />
        <StatCard label={t('خلال 30 يوماً', 'Within 30 days')} value={num(count('CRITICAL'))} tone="accent" icon={<ShieldAlert className="h-5 w-5" />} />
        <StatCard label={t('خلال 90 يوماً', 'Within 90 days')} value={num(count('WARNING'))} tone="info" icon={<CalendarClock className="h-5 w-5" />} />
      </div>
      <Card>
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder={t('بحث بالموظف', 'Search employee')} className="sm:w-60" />
          <Select value={type} onChange={(e) => setType(e.target.value)} placeholder={t('كل المستندات', 'All documents')} className="sm:w-44"
            options={Object.entries(DOC_TYPE).map(([v, l]) => ({ value: v, label: lang === 'ar' ? l[0] : l[1] }))} />
          <Select value={days} onChange={(e) => setDays(e.target.value)} className="sm:w-40"
            options={[{ value: '30', label: t('خلال 30 يوماً', 'Next 30 days') }, { value: '60', label: t('خلال 60 يوماً', 'Next 60 days') }, { value: '90', label: t('خلال 90 يوماً', 'Next 90 days') }, { value: '180', label: t('خلال 180 يوماً', 'Next 180 days') }]} />
        </FilterBar>
        <div className="border-b border-line px-4 py-3">
          <Chips value={status} onChange={setStatus} options={[
            { value: '', label: t('الكل', 'All'), count: all.length },
            { value: 'EXPIRED', label: label(EXPIRY_STATUS, 'EXPIRED', lang), count: count('EXPIRED') },
            { value: 'CRITICAL', label: label(EXPIRY_STATUS, 'CRITICAL', lang), count: count('CRITICAL') },
            { value: 'WARNING', label: label(EXPIRY_STATUS, 'WARNING', lang), count: count('WARNING') },
          ]} />
        </div>
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          <Table columns={columns} rows={rows} rowKey={(d) => d.id}
            empty={<EmptyState title={t('لا توجد مستندات منتهية', 'No expiring documents')} description={t('جميع المستندات سارية خلال الفترة المختارة', 'All documents are valid in the selected window')} />} />
        </Async>
      </Card>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-soft"><FileWarning className="h-3.5 w-3.5" />{t('يُنصح بتجديد الإقامة قبل انتهائها بـ 30 يوماً على الأقل لتجنب الغرامات.', 'Renew iqamas at least 30 days before expiry to avoid fines.')}</p>
    </>
  );
}
