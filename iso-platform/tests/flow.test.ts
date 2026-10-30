/** ISO 9001 consulting path end-to-end at the domain level (charter §18 acceptance subset for P1/P2). */
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools, withTenant } from "@/server/db";
import {
  approveVersion,
  contentToText,
  diffLines,
  getDocument,
  listDocuments,
  makeEffective,
  newRevision,
  rejectVersion,
  saveDraft,
  submitForReview,
  textToContent,
} from "@/server/domain/documents";
import { drainJobs } from "@/server/domain/jobs";
import { addMember, addSite } from "@/server/domain/orgs";
import {
  answerQuestion,
  approveScope,
  createProject,
  generateBlueprint,
  getIntakeState,
  listFacts,
  listProcesses,
  listRisks,
  requestDocumentGeneration,
  verifyFact,
} from "@/server/domain/projects";
import { resolveCtx, type TenantCtx } from "@/server/domain/tenant";
import { renderDocx } from "@/server/docs/docx";
import { findPlaceholders } from "@/server/docs/writer";
import { GOLDEN } from "./golden";
import { newOrg, ownerQuery } from "./helpers";

afterAll(closePools);

let owner: TenantCtx;
let qm: TenantCtx;
let contributor: TenantCtx;
let projectId: string;

async function answerAll(ctx: TenantCtx, pid: string, answers: Record<string, unknown>) {
  // Answer in the order the interview asks, proving the adaptive flow reaches completion.
  for (let i = 0; i < 100; i++) {
    const st = await getIntakeState(ctx, pid);
    if (!st.next) return st;
    const v = answers[st.next.id];
    if (v === undefined) throw new Error(`golden set lacks ${st.next.id}`);
    await answerQuestion(ctx, pid, st.next.id, v);
  }
  throw new Error("interview did not converge");
}

beforeAll(async () => {
  const o = await newOrg("FOOD_SERVICE", "مطاعم النخبة");
  owner = o.ctx;
  const site2 = await addSite(owner, { name: "فرع العليا", city: "الرياض" });
  const hq = (await ownerQuery("SELECT id FROM sites WHERE org_id = $1 AND is_head_office", [owner.orgId]))[0].id;
  const q = await addMember(owner, { email: `qm-${Date.now()}@test.local`, fullName: "مدير الجودة", role: "QUALITY_MANAGER" });
  qm = await resolveCtx(q.userId, owner.orgId);
  const c = await addMember(owner, { email: `c-${Date.now()}@test.local`, fullName: "مساهم", role: "CONTRIBUTOR" });
  contributor = await resolveCtx(c.userId, owner.orgId);
  projectId = await createProject(owner, { title: "تأسيس نظام ISO 9001:2026", siteIds: [hq, site2] });
});

