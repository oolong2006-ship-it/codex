import { prisma } from "@/lib/prisma";
import { formatSupplierCode } from "@/lib/utils";

export const DEFAULT_ORG_SLUG = process.env.DEFAULT_ORG_SLUG || "demo";

/**
 * Resolve the organization that public supplier registrations attach to.
 * In a full SaaS each registration link would carry its own org; for the MVP
 * public suppliers join the default tenant.
 */
export async function getDefaultOrganization() {
  const org = await prisma.organization.findUnique({ where: { slug: DEFAULT_ORG_SLUG } });
  if (org) return org;
  const first = await prisma.organization.findFirst();
  if (!first) throw new Error("No organization exists. Run the seed script first.");
  return first;
}

/**
 * Allocate the next SUP-###### code for a tenant. Uses a transaction-safe count
 * of existing suppliers; collisions are guarded by the unique constraint.
 */
export async function nextSupplierCode(organizationId: string): Promise<string> {
  const count = await prisma.supplier.count({ where: { organizationId } });
  return formatSupplierCode(count + 1);
}
