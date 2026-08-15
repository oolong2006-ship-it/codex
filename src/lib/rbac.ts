import type { UserRole } from "@prisma/client";

/**
 * Central permission catalogue. Server-side authorization is derived from this
 * map only — the UI may hide controls, but every mutating action re-checks here.
 */
export const PERMISSIONS = {
  // System
  MANAGE_SYSTEM: "manage_system",
  MANAGE_USERS: "manage_users",
  MANAGE_TAXONOMY: "manage_taxonomy",
  MANAGE_DOCUMENT_TYPES: "manage_document_types",

  // Suppliers (procurement side)
  VIEW_SUPPLIERS: "view_suppliers",
  APPROVE_SUPPLIERS: "approve_suppliers",
  REJECT_SUPPLIERS: "reject_suppliers",
  REQUEST_INFO: "request_info",
  SUSPEND_SUPPLIERS: "suspend_suppliers",
  DELETE_SUPPLIERS: "delete_suppliers",
  EVALUATE_SUPPLIERS: "evaluate_suppliers",
  ADD_NOTES: "add_notes",
  DOWNLOAD_FILES: "download_files",
  MANAGE_SHORTLISTS: "manage_shortlists",
  VIEW_REPORTS: "view_reports",

  // Supplier self-service
  EDIT_OWN_SUPPLIER: "edit_own_supplier",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: Object.values(P),
  PROCUREMENT_ADMIN: [
    P.VIEW_SUPPLIERS,
    P.APPROVE_SUPPLIERS,
    P.REJECT_SUPPLIERS,
    P.REQUEST_INFO,
    P.SUSPEND_SUPPLIERS,
    P.EVALUATE_SUPPLIERS,
    P.ADD_NOTES,
    P.DOWNLOAD_FILES,
    P.MANAGE_SHORTLISTS,
    P.VIEW_REPORTS,
  ],
  PROCUREMENT_USER: [
    P.VIEW_SUPPLIERS,
    P.DOWNLOAD_FILES,
    P.MANAGE_SHORTLISTS,
    P.VIEW_REPORTS,
  ],
  SUPPLIER: [P.EDIT_OWN_SUPPLIER],
};

export function permissionsFor(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function can(role: UserRole, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}

export function isProcurement(role: UserRole): boolean {
  return (
    role === "SUPER_ADMIN" ||
    role === "PROCUREMENT_ADMIN" ||
    role === "PROCUREMENT_USER"
  );
}
