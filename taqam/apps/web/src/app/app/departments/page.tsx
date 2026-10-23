'use client';
import { useMemo, useState } from 'react';
import { FolderTree, Pencil, Plus, Trash2, CornerDownLeft } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Select } from '@/components/ui';
import { Async, ConfirmModal } from '@/components/app/primitives';
import { useAction } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { num } from '@/lib/format';
import type { Department } from '@/lib/types';

export default function DepartmentsPage() {
  const { t } = useLang();
  const { data, loading, error, reload } = useFetch(() => api.get<Department[]>('/departments'), []);
  const [edit, setEdit] = useState<Department | 'new' | null>(null);
  const [del, setDel] = useState<Department | null>(null);
  const { busy, run } = useAction();

  // Flatten the hierarchy depth-first with depth for indentation.
  const rows = useMemo(() => {
    const list = data ?? [];
    const ids = new Set(list.map((d) => d.id));
    const out: { d: Department; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      list.filter((d) => (parentId === null ? !d.parentId || !ids.has(d.parentId) : d.parentId === parentId))
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((d) => { out.push({ d, depth }); if (depth < 8) walk(d.id, depth + 1); });
    };
    walk(null, 0);
    return out;
  }, [data]);
  const total = (data ?? []).reduce((a, d) => a + (d.employeesCount || 0), 0);

  const remove = async () => {
    if (del && await run('del', () => api.del(`/departments/${del.id}`), t('تم حذف القسم', 'Department deleted'))) { setDel(null); reload(); }
  };

  return (
    <>
      <PageHeader title={t('الأقسام', 'Departments')} subtitle={t('الهيكل الإداري للأقسام', 'Hierarchical department structure')}
        actions={<Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />{t('إضافة قسم', 'Add department')}</Button>} />
      <Card>
        <CardHeader title={`${num(data?.length ?? 0)} ${t('قسم', 'departments')}`} subtitle={`${num(total)} ${t('موظف', 'employees')}`} />
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          {!rows.length ? <EmptyState title={t('لا توجد أقسام', 'No departments')} /> : (
            <ul className="divide-y divide-line">
              {rows.map(({ d, depth }) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3 hover:bg-sand/50">
                  <div className="flex min-w-0 flex-1 items-center gap-2" style={{ paddingInlineStart: depth * 24 }}>
                    {depth > 0 ? <CornerDownLeft className="h-4 w-4 shrink-0 text-ink-soft ltr:-scale-x-100" /> : <span className="rounded-lg bg-primary-100 p-1.5 text-primary"><FolderTree className="h-4 w-4" /></span>}
                    <span className="truncate font-medium text-ink">{d.name}</span>
                  </div>
                  <span className="num rounded-full bg-sand-200 px-2.5 py-0.5 text-xs text-ink-muted">{num(d.employeesCount)} {t('موظف', 'staff')}</span>
                  <button onClick={() => setEdit(d)} className="rounded-lg p-2 text-ink-soft hover:bg-sand hover:text-primary" aria-label="edit"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => setDel(d)} className="rounded-lg p-2 text-ink-soft hover:bg-danger-50 hover:text-danger" aria-label="delete"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </Async>
      </Card>
      {edit && <DeptModal dept={edit === 'new' ? null : edit} all={data ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger loading={busy === 'del'} confirmLabel={t('حذف', 'Delete')}
        title={t('حذف القسم', 'Delete department')} message={t(`حذف قسم "${del?.name ?? ''}"؟`, `Delete "${del?.name ?? ''}"?`)} />
    </>
  );
}

function DeptModal({ dept, all, onClose, onSaved }: { dept: Department | null; all: Department[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const { busy, run } = useAction();
  const [name, setName] = useState(dept?.name ?? '');
  const [parentId, setParentId] = useState(dept?.parentId ?? '');
  const save = async () => {
    if (!name.trim()) return;
    const body = { name: name.trim(), parentId: parentId || null };
    if (await run('save', () => (dept ? api.patch(`/departments/${dept.id}`, body) : api.post('/departments', body)), t('تم الحفظ', 'Saved'))) onSaved();
  };
  return (
    <Modal open onClose={onClose} size="sm" title={dept ? t('تعديل القسم', 'Edit department') : t('قسم جديد', 'New department')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={save} loading={busy === 'save'} disabled={!name.trim()}>{t('حفظ', 'Save')}</Button></>}>
      <div className="space-y-4">
        <Field label={t('اسم القسم', 'Name')} required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label={t('القسم الأعلى', 'Parent department')}>
          <Select value={parentId} onChange={(e) => setParentId(e.target.value)} placeholder={t('— بدون (قسم رئيسي) —', '— None (top level) —')}
            options={all.filter((d) => d.id !== dept?.id).map((d) => ({ value: d.id, label: d.name }))} />
        </Field>
      </div>
    </Modal>
  );
}
