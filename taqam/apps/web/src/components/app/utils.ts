'use client';
import { useCallback, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { ADMIN_ROLES, type Role, type SessionUser } from '@/lib/auth';

export function errMsg(e: unknown) {
  if (e instanceof ApiError) return e.display;
  return e instanceof Error ? e.message : String(e);
}

/** Run an async mutation with a loading flag; toasts the API error on failure. Returns true on success. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    try {
      await fn();
      if (success) toast(success);
      return true;
    } catch (e) {
      toast(errMsg(e), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  }, [toast]);
  return { busy, run };
}

export const isAdmin = (u: SessionUser | null) => !!u && ADMIN_ROLES.includes(u.role);
export const can = (u: SessionUser | null, roles: Role[]) => !!u && roles.includes(u.role);
export const ADMIN: Role[] = ['OWNER', 'HR_ADMIN'];
export const ADMIN_PAYROLL: Role[] = ['OWNER', 'HR_ADMIN', 'PAYROLL'];
export const ADMIN_BM: Role[] = ['OWNER', 'HR_ADMIN', 'BRANCH_MANAGER'];
export const STAFF: Role[] = ['OWNER', 'HR_ADMIN', 'PAYROLL', 'BRANCH_MANAGER'];

/** Local YYYY-MM-DD from a Date. */
export function isoDay(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}
/** Sunday-based week start (Saudi work week starts Sunday). */
export function weekStartOf(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - d.getDay());
  return isoDay(d);
}
export function addMonths(period: string, n: number) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export const DAY_NAMES: [string, string][] = [
  ['الأحد', 'Sun'], ['الاثنين', 'Mon'], ['الثلاثاء', 'Tue'], ['الأربعاء', 'Wed'], ['الخميس', 'Thu'], ['الجمعة', 'Fri'], ['السبت', 'Sat'],
];
/** Build an ISO datetime from a day + "HH:mm" (Riyadh time, +03:00). */
export function toIsoDateTime(day: string, hhmm: string) {
  if (!hhmm) return null;
  return `${day}T${hhmm}:00+03:00`;
}
/** Extract "HH:mm" (Riyadh) from an ISO datetime. */
export function hhmmOf(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Riyadh' });
}
export function employeeName(e: { firstNameAr?: string; lastNameAr?: string; fullNameEn?: string } | null | undefined, lang: 'ar' | 'en' = 'ar') {
  if (!e) return '—';
  const ar = [e.firstNameAr, e.lastNameAr].filter(Boolean).join(' ');
  return lang === 'en' ? e.fullNameEn || ar : ar || e.fullNameEn || '—';
}
