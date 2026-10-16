import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { withGlobal, withTenant } from "../db";
import { DomainError } from "../errors";
import { ROLES, type Role } from "../rbac";
import { INDUSTRY_CODES } from "../packs";
import { createUser } from "./auth";
import { audit, tx, type TenantCtx } from "./tenant";

export const orgSchema = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().max(200).optional().or(z.literal("")),
  country: z.string().trim().length(2).toUpperCase().default("SA"),
  industryCode: z.enum(INDUSTRY_CODES as [string, ...string[]]),
  sizeBand: z.enum(["MICRO", "SMALL", "MEDIUM", "LARGE"]),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  headOfficeCity: z.string().trim().max(120).optional().or(z.literal("")),
});

export async function createOrganization(userId: string, input: z.input<typeof orgSchema>): Promise<string> {
  const data = orgSchema.parse(input);
  const orgId = randomUUID();
  await withTenant(orgId, userId, async (db) => {
    await db.query(
      `INSERT INTO organizations (id, name, legal_name, country, industry_code, size_band, description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [orgId, data.name, data.legalName || null, data.country, data.industryCode, data.sizeBand, data.description || null, userId],
    );
    await db.query(`INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,'OWNER')`, [orgId, userId]);
    await db.query(
      `INSERT INTO sites (org_id, name, city, country, is_head_office) VALUES ($1,$2,$3,$4,true)`,
      [orgId, "المقر الرئيسي", data.headOfficeCity || null, data.country],
    );
    await audit(db, { orgId, userId }, "org.created", "organization", orgId, { name: data.name, industry: data.industryCode });
  });
  return orgId;
}

export async function listMyOrganizations(userId: string) {
  return withGlobal(async (db) => {
    const { rows } = await db.query(
      `SELECT o.id, o.name, o.industry_code, m.role FROM memberships m JOIN organizations o ON o.id = m.org_id
       WHERE m.user_id = $1 ORDER BY o.created_at`,
      [userId],
    );
    return rows as { id: string; name: string; industry_code: string; role: Role }[];
  }, userId);
}

export async function getOrganization(ctx: TenantCtx) {
  return tx(ctx, "read", async (db) => {
    const { rows } = await db.query("SELECT * FROM organizations WHERE id = $1", [ctx.orgId]);
    if (!rows[0]) throw new DomainError("NOT_FOUND", "المنشأة غير موجودة");
    return rows[0];
  });
}

export async function updateOrganization(ctx: TenantCtx, input: z.input<typeof orgSchema>) {
  const data = orgSchema.parse(input);
  await tx(ctx, "org.manage", async (db) => {
    await db.query(
      `UPDATE organizations SET name=$1, legal_name=$2, country=$3, industry_code=$4, size_band=$5, description=$6 WHERE id=$7`,
      [data.name, data.legalName || null, data.country, data.industryCode, data.sizeBand, data.description || null, ctx.orgId],
    );
    await audit(db, ctx, "org.updated", "organization", ctx.orgId, data);
  });
}

// ───────────── Sites ─────────────

export const siteSchema = z.object({
  name: z.string().trim().min(2).max(160),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  country: z.string().trim().length(2).toUpperCase().default("SA"),
  address: z.string().trim().max(400).optional().or(z.literal("")),
  activities: z.string().trim().max(1000).optional().or(z.literal("")),
  headcount: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

export async function listSites(ctx: TenantCtx) {
  return tx(ctx, "read", async (db) => (await db.query("SELECT * FROM sites ORDER BY is_head_office DESC, created_at")).rows);
}

export async function addSite(ctx: TenantCtx, input: z.input<typeof siteSchema>) {
  const d = siteSchema.parse(input);
  return tx(ctx, "sites.manage", async (db) => {
    const { rows } = await db.query(
      `INSERT INTO sites (org_id, name, city, country, address, activities, headcount) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [ctx.orgId, d.name, d.city || null, d.country, d.address || null, d.activities || null, d.headcount ?? null],
    );
    await audit(db, ctx, "site.created", "site", rows[0].id, { name: d.name });
    return rows[0].id as string;
  });
}

export async function updateSite(ctx: TenantCtx, siteId: string, input: z.input<typeof siteSchema>) {
  const d = siteSchema.parse(input);
  await tx(ctx, "sites.manage", async (db) => {
    const r = await db.query(
      `UPDATE sites SET name=$1, city=$2, country=$3, address=$4, activities=$5, headcount=$6 WHERE id=$7`,
      [d.name, d.city || null, d.country, d.address || null, d.activities || null, d.headcount ?? null, siteId],
    );
    if (!r.rowCount) throw new DomainError("NOT_FOUND", "الموقع غير موجود");
    await audit(db, ctx, "site.updated", "site", siteId, d);
  });
}

