import {
  LayoutDashboard, Users, Network, Building2, FolderTree, Clock, CalendarRange, Timer, BarChart3,
  CalendarCheck, Inbox, Wallet, SlidersHorizontal, HandCoins, Flag, FileWarning, Target, Briefcase,
  PieChart, Megaphone, Settings, type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/auth';

export interface NavItem { href: string; label: [string, string]; icon: LucideIcon; roles: Role[]; exact?: boolean }
export interface NavGroup { label: [string, string]; items: NavItem[] }

const A: Role[] = ['OWNER', 'HR_ADMIN'];
const AP: Role[] = [...A, 'PAYROLL'];
const ABM: Role[] = [...A, 'BRANCH_MANAGER'];
const ALL: Role[] = [...A, 'PAYROLL', 'BRANCH_MANAGER'];

export const NAV: NavGroup[] = [
  { label: ['الرئيسية', 'Overview'], items: [
    { href: '/app', label: ['لوحة القيادة', 'Dashboard'], icon: LayoutDashboard, roles: ALL, exact: true },
  ] },
  { label: ['الموظفون والمنشأة', 'People & org'], items: [
    { href: '/app/employees', label: ['الموظفون', 'Employees'], icon: Users, roles: ALL },
    { href: '/app/org-chart', label: ['الهيكل التنظيمي', 'Org chart'], icon: Network, roles: ALL },
    { href: '/app/branches', label: ['الفروع', 'Branches'], icon: Building2, roles: ALL },
    { href: '/app/departments', label: ['الأقسام', 'Departments'], icon: FolderTree, roles: A },
    { href: '/app/documents', label: ['المستندات', 'Documents'], icon: FileWarning, roles: A },
  ] },
  { label: ['الحضور والورديات', 'Time & attendance'], items: [
    { href: '/app/attendance', label: ['الحضور اليومي', 'Daily attendance'], icon: Clock, roles: ABM, exact: true },
    { href: '/app/attendance/roster', label: ['جدول الورديات', 'Roster'], icon: CalendarRange, roles: ABM },
    { href: '/app/attendance/shifts', label: ['الورديات', 'Shifts'], icon: Timer, roles: ABM },
    { href: '/app/attendance/summary', label: ['ملخص الحضور', 'Attendance summary'], icon: BarChart3, roles: ALL },
  ] },
  { label: ['الطلبات', 'Approvals'], items: [
    { href: '/app/leaves', label: ['الإجازات', 'Leaves'], icon: CalendarCheck, roles: ABM },
    { href: '/app/requests', label: ['طلبات الموظفين', 'Requests'], icon: Inbox, roles: ABM },
  ] },
  { label: ['الرواتب', 'Payroll'], items: [
    { href: '/app/payroll', label: ['مسيرات الرواتب', 'Payroll runs'], icon: Wallet, roles: AP, exact: false },
    { href: '/app/payroll/adjustments', label: ['الإضافات والخصومات', 'Adjustments'], icon: SlidersHorizontal, roles: AP },
    { href: '/app/payroll/loans', label: ['السلف', 'Loans'], icon: HandCoins, roles: AP },
  ] },
  { label: ['الامتثال والمواهب', 'Compliance & talent'], items: [
    { href: '/app/saudization', label: ['السعودة (نطاقات)', 'Saudization'], icon: Flag, roles: A },
    { href: '/app/performance', label: ['الأداء', 'Performance'], icon: Target, roles: ABM },
    { href: '/app/recruitment', label: ['التوظيف', 'Recruitment'], icon: Briefcase, roles: A },
  ] },
  { label: ['أخرى', 'More'], items: [
    { href: '/app/reports', label: ['التقارير', 'Reports'], icon: PieChart, roles: AP },
    { href: '/app/announcements', label: ['الإعلانات', 'Announcements'], icon: Megaphone, roles: ALL },
    { href: '/app/settings', label: ['الإعدادات', 'Settings'], icon: Settings, roles: A },
  ] },
];

const FLAT = NAV.flatMap((g) => g.items);

export function isActive(item: NavItem, pathname: string) {
  if (item.exact) return pathname === item.href;
  if (item.href === '/app/payroll') {
    return pathname === '/app/payroll' || (/^\/app\/payroll\/[^/]+$/.test(pathname) && !/\/(adjustments|loans)$/.test(pathname));
  }
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

/** The most specific nav item matching a path (for access checks). */
export function navItemFor(pathname: string): NavItem | undefined {
  return FLAT.filter((i) => pathname === i.href || pathname.startsWith(i.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
