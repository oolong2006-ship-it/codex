import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools, withTenant } from "@/server/db";
import {
  addAction, cancelAction, capaMetrics, closeCorrectionOnly, completeAction, getNc, listNcs, ncReportContent, recordAnalysis, recordContainment, reportNc, verifyEffectiveness,
} from "@/server/domain/capa";
import { addMember } from "@/server/domain/orgs";
import { resolveCtx, type TenantCtx } from "@/server/domain/tenant";
import { renderDocx } from "@/server/docs/docx";
import { newOrg, ownerQuery } from "./helpers";

afterAll(closePools);

let owner: TenantCtx, qm: TenantCtx, worker: TenantCtx, auditor: TenantCtx, viewer: TenantCtx;
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const nc = (over: Record<string, unknown> = {}) => ({
  title: "استلام دجاج بدرجة حرارة مرتفعة",
  description: "تم استلام شحنة دجاج بدرجة 9° في فرع العليا ولم ترفض عند الاستلام.",
  source: "INSPECTION" as const,
  severity: "MAJOR" as const,
  detectedOn: day(-1),
  processCode: "FS-02",
  ...over,
});
const analysis = { method: "FIVE_WHYS" as const, whys: ["لم يُقس الحرارة", "لا يوجد مقياس في منطقة الاستلام", "لم يُحدد في قائمة الفحص"], rootCause: "قائمة فحص الاستلام لا تتضمن قياس الحرارة ولا يتوفر جهاز قياس في منطقة الاستلام." };
const verify = { result: "EFFECTIVE" as const, method: "مراجعة سجلات الاستلام لأسبوعين", evidence: "14 سجل استلام تتضمن قياس الحرارة؛ رُفضت شحنتان مخالفتان." };

beforeAll(async () => {
  const o = await newOrg("FOOD_SERVICE");
  owner = o.ctx;
  const mk = async (role: "QUALITY_MANAGER" | "CONTRIBUTOR" | "AUDITOR" | "VIEWER") =>
    resolveCtx((await addMember(owner, { email: `${role}-${Math.random().toString(36).slice(2, 8)}@test.local`, fullName: role, role })).userId, owner.orgId);
  qm = await mk("QUALITY_MANAGER");
  worker = await mk("CONTRIBUTOR");
  auditor = await mk("AUDITOR");
  viewer = await mk("VIEWER");
});

