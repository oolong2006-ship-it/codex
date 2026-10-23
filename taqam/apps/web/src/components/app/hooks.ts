'use client';
import { useMemo } from 'react';
import { api, type Paginated } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import type { Branch, Department, Employee, LeaveType, Shift } from '@/lib/types';
import { employeeName } from './utils';

export function useBranches() {
  const r = useFetch(() => api.get<Branch[]>('/branches'), []);
  const { lang } = useLang();
  const options = useMemo(() => (r.data ?? []).map((b) => ({ value: b.id, label: lang === 'en' ? b.nameEn || b.nameAr : b.nameAr })), [r.data, lang]);
  return { ...r, branches: r.data ?? [], options };
}

export function useDepartments() {
  const r = useFetch(() => api.get<Department[]>('/departments'), []);
  const options = useMemo(() => (r.data ?? []).map((d) => ({ value: d.id, label: d.name })), [r.data]);
  return { ...r, departments: r.data ?? [], options };
}

export function useLeaveTypes() {
  const r = useFetch(() => api.get<LeaveType[]>('/leave-types'), []);
  const { lang } = useLang();
  const options = useMemo(() => (r.data ?? []).map((l) => ({ value: l.id, label: lang === 'en' ? l.nameEn || l.nameAr : l.nameAr })), [r.data, lang]);
  return { ...r, leaveTypes: r.data ?? [], options };
}

export function useShifts(branchId?: string) {
  const r = useFetch(() => api.get<Shift[]>('/shifts', { branchId }), [branchId]);
  return { ...r, shifts: r.data ?? [] };
}

/** Lightweight employee list for pickers (active + on leave). */
export function useEmployeeOptions(opts: { branchId?: string; includeTerminated?: boolean } = {}) {
  const r = useFetch(() => api.get<Paginated<Employee>>('/employees', { page: 1, pageSize: 500, branchId: opts.branchId }), [opts.branchId]);
  const { lang } = useLang();
  const list = useMemo(() => (r.data?.data ?? []).filter((e) => opts.includeTerminated || e.status !== 'TERMINATED'), [r.data, opts.includeTerminated]);
  const options = useMemo(() => list.map((e) => ({ value: e.id, label: `${employeeName(e, lang)} · ${e.employeeNumber}` })), [list, lang]);
  return { ...r, employees: list, options };
}
