import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { register } from "@/server/domain/auth";
import { createOrganization } from "@/server/domain/orgs";
import { resolveCtx } from "@/server/domain/tenant";

export const PW = "Passw0rd-strong";

export async function newUser(name = "مستخدم") {
  const email = `u-${randomUUID().slice(0, 8)}@test.local`;
  const { userId } = await register({ email, fullName: name, password: PW });
  return { userId, email };
}

export async function newOrg(industryCode = "FOOD_SERVICE", name = "منشأة اختبار") {
  const owner = await newUser("مالك");
  const orgId = await createOrganization(owner.userId, { name, industryCode, sizeBand: "SMALL", country: "SA", headOfficeCity: "الرياض" });
  const ctx = await resolveCtx(owner.userId, orgId);
  return { orgId, owner, ctx };
}

/** Owner-role client, used only to inspect state the app role cannot see. */
export async function ownerQuery<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, params)).rows as T[];
  } finally {
    await c.end();
  }
}
