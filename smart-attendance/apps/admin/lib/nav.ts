export interface NavItem {
  href: string;
  label: string;
  /** أي صلاحية من هذه تكفي لظهور الرابط. */
  anyOf: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'الحضور اللحظي', anyOf: ['attendance.read'] },
  { href: '/exceptions', label: 'الاستثناءات', anyOf: ['attendance.read'] },
  { href: '/sessions', label: 'الجلسات والكشوف', anyOf: ['attendance.read'] },
  { href: '/shifts', label: 'تقرير الورديات', anyOf: ['attendance.read'] },
  { href: '/shifts/manage', label: 'إدارة الورديات', anyOf: ['shifts.manage'] },
  { href: '/periods', label: 'فترات الحضور', anyOf: ['attendance.read'] },
  { href: '/devices', label: 'الأجهزة', anyOf: ['devices.read'] },
  { href: '/employees', label: 'الموظفون', anyOf: ['employees.read'] },
];

/** الروابط التي يملك المستخدم صلاحية رؤيتها. */
export function navFor(permissions: readonly string[]): NavItem[] {
  return NAV_ITEMS.filter((item) => item.anyOf.some((perm) => permissions.includes(perm)));
}

/** هل تُعرض الإدارة أصلًا، أم أن المستخدم موظف يستخدم تطبيق الجوال؟ */
export function hasAdminSurface(permissions: readonly string[]): boolean {
  return navFor(permissions).length > 0;
}
