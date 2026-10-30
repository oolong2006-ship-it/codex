import { afterAll, describe, expect, it } from "vitest";
import { closePools } from "@/server/db";
import { changePassword, getSession, login, logout, register } from "@/server/domain/auth";
import { addMember, addSite, changeMemberRole, listAuditLog, removeMember, updateOrganization } from "@/server/domain/orgs";
import { resolveCtx } from "@/server/domain/tenant";
import { can } from "@/server/rbac";
import { PW, newOrg, newUser, ownerQuery } from "./helpers";

afterAll(closePools);

describe("authentication", () => {
  it("registers, logs in, resolves session, logs out", async () => {
    const { email } = await newUser();
    const { token } = await login(email.toUpperCase(), PW, "1.1.1.1");
    const s = await getSession(token);
    expect(s?.email).toBe(email);
    await logout(token);
    expect(await getSession(token)).toBeNull();
  });

  it("stores only scrypt hashes and session token hashes", async () => {
    const { email } = await newUser();
    const { token } = await login(email, PW, null);
    const [u] = await ownerQuery("SELECT password_hash FROM users WHERE email = $1", [email]);
    expect(u.password_hash).toMatch(/^scrypt\$/);
    expect(u.password_hash).not.toContain(PW);
    const rows = await ownerQuery("SELECT 1 FROM sessions WHERE token_hash = $1", [token]);
    expect(rows.length).toBe(0); // raw token never stored
  });

  it("rejects weak passwords and duplicate emails", async () => {
    await expect(register({ email: "weak@test.local", fullName: "ضعيف", password: "short" })).rejects.toThrow();
    const { email } = await newUser();
    await expect(register({ email, fullName: "مكرر", password: PW })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rate-limits repeated failures and records attempts", async () => {
    const { email } = await newUser();
    for (let i = 0; i < 8; i++) await expect(login(email, "wrong-password-1", "9.9.9.9")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(login(email, PW, "9.9.9.9")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const [r] = await ownerQuery("SELECT count(*)::int AS n FROM login_attempts WHERE email = $1 AND success = false", [email]);
    expect(r.n).toBe(8);
  });

  it("unknown email fails the same way as a wrong password", async () => {
    await expect(login("nobody@test.local", PW, null)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("change password revokes all sessions", async () => {
    const { email, userId } = await newUser();
    const { token } = await login(email, PW, null);
    await changePassword(userId, PW, "NewPassw0rd-xyz");
    expect(await getSession(token)).toBeNull();
    await expect(login(email, "NewPassw0rd-xyz", null)).resolves.toBeTruthy();
  });
});

describe("RBAC", () => {
  it("permission matrix", () => {
    expect(can("VIEWER", "document.edit")).toBe(false);
    expect(can("AUDITOR", "audit_log.read")).toBe(true);
    expect(can("CONTRIBUTOR", "document.approve")).toBe(false);
    expect(can("QUALITY_MANAGER", "document.approve")).toBe(true);
    expect(can("QUALITY_MANAGER", "members.manage")).toBe(false);
  });

  it("role is resolved from the database and enforced", async () => {
    const { ctx } = await newOrg();
    const { userId, tempPassword } = await addMember(ctx, { email: `v-${Date.now()}@test.local`, fullName: "مشاهد", role: "VIEWER" });
    expect(tempPassword).toBeTruthy();
    const viewer = await resolveCtx(userId, ctx.orgId);
    expect(viewer.role).toBe("VIEWER");
    await expect(addSite(viewer, { name: "فرع جديد" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateOrganization(viewer, { name: "x2", industryCode: "GENERAL", sizeBand: "SMALL" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listAuditLog(viewer)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Forged context for an org the user is not a member of
    const other = await newOrg();
    await expect(resolveCtx(userId, other.orgId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cannot remove or demote the last owner", async () => {
    const { ctx, owner } = await newOrg();
    await expect(removeMember(ctx, owner.userId)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(changeMemberRole(ctx, owner.userId, "VIEWER")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("only an owner can appoint an owner", async () => {
    const { ctx } = await newOrg();
    const qm = await addMember(ctx, { email: `qm-${Date.now()}@test.local`, fullName: "مدير جودة", role: "QUALITY_MANAGER" });
    const qmCtx = await resolveCtx(qm.userId, ctx.orgId);
    await expect(addMember(qmCtx, { email: `o-${Date.now()}@test.local`, fullName: "مالك", role: "OWNER" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("writes an audit trail", async () => {
    const { ctx } = await newOrg();
    await addSite(ctx, { name: "فرع جدة", city: "جدة" });
    const log = await listAuditLog(ctx);
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["org.created", "site.created"]));
  });
});
