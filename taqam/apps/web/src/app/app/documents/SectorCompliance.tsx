'use client';
import Link from 'next/link';
import { useState } from 'react';
import { CalendarClock, FileQuestion, FileX2, ShieldAlert } from 'lucide-react';
import { Card, EmptyState, Select, StatCard, Table, type Column } from '@/components/ui';
import { Async, Avatar, Chips, FilterBar, SearchInput, StatusBadge } from '@/components/app/primitives';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { num } from '@/lib/format';
import { DOC_COMPLIANCE_STATUS, DOC_TYPE, SECTOR, SECTOR_DOC_HINT, label } from '@/lib/labels';
import { EXEMPTION_HINT, REFILE_HINT, sectorDocTypes } from '@/lib/sector-docs';
import type { Company, DocumentCompliance, DocumentComplianceItem, DocumentComplianceStatus } from '@/lib/types';

/** «امتثال القطاع» — required sector documents (Baladi / SCFHS / TGA + iqama) missing or expiring (spec §4). */
export function SectorCompliance() {
  const { t, lang } = useLang();
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useFetch(() => api.get<DocumentCompliance>('/documents/compliance'), []);
  const company = useFetch(() => api.get<Company>('/company'), []);
  const items = data?.items ?? [];
  const types = [...new Set(items.map((i) => i.type))];
  const rows = items.filter((i) => (!status || i.status === status) && (!type || i.type === type) && (!q || i.employeeName.toLowerCase().includes(q.toLowerCase())));
  const count = (s: DocumentComplianceStatus) => data?.counts[s] ?? 0;
  const sector = company.data?.sector ?? null;
  const sectorTypes = sectorDocTypes(sector);

  const columns: Column<DocumentComplianceItem>[] = [
    { key: 'emp', header: t('الموظف', 'Employee'), render: (d) => (
      <Link href={`/app/employees/${d.employeeId}?tab=documents`} className="flex items-center gap-2.5 hover:text-primary-500"><Avatar name={d.employeeName} size="sm" /><span className="font-medium">{d.employeeName}</span></Link>
    ) },
    { key: 'branch', header: t('الفرع', 'Branch'), render: (d) => <span className="text-ink-muted">{d.branchName || '—'}</span> },
    { key: 'type', header: t('المستند المطلوب', 'Required document'), render: (d) => label(DOC_TYPE, d.type, lang) },
    { key: 'status', header: t('الحالة', 'Status'), render: (d) => <StatusBadge map={DOC_COMPLIANCE_STATUS} value={d.status} /> },
  ];

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={label(DOC_COMPLIANCE_STATUS, 'MISSING', lang)} value={num(count('MISSING'))} tone="danger" icon={<FileQuestion className="h-5 w-5" />} />
        <StatCard label={label(DOC_COMPLIANCE_STATUS, 'EXPIRED', lang)} value={num(count('EXPIRED'))} tone="danger" icon={<FileX2 className="h-5 w-5" />} />
        <StatCard label={t('خلال 30 يوماً', 'Within 30 days')} value={num(count('CRITICAL'))} tone="accent" icon={<ShieldAlert className="h-5 w-5" />} />
        <StatCard label={t('خلال 90 يوماً', 'Within 90 days')} value={num(count('WARNING'))} tone="info" icon={<CalendarClock className="h-5 w-5" />} />
      </div>
      <Card>
        <div className="border-b border-line px-4 py-3 text-sm text-ink-muted">
          {t('قطاع المنشأة', 'Company sector')}: <span className="font-medium text-ink">{label(SECTOR, sector, lang)}</span>
          {sectorTypes.length > 0
            ? <ul className="mt-1 space-y-0.5 text-xs">{sectorTypes.map((k) => <li key={k}>• {label(DOC_TYPE, k, lang)} — {label(SECTOR_DOC_HINT, k, lang)}</li>)}</ul>
            : <p className="mt-1 text-xs">{t('لا توجد مستندات قطاعية إلزامية لقطاعك؛ تُتابَع الإقامات لغير السعوديين.', 'No mandatory sector documents for your sector; iqamas of non-Saudis are tracked.')}</p>}
          {sectorTypes.includes('HEALTH_CERTIFICATE') && <p className="mt-1 text-xs text-accent-600">{t(REFILE_HINT.ar, REFILE_HINT.en)}</p>}
          <p className="mt-1 text-xs text-ink-soft">{t(EXEMPTION_HINT.ar, EXEMPTION_HINT.en)}</p>
        </div>
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder={t('بحث بالموظف', 'Search employee')} className="sm:w-60" />
          <Select value={type} onChange={(e) => setType(e.target.value)} placeholder={t('كل المستندات', 'All documents')} className="sm:w-52"
            options={types.map((v) => ({ value: v, label: label(DOC_TYPE, v, lang) }))} />
        </FilterBar>
        <div className="border-b border-line px-4 py-3">
          <Chips value={status} onChange={setStatus} options={[
            { value: '', label: t('الكل', 'All'), count: items.length },
            ...(['MISSING', 'EXPIRED', 'CRITICAL', 'WARNING'] as const).map((s) => ({ value: s, label: label(DOC_COMPLIANCE_STATUS, s, lang), count: count(s) })),
          ]} />
        </div>
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          <Table columns={columns} rows={rows} rowKey={(d) => `${d.employeeId}-${d.type}`}
            empty={<EmptyState title={t('المنشأة ممتثلة', 'Fully compliant')} description={t('كل الموظفين النشطين لديهم المستندات المطلوبة لقطاعك', 'All active staff hold the documents your sector requires')} />} />
        </Async>
      </Card>
    </>
  );
}
