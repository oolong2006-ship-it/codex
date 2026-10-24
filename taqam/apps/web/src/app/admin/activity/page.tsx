'use client';
import { useMemo, useState } from 'react';
import { Card, CardBody, PageHeader, Pagination, Select } from '@/components/ui';
import { Async, FilterBar } from '@/components/app/primitives';
import { Timeline } from '@/components/admin/Timeline';
import { api, type Paginated } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { useFetch } from '@/lib/useFetch';
import { EVENT_TYPE, EVENT_TYPES, companyName, lbl, type AdminCompany, type CompanyEvent } from '@/lib/adminTypes';

export default function ActivityPage() {
  const { t, lang } = useLang();
  const [type, setType] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch(
    () => api.get<Paginated<CompanyEvent>>('/admin/events', { type: type || undefined, companyId: companyId || undefined, page, pageSize: 30 }),
    [type, companyId, page],
  );
  const companies = useFetch(() => api.get<Paginated<AdminCompany>>('/admin/companies', { sort: 'name', pageSize: 200 }), []);
  const names = useMemo(() => new Map((companies.data?.data ?? []).map((c) => [c.id, companyName(c, lang)])), [companies.data, lang]);

  return (
    <div>
      <PageHeader title={t('سجل نشاط المنصة', 'Platform activity')} subtitle={t('كل تغييرات دورة حياة المنشآت وإجراءات فريق المنصة', 'Every company lifecycle change and platform-team action')} />
      <Card>
        <FilterBar>
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} placeholder={t('كل الأحداث', 'All events')}
            options={EVENT_TYPES.map((x) => ({ value: x, label: lbl(EVENT_TYPE, x, lang) }))} className="sm:w-52" />
          <Select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setPage(1); }} placeholder={t('كل المنشآت', 'All companies')}
            options={(companies.data?.data ?? []).map((c) => ({ value: c.id, label: companyName(c, lang) }))} className="sm:w-64" />
        </FilterBar>
        <CardBody>
          <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
            {data && <div className={loading ? 'opacity-60' : ''}><Timeline events={data.data} showCompany companyLabel={(id) => names.get(id)} /></div>}
          </Async>
        </CardBody>
        {data && <Pagination page={data.page} pageSize={data.pageSize || 30} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  );
}