describe("ISO 9001 consulting flow", () => {
  it("project is bound to the verified default edition ISO 9001:2026", async () => {
    const [p] = await ownerQuery(
      "SELECT e.edition_label, e.status, e.published_on::text FROM projects p JOIN standard_editions e ON e.id = p.standard_edition_id WHERE p.id = $1",
      [projectId],
    );
    expect(p).toMatchObject({ edition_label: "2026", status: "PUBLISHED", published_on: "2026-09-16" });
  });

  it("blueprint is gated until the interview is complete and consistent", async () => {
    await expect(generateBlueprint(owner, projectId)).rejects.toMatchObject({ code: "GATE_BLOCKED" });
    await answerQuestion(owner, projectId, "core.products_services", "وجبات");
    await answerQuestion(owner, projectId, "core.customer_types", ["individuals"]);
    await answerQuestion(owner, projectId, "core.sites_count", 6);
    await answerQuestion(owner, projectId, "core.multi_site_same_activities", true);
    await answerQuestion(owner, projectId, "core.headcount", 3); // conflict: fewer people than sites
    const st = await getIntakeState(owner, projectId);
    expect(st.conflicts.map((c) => c.id)).toContain("headcount_lt_sites");
    const facts = await listFacts(owner, projectId);
    expect(facts.find((f) => f.key === "core.headcount")!.status).toBe("CONFLICTED");
    expect(facts.find((f) => f.key === "core.design_dev")!.status).toBe("MISSING");
  });

  it("contributor can answer; inapplicable questions are rejected", async () => {
    await expect(answerQuestion(contributor, projectId, "fs.delivery_channel", "own_fleet")).rejects.toMatchObject({ code: "VALIDATION" });
    await answerQuestion(contributor, projectId, "core.headcount", 140); // resolves conflict
    const st = await answerAll(contributor, projectId, GOLDEN.restaurantChain.answers);
    expect(st.status).toBe("COMPLETED");
    expect(st.conflicts.filter((c) => c.level === "CONFLICT")).toHaveLength(0);
    const facts = await listFacts(owner, projectId);
    expect(facts.find((f) => f.key === "core.headcount")!.status).toBe("CLIENT_PROVIDED");
  });

  it("verifying a fact requires a reviewer note and the right permission", async () => {
    const fact = (await listFacts(owner, projectId)).find((f) => f.key === "core.sites_count")!;
    await expect(verifyFact(contributor, fact.id, "سجل تجاري")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(verifyFact(owner, fact.id, "  ")).rejects.toMatchObject({ code: "VALIDATION" });
    await verifyFact(owner, fact.id, "مطابقة مع السجلات التجارية للفروع");
    expect((await listFacts(owner, projectId)).find((f) => f.key === "core.sites_count")!.status).toBe("VERIFIED");
  });

  it("generates a sector-specific blueprint with processes and risk hypotheses", async () => {
    await expect(generateBlueprint(contributor, projectId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const bp = await generateBlueprint(qm, projectId);
    expect(bp.gates.ready).toBe(true);
    expect(bp.scopeStatement).toContain("مطاعم النخبة");
    expect(bp.scopeStatement).toContain("فرع العليا");
    const procs = await listProcesses(owner, projectId);
    expect(procs.map((p) => p.code)).toEqual(expect.arrayContaining(["FS-06", "FS-05", "MGT-03"]));
    const risks = await listRisks(owner, projectId);
    expect(risks.every((r) => r.provenance === "INFERRED" && r.status === "HYPOTHESIS")).toBe(true);
  });

  it("documents cannot be generated before the client approves scope", async () => {
    await expect(requestDocumentGeneration(owner, projectId)).rejects.toMatchObject({ code: "GATE_BLOCKED" });
    await expect(approveScope(owner, projectId, "نطاق [MISSING: x] طويل بما يكفي للاختبار")).rejects.toMatchObject({ code: "GATE_BLOCKED" });
    await expect(approveScope(contributor, projectId, "نطاق صالح وطويل بما يكفي للاعتماد")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await approveScope(owner, projectId, "يشمل نظام إدارة الجودة لدى مطاعم النخبة تحضير الوجبات وتقديمها في الصالات والتوصيل في المقر الرئيسي وفرع العليا.");
    await expect(answerQuestion(owner, projectId, "core.headcount", 150)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("generates controlled documents through the durable job queue, idempotently", async () => {
    const jobId = await requestDocumentGeneration(owner, projectId);
    expect(await requestDocumentGeneration(owner, projectId)).toBe(jobId); // no duplicate jobs
    await drainJobs();
    const docs = await listDocuments(owner, projectId);
    expect(docs.length).toBeGreaterThanOrEqual(20);
    expect(docs.every((d) => d.latest_status === "DRAFT" && d.latest_version === 1)).toBe(true);
    expect(new Set(docs.map((d) => d.code)).size).toBe(docs.length);
    const [job] = await ownerQuery("SELECT status, result FROM jobs WHERE id = $1", [jobId]);
    expect(job.status).toBe("SUCCEEDED");
    // Re-running does not duplicate
    await withTenant(owner.orgId, owner.userId, (db) => db.query("UPDATE projects SET status = 'SCOPE_APPROVED' WHERE id = $1", [projectId]));
    await requestDocumentGeneration(owner, projectId);
    await drainJobs();
    expect((await listDocuments(owner, projectId)).length).toBe(docs.length);
  });

  it("enforces the controlled-document lifecycle with segregation of duties", async () => {
    const docs = await listDocuments(owner, projectId);
    const pol = docs.find((d) => d.doc_type === "POLICY")!;
    const v1 = pol.latest_version_id;
    let { versions } = await getDocument(owner, pol.id);
    expect(findPlaceholders(versions[0].content).length).toBeGreaterThan(0);

    // contributor edits the draft (resolving placeholders), submits
    const text = contentToText(versions[0].content).replace(/\[MISSING:[^\]]*\]/g, "تلتزم الإدارة بالتميز في خدمة الضيوف.");
    await saveDraft(contributor, v1, textToContent(text), "استكمال توجهات الإدارة");
    await submitForReview(contributor, v1);
    await expect(saveDraft(contributor, v1, textToContent(text + "\nتعديل"), "x")).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });

    // contributor cannot approve; QM approves (different person from author)
    await expect(approveVersion(contributor, v1)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(makeEffective(qm, v1)).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    await approveVersion(qm, v1, "مطابقة");
    await makeEffective(qm, v1);
    ({ versions } = await getDocument(owner, pol.id));
    expect(versions[0].status).toBe("EFFECTIVE");

    // effective content is immutable even with direct SQL from the app role
    await expect(
      withTenant(owner.orgId, owner.userId, (db) => db.query("UPDATE document_versions SET content = '{}'::jsonb WHERE id = $1", [v1])),
    ).rejects.toThrow(/IMMUTABLE_VERSION/);

    // revision → v2 draft, approval → effective supersedes v1
    const v2 = await newRevision(qm, pol.id, "تحديث سنوي");
    await expect(newRevision(qm, pol.id, "مكرر")).rejects.toMatchObject({ code: "CONFLICT" });
    const t2 = textToContent(text.replace("بالتميز", "بالتميز والاستدامة"));
    await saveDraft(qm, v2, t2, "إضافة الاستدامة");
    await submitForReview(qm, v2);
    await expect(approveVersion(qm, v2)).rejects.toMatchObject({ code: "SEGREGATION_OF_DUTIES" });
    await approveVersion(owner, v2);
    await makeEffective(owner, v2);
    ({ versions } = await getDocument(owner, pol.id));
    expect(versions.map((v) => [v.version_no, v.status])).toEqual([
      [2, "EFFECTIVE"],
      [1, "SUPERSEDED"],
    ]);

    // diff between versions shows the change
    const d = diffLines(contentToText(versions[1].content), contentToText(versions[0].content));
    expect(d.some((x) => x.op === "+" && x.line.includes("الاستدامة"))).toBe(true);
    expect(d.some((x) => x.op === "-" && !x.line.includes("الاستدامة"))).toBe(true);
  });

  it("blocks approval while [MISSING] placeholders remain, and supports rejection", async () => {
    const obj = (await listDocuments(owner, projectId)).find((d) => d.doc_type === "OBJECTIVES")!;
    await submitForReview(contributor, obj.latest_version_id);
    await expect(approveVersion(qm, obj.latest_version_id)).rejects.toMatchObject({ code: "GATE_BLOCKED" });
    await expect(rejectVersion(qm, obj.latest_version_id, "")).rejects.toMatchObject({ code: "VALIDATION" });
    await rejectVersion(qm, obj.latest_version_id, "أكمل المستهدفات");
    const v2 = await newRevision(contributor, obj.id, "معالجة ملاحظات المراجع");
    const { versions } = await getDocument(owner, obj.id);
    expect(versions[0]).toMatchObject({ id: v2, status: "DRAFT", version_no: 2 });
    expect(versions[1].status).toBe("REJECTED");
  });

  it("renders an editable RTL DOCX with code, version history and Arabic text", async () => {
    const pol = (await listDocuments(owner, projectId)).find((d) => d.doc_type === "POLICY")!;
    const { document, versions, org } = await getDocument(owner, pol.id);
    const v = versions[0];
    const buf = await renderDocx(v.content, {
      orgName: org.name,
      code: document.code,
      title: document.title,
      versionNo: v.version_no,
      status: v.status,
      classification: document.classification,
      author: v.author_name,
      approver: v.approver_name,
      approvedAt: v.approved_at?.toISOString().slice(0, 10) ?? null,
      effectiveAt: v.effective_at?.toISOString().slice(0, 10) ?? null,
      history: versions.map((x) => ({ versionNo: x.version_no, status: x.status, summary: x.change_summary, date: x.created_at.toISOString().slice(0, 10) })),
    });
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("<w:bidi/>");
    expect(xml).toContain("<w:rtl/>");
    expect(xml).toContain("<w:bidiVisual/>");
    expect(xml).toContain("QM-POL-001");
    expect(xml).toContain("الاستدامة");
    expect(xml).toContain("سجل الإصدارات");
    const headers = Object.keys(zip.files).filter((f) => f.startsWith("word/header"));
    expect(headers.length).toBeGreaterThan(0);
    const footer = await zip.file(Object.keys(zip.files).find((f) => f.startsWith("word/footer"))!)!.async("string");
    expect(footer).toContain("NUMPAGES");
  });

  it("records an audit trail for the whole flow", async () => {
    const rows = await ownerQuery("SELECT DISTINCT action FROM tenant_audit_logs WHERE org_id = $1", [owner.orgId]);
    const actions = rows.map((r) => r.action);
    for (const a of ["project.created", "intake.answered", "fact.verified", "blueprint.generated", "scope.approved", "documents.generated", "document.approved", "document.effective", "document.rejected"]) {
      expect(actions, a).toContain(a);
    }
  });
});
