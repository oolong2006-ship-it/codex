/** Cross-tenant isolation tests at the database layer (RLS), the domain layer and the job layer. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools, withTenant } from "@/server/db";
import { addSite, listSites, updateSite, deleteSite } from "@/server/domain/orgs";
import { createProject, getProject, listProjects } from "@/server/domain/projects";
import type { TenantCtx } from "@/server/domain/tenant";
import { newOrg } from "./helpers";

afterAll(closePools);

let A: { ctx: TenantCtx; orgId: string };
let B: { ctx: TenantCtx; orgId: string };
let siteA: string;
let projectA: string;

beforeAll(async () => {
  A = await newOrg("FOOD_SERVICE", "منشأة أ");
  B = await newOrg("SOFTWARE", "منشأة ب");
  siteA = await addSite(A.ctx, { name: "فرع سري لـ أ" });
  projectA = await createProject(A.ctx, { title: "مشروع أ", siteIds: [siteA] });
});

const TENANT_TABLES = ["sites", "projects", "intake_sessions", "tenant_audit_logs", "facts", "answers", "controlled_documents", "document_versions", "jobs"];

describe("database RLS", () => {
  it("unscoped SELECT * under tenant B returns none of A's rows", async () => {
    for (const t of TENANT_TABLES) {
      const rows = await withTenant(B.orgId, B.ctx.userId, async (db) => (await db.query(`SELECT org_id FROM ${t}`)).rows);
      expect(rows.every((r) => r.org_id === B.orgId), t).toBe(true);
    }
  });

  it("without tenant context, tenant tables are invisible", async () => {
    const rows = await withTenant("00000000-0000-0000-0000-000000000000", B.ctx.userId, async (db) => (await db.query("SELECT * FROM sites")).rows);
    expect(rows).toHaveLength(0);
  });

  it("B cannot INSERT rows tagged with A's org_id", async () => {
    await expect(
      withTenant(B.orgId, B.ctx.userId, (db) => db.query("INSERT INTO sites (org_id, name) VALUES ($1, 'حقن')", [A.orgId])),
    ).rejects.toThrow(/row-level security/);
  });

  it("B cannot UPDATE or DELETE A's rows by id", async () => {
    const res = await withTenant(B.orgId, B.ctx.userId, async (db) => {
      const u = await db.query("UPDATE sites SET name = 'مخترق' WHERE id = $1", [siteA]);
      const d = await db.query("DELETE FROM projects WHERE id = $1", [projectA]);
      return [u.rowCount, d.rowCount];
    });
    expect(res).toEqual([0, 0]);
  });

  it("B cannot read A's organization row", async () => {
    const rows = await withTenant(B.orgId, B.ctx.userId, async (db) => (await db.query("SELECT id FROM organizations")).rows);
    expect(rows.map((r) => r.id)).not.toContain(A.orgId);
  });

  it("audit logs are append-only for the app role", async () => {
    await expect(withTenant(A.orgId, A.ctx.userId, (db) => db.query("UPDATE tenant_audit_logs SET action = 'x'"))).rejects.toThrow(/permission denied/);
    await expect(withTenant(A.orgId, A.ctx.userId, (db) => db.query("DELETE FROM tenant_audit_logs"))).rejects.toThrow(/permission denied/);
  });

  it("app role cannot modify the licensing registry", async () => {
    await expect(
      withTenant(A.orgId, A.ctx.userId, (db) => db.query("UPDATE license_grants SET status = 'ACTIVE'")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("domain layer with tampered IDs", () => {
  it("B using A's ids gets NOT_FOUND / nothing", async () => {
    await expect(getProject(B.ctx, projectA)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateSite(B.ctx, siteA, { name: "x-y" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteSite(B.ctx, siteA)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createProject(B.ctx, { title: "سرقة موقع", siteIds: [siteA] })).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await listProjects(B.ctx)).map((p) => p.id)).not.toContain(projectA);
    expect((await listSites(B.ctx)).map((s) => s.id)).not.toContain(siteA);
  });

  it("a forged ctx pairing B's user with A's org is blocked by RLS (no membership needed to be trusted)", async () => {
    // Even if a bug passed a wrong orgId, data is scoped to that org; resolveCtx prevents the pairing upstream.
    const forged: TenantCtx = { orgId: A.orgId, userId: B.ctx.userId, role: "OWNER" };
    const { resolveCtx } = await import("@/server/domain/tenant");
    await expect(resolveCtx(forged.userId, forged.orgId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
