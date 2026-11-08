export const ROLES = ["OWNER", "MANAGER", "CASHIER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard:view",
  PROGRAM_MANAGE: "program:manage",
  BRANCH_MANAGE: "branch:manage",
  STAFF_MANAGE: "staff:manage",
  CUSTOMER_VIEW: "customer:view",
  CUSTOMER_PRIVACY: "customer:privacy",
  CAMPAIGN_SEND: "campaign:send",
  INTEGRATION_MANAGE: "integration:manage",
  STAMP: "card:stamp",
  REDEEM: "card:redeem",
} as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL = Object.values(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: ALL,
  MANAGER: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PROGRAM_MANAGE,
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.CAMPAIGN_SEND,
    PERMISSIONS.STAMP,
    PERMISSIONS.REDEEM,
  ],
  CASHIER: [PERMISSIONS.STAMP, PERMISSIONS.REDEEM],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