export async function deleteSite(ctx: TenantCtx, siteId: string) {
  await tx(ctx, "sites.manage", async (db) => {
    const r = await db.query("DELETE FROM sites WHERE id = $1 AND is_head_office = false", [siteId]);
    if (!r.rowCount) throw new DomainError("NOT_FOUND", "الموقع غير موجود أو هو المقر الرئيسي");
    await audit(db, ctx, "site.deleted", "site", siteId);
  });
}

// ───────────── Members ─────────────

export async function listMembers(ctx: TenantCtx) {
  return tx(ctx, "read", async (db) => {
    const { rows } = await db.query(
      `SELECT m.user_id, m.role, m.job_title, u.email, u.full_name FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.org_id = $1 ORDER BY m.created_at`,
      [ctx.orgId],
    );
    return rows;
  });
}

export const memberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(ROLES),
  jobTitle: z.string().trim().max(120).optional().or(z.literal("")),
});

/**
 * Adds a member. If the user does not exist, an account is created with a one-time
 * password that must be changed at first login (interim until an email provider is approved).
 */
export async function addMember(ctx: TenantCtx, input: z.input<typeof memberSchema>) {
  const d = memberSchema.parse(input);
  if (d.role === "OWNER" && ctx.role !== "OWNER") throw new DomainError("FORBIDDEN", "فقط المالك يعيّن مالكاً");
  return tx(ctx, "members.manage", async (db) => {
    let tempPassword: string | null = null;
    let userId: string | undefined = (await db.query("SELECT id FROM users WHERE lower(email) = $1", [d.email])).rows[0]?.id;
    if (!userId) {
      tempPassword = randomBytes(9).toString("base64url") + "7a";
      userId = await createUser(db, { email: d.email, fullName: d.fullName, password: tempPassword }, true);
    }
    const r = await db.query(
      `INSERT INTO memberships (org_id, user_id, role, job_title) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [ctx.orgId, userId, d.role, d.jobTitle || null],
    );
    if (!r.rowCount) throw new DomainError("CONFLICT", "العضو مضاف مسبقاً");
    await audit(db, ctx, "member.added", "membership", userId, { email: d.email, role: d.role });
    return { userId, tempPassword };
  });
}

export async function changeMemberRole(ctx: TenantCtx, userId: string, role: Role) {
  if (!ROLES.includes(role)) throw new DomainError("VALIDATION", "دور غير صالح");
  await tx(ctx, "members.manage", async (db) => {
    await ensureNotLastOwner(db, userId, role);
    const r = await db.query("UPDATE memberships SET role = $1 WHERE org_id = $2 AND user_id = $3", [role, ctx.orgId, userId]);
    if (!r.rowCount) throw new DomainError("NOT_FOUND", "العضو غير موجود");
    await audit(db, ctx, "member.role_changed", "membership", userId, { role });
  });
}

export async function removeMember(ctx: TenantCtx, userId: string) {
  await tx(ctx, "members.manage", async (db) => {
    await ensureNotLastOwner(db, userId, null);
    const r = await db.query("DELETE FROM memberships WHERE org_id = $1 AND user_id = $2", [ctx.orgId, userId]);
    if (!r.rowCount) throw new DomainError("NOT_FOUND", "العضو غير موجود");
    await audit(db, ctx, "member.removed", "membership", userId);
  });
}

async function ensureNotLastOwner(db: import("../db").Db, userId: string, newRole: Role | null) {
  if (newRole === "OWNER") return;
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE role='OWNER')::int AS owners, bool_or(user_id = $1 AND role='OWNER') AS target_is_owner FROM memberships`,
    [userId],
  );
  if (rows[0].target_is_owner && rows[0].owners <= 1) throw new DomainError("CONFLICT", "لا يمكن إزالة آخر مالك للمنشأة");
}

export async function listAuditLog(ctx: TenantCtx, limit = 200) {
  return tx(ctx, "audit_log.read", async (db) => {
    const { rows } = await db.query(
      `SELECT l.*, u.full_name AS actor_name FROM tenant_audit_logs l LEFT JOIN users u ON u.id = l.actor_id
       ORDER BY l.at DESC LIMIT $1`,
      [Math.min(limit, 1000)],
    );
    return rows;
  });
}