describe("reporting", () => {
  it("numbers cases sequentially per organization and year", async () => {
    const a = await reportNc(worker, nc());
    const b = await reportNc(auditor, nc({ source: "INTERNAL_AUDIT" }));
    const y = new Date().getUTCFullYear();
    expect(a.code).toMatch(new RegExp(`^NC-${y}-\\d{4}$`));
    expect(Number(b.code.slice(-4))).toBe(Number(a.code.slice(-4)) + 1);
    const other = await newOrg("SOFTWARE");
    expect((await reportNc(other.ctx, nc())).code).toBe(`NC-${y}-0001`);
  });

  it("rejects future detection dates, vague descriptions and viewers", async () => {
    await expect(reportNc(worker, nc({ detectedOn: day(2) }))).rejects.toThrow(/المستقبل/);
    await expect(reportNc(worker, nc({ description: "قصير" }))).rejects.toThrow();
    await expect(reportNc(viewer, nc())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("database also refuses a future detection date", async () => {
    await expect(
      withTenant(owner.orgId, owner.userId, (db) =>
        db.query("INSERT INTO nonconformities (org_id, code, source, severity, title, description, detected_on, reported_by) VALUES ($1,'X-1','OTHER','MINOR','t','d',current_date + 3,$2)", [owner.orgId, owner.userId]),
      ),
    ).rejects.toThrow(/FUTURE_DATE/);
  });
});

describe("full CAPA cycle", () => {
  let id: string;
  let actionId: string;

  it("requires containment before analysis, and analysis before actions", async () => {
    id = (await reportNc(worker, nc())).id;
    await expect(recordAnalysis(qm, id, analysis)).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    await expect(recordContainment(worker, id, "عزل الشحنة وإتلافها")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await recordContainment(qm, id, "عزل الشحنة وإتلافها وإبلاغ المورد كتابياً.");
    await expect(addAction(qm, id, { description: "إضافة قياس الحرارة لقائمة الفحص", ownerId: worker.userId, dueOn: day(7) })).rejects.toMatchObject({ code: "GATE_BLOCKED" });
    await expect(recordAnalysis(qm, id, { ...analysis, whys: ["واحد"] })).rejects.toMatchObject({ code: "VALIDATION" });
    await recordAnalysis(qm, id, analysis);
    await expect(recordAnalysis(qm, id, analysis)).rejects.toMatchObject({ code: "CONFLICT" }); // analysis is immutable
  });

  it("plans actions with members only and non-past due dates", async () => {
    const outsider = await newOrg("GENERAL");
    await expect(addAction(qm, id, { description: "إجراء لمسؤول من خارج المنشأة", ownerId: outsider.owner.userId, dueOn: day(7) })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addAction(qm, id, { description: "إجراء بموعد في الماضي", ownerId: worker.userId, dueOn: day(-3) })).rejects.toThrow(/الماضي/);
    actionId = await addAction(qm, id, { description: "إضافة قياس الحرارة إلى قائمة فحص الاستلام وتوفير مقياس", ownerId: worker.userId, dueOn: day(7) });
    const extra = await addAction(qm, id, { description: "تدريب موظفي الاستلام على قائمة الفحص المحدثة", ownerId: worker.userId, dueOn: day(10) });
    expect((await getNc(owner, id)).nc.status).toBe("ACTION_PLANNED");
    await cancelAction(qm, extra, "دُمج التدريب في الإجراء الأول");
  });

  it("only the action owner or a manager completes an action; completion is final", async () => {
    await expect(completeAction(auditor, actionId, "تم التنفيذ حسب الخطة")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(completeAction(worker, actionId, "تم")).rejects.toThrow(); // note too short
    await completeAction(worker, actionId, "حُدثت قائمة الفحص QM-WI-002 ووُضع مقياس في منطقة الاستلام.");
    await expect(completeAction(worker, actionId, "مرة أخرى بعد الإنجاز")).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    await expect(
      withTenant(owner.orgId, owner.userId, (db) => db.query("UPDATE corrective_actions SET completion_note = 'تعديل لاحق' WHERE id = $1", [actionId])),
    ).rejects.toThrow(/ACTION_FINAL/);
    expect((await getNc(owner, id)).nc.status).toBe("IMPLEMENTED");
  });

  it("verification must be independent from the action implementer", async () => {
    await expect(verifyEffectiveness(worker, id, verify)).rejects.toMatchObject({ code: "FORBIDDEN" }); // contributor lacks capa.verify
    // QM completed nothing, so QM may verify; but make QM complete an action in a second case to test segregation below.
    await expect(verifyEffectiveness(auditor, id, { ...verify, evidence: "قصير" })).rejects.toThrow();
  });

  it("INEFFECTIVE reopens for a new analysis cycle, EFFECTIVE closes", async () => {
    await verifyEffectiveness(auditor, id, { result: "INEFFECTIVE", method: "مراجعة سجلات أسبوع", evidence: "3 سجلات استلام دون قياس للحرارة رغم التحديث." });
    let r = await getNc(owner, id);
    expect(r.nc).toMatchObject({ status: "CONTAINED", cycle: 2 });
    await recordAnalysis(qm, id, { method: "OTHER", whys: [], rootCause: "المقياس الموفر يُحفظ في المكتب وليس في نقطة الاستلام فعلياً." });
    const a2 = await addAction(qm, id, { description: "تثبيت المقياس في نقطة الاستلام وتوقيع المستلم على القراءة", ownerId: qm.userId, dueOn: day(3) });
    await completeAction(qm, a2, "ثُبّت المقياس بسلسلة في نقطة الاستلام.");
    await expect(verifyEffectiveness(qm, id, verify)).rejects.toMatchObject({ code: "SEGREGATION_OF_DUTIES" });
    await verifyEffectiveness(auditor, id, verify);
    r = await getNc(owner, id);
    expect(r.nc).toMatchObject({ status: "CLOSED", closure_type: "EFFECTIVE_CAPA" });
    expect(r.analyses).toHaveLength(2);
    expect(r.checks.map((c) => c.result)).toEqual(["INEFFECTIVE", "EFFECTIVE"]);
    expect(r.timeline.map((t) => t.action)).toEqual(
      expect.arrayContaining(["nc.reported", "nc.contained", "nc.analyzed", "capa.action_added", "capa.action_done", "capa.verified_ineffective", "capa.verified_effective"]),
    );
  });

  it("a closed case is immutable, and evidence tables are append-only", async () => {
    await expect(withTenant(owner.orgId, owner.userId, (db) => db.query("UPDATE nonconformities SET title = 'x' WHERE id = $1", [id]))).rejects.toThrow(/NC_CLOSED/);
    await expect(withTenant(owner.orgId, owner.userId, (db) => db.query("UPDATE effectiveness_checks SET result = 'EFFECTIVE'"))).rejects.toThrow(/permission denied/);
    await expect(withTenant(owner.orgId, owner.userId, (db) => db.query("DELETE FROM nc_analyses"))).rejects.toThrow(/permission denied/);
  });

  it("produces a DOCX report of the full record (digital QM-FRM-001)", async () => {
    const r = await getNc(owner, id);
    const buf = await renderDocx(ncReportContent(r), {
      orgName: r.orgName, code: r.nc.code, title: `تقرير عدم مطابقة وإجراء تصحيحي — ${r.nc.title}`, versionNo: 1, status: "EFFECTIVE", classification: "SUGGESTED",
      author: "x", approver: null, approvedAt: null, effectiveAt: null, history: [],
    });
    const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
    expect(xml).toContain(r.nc.code);
    expect(xml).toContain("الدورة 2");
    expect(xml).toContain("غير فعّال");
  });
});

describe("closure rules", () => {
  it("correction-only closure is limited to MINOR cases with justification", async () => {
    const major = (await reportNc(worker, nc())).id;
    await recordContainment(qm, major, "تم التصحيح الفوري للحالة المكتشفة.");
    await expect(closeCorrectionOnly(qm, major, "حالة فردية لا تتكرر ولا تحتاج إجراء")).rejects.toMatchObject({ code: "GATE_BLOCKED" });
    await expect(
      withTenant(owner.orgId, owner.userId, (db) => db.query("UPDATE nonconformities SET status = 'CLOSED', closure_type = 'CORRECTION_ONLY' WHERE id = $1", [major])),
    ).rejects.toThrow(/CAPA_REQUIRED/);
    await expect(
      withTenant(owner.orgId, owner.userId, (db) => db.query("UPDATE nonconformities SET status = 'CLOSED', closure_type = 'EFFECTIVE_CAPA' WHERE id = $1", [major])),
    ).rejects.toThrow(/EFFECTIVENESS_NOT_VERIFIED/);

    const minor = (await reportNc(worker, nc({ severity: "MINOR", title: "ملصق تاريخ غير واضح على عبوة" }))).id;
    await expect(closeCorrectionOnly(qm, minor, "حالة فردية لا تتكرر ولا تحتاج إجراء")).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" }); // not contained yet
    await recordContainment(qm, minor, "أُعيد لصق التاريخ بوضوح على العبوة.");
    await expect(closeCorrectionOnly(qm, minor, "قصير")).rejects.toThrow();
    await closeCorrectionOnly(qm, minor, "حالة فردية سببها تلف الملصق أثناء النقل؛ لا نمط متكرر في السجلات.");
    expect((await getNc(owner, minor)).nc).toMatchObject({ status: "CLOSED", closure_type: "CORRECTION_ONLY" });
  });

  it("skipping states is impossible even with direct SQL", async () => {
    const x = (await reportNc(worker, nc())).id;
    await expect(withTenant(owner.orgId, owner.userId, (db) => db.query("UPDATE nonconformities SET status = 'IMPLEMENTED' WHERE id = $1", [x]))).rejects.toThrow(/ILLEGAL_TRANSITION/);
  });
});

describe("metrics, listing and isolation", () => {
  it("reports separate CAPA metrics", async () => {
    const m = await capaMetrics(owner);
    expect(m.closed_effective).toBeGreaterThanOrEqual(1);
    expect(m.closed_correction).toBeGreaterThanOrEqual(1);
    expect(m.reopened).toBeGreaterThanOrEqual(1);
    expect(m.open).toBeGreaterThanOrEqual(1);
  });

  it("other organizations see nothing and cannot act", async () => {
    const other = await newOrg("SOFTWARE");
    const mine = (await listNcs(owner))[0];
    expect((await listNcs(other.ctx)).map((n) => n.id)).not.toContain(mine.id);
    await expect(getNc(other.ctx, mine.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(recordContainment(other.ctx, mine.id, "محاولة احتواء من منشأة أخرى")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const leaked = await withTenant(other.orgId, other.ctx.userId, async (db) => (await db.query("SELECT count(*)::int AS n FROM corrective_actions")).rows[0].n);
    expect(leaked).toBe(0);
    const [{ n }] = await ownerQuery("SELECT count(*)::int AS n FROM corrective_actions WHERE org_id = $1", [owner.orgId]);
    expect(n).toBeGreaterThan(0);
  });
});
