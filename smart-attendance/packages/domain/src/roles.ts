/** أدوار المنصة (prompts/phase-1 §4). */
export const ROLES = ['platform_admin', 'tenant_admin', 'hr', 'branch_manager', 'employee'] as const;
export type Role = (typeof ROLES)[number];

/** الأدوار التي تُلزم بـ MFA (TOTP). */
export const MFA_REQUIRED_ROLES: readonly Role[] = ['platform_admin', 'tenant_admin', 'hr'];

export function requiresMfa(roles: readonly Role[]): boolean {
  return roles.some((r) => MFA_REQUIRED_ROLES.includes(r));
}

/** أدوار تملك صلاحية إدارة الأجهزة (إصدار رموز، واعتماد تغيير، وإيقاف). */
export const DEVICE_ADMIN_ROLES: readonly Role[] = ['tenant_admin', 'hr'];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
