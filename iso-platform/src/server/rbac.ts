import { DomainError } from "./errors";

export const ROLES = ["OWNER", "QUALITY_MANAGER", "CONTRIBUTOR", "AUDITOR", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "org.manage",
  "members.manage",
  "sites.manage",
  "project.manage",
  "intake.answer",
  "blueprint.generate",
  "scope.approve",
  "document.edit",
  "document.submit",
  "document.approve",
  "document.make_effective",
  "audit_log.read",
  "nc.report",
  "nc.manage",
  "capa.verify",
  "read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  QUALITY_MANAGER: [
    "sites.manage",
    "project.manage",
    "intake.answer",
    "blueprint.generate",
    "document.edit",
    "document.submit",
    "document.approve",
    "document.make_effective",
    "audit_log.read",
    "nc.report",
    "nc.manage",
    "capa.verify",
    "read",
  ],
  CONTRIBUTOR: ["intake.answer", "document.edit", "document.submit", "nc.report", "read"],
  AUDITOR: ["audit_log.read", "nc.report", "capa.verify", "read"],
  VIEWER: ["read"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function assertCan(role: Role, permission: Permission) {
  if (!can(role, permission)) throw new DomainError("FORBIDDEN", `Role ${role} lacks permission ${permission}`);
}
