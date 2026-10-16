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

/** Builds an org with a QM, a completed ISO 9001 project and generated documents (domain-level, no UI). */
export async function seedProjectWithDocuments(industry: keyof typeof import("./golden").GOLDEN = "restaurantChain") {
  const { GOLDEN } = await import("./golden");
  const { addMember } = await import("@/server/domain/orgs");
  const P = await import("@/server/domain/projects");
  const { drainJobs } = await import("@/server/domain/jobs");
  await import("@/server/domain/documents");
  const g = GOLDEN[industry];
  const o = await newOrg(g.industry, `منشأة ${industry}`);
  const q = await addMember(o.ctx, { email: `qm-${randomUUID().slice(0, 8)}@test.local`, fullName: "مدير الجودة", role: "QUALITY_MANAGER" });
  const qm = await resolveCtx(q.userId, o.orgId);
  const [hq] = await ownerQuery("SELECT id FROM sites WHERE org_id = $1", [o.orgId]);
  const projectId = await P.createProject(o.ctx, { title: "مشروع اختبار", siteIds: [hq.id] });
  for (let i = 0; i < 100; i++) {
    const st = await P.getIntakeState(o.ctx, projectId);
    if (!st.next) break;
    await P.answerQuestion(o.ctx, projectId, st.next.id, g.answers[st.next.id]);
  }
  await P.generateBlueprint(o.ctx, projectId);
  await P.approveScope(o.ctx, projectId, "يشمل نظام إدارة الجودة الأنشطة الموصوفة في المقر الرئيسي للمنشأة.");
  await P.requestDocumentGeneration(o.ctx, projectId);
  await drainJobs();
  return { ...o, qm, projectId };
}
