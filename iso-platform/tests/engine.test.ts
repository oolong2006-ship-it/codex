import { describe, expect, it } from "vitest";
import { buildBlueprint } from "@/server/domain/blueprint-engine";
import { detectConflicts, nextQuestion, normaliseAnswer, findQuestion, progress, questionsFor } from "@/server/packs";
import { findPlaceholders, writeDocument } from "@/server/docs/writer";
import { GOLDEN } from "./golden";

const bp = (key: keyof typeof GOLDEN) =>
  buildBlueprint({ industry: GOLDEN[key].industry, answers: GOLDEN[key].answers, orgName: "منشأة", siteNames: ["المقر"], licenseActive: false });

describe("industry differentiation (charter §6)", () => {
  it("every golden client passes the gate", () => {
    for (const k of Object.keys(GOLDEN) as (keyof typeof GOLDEN)[]) expect(bp(k).gates, k).toMatchObject({ ready: true });
  });

  it("different sectors produce genuinely different process maps and document plans", () => {
    const keys = Object.keys(GOLDEN) as (keyof typeof GOLDEN)[];
    const coreSets = keys.map((k) => bp(k).processes.filter((p) => p.category === "CORE").map((p) => p.code).sort().join(","));
    expect(new Set(coreSets).size).toBe(keys.length);
    const plans = keys.map((k) => bp(k).documentPlan.map((d) => d.title).join("|"));
    expect(new Set(plans).size).toBe(keys.length);
  });

  it("restaurant chain gets delivery + central kitchen, not manufacturing steps", () => {
    const codes = bp("restaurantChain").processes.map((p) => p.code);
    expect(codes).toEqual(expect.arrayContaining(["FS-02", "FS-03", "FS-05", "FS-06", "FS-01"]));
    expect(codes).not.toContain("FS-07"); // no catering selected
    expect(codes.some((c) => c.startsWith("MF-"))).toBe(false);
    expect(bp("restaurantChain").separateSchemes.join(" ")).toMatch(/سلامة الغذاء/);
  });

  it("design & development is N/A only with a recorded justification", () => {
    const f = bp("factory");
    const d10 = f.applicability.find((a) => a.domainCode === "D10")!;
    expect(d10.applicable).toBe(false);
    expect(d10.justification).toContain("رسومات ومواصفات العملاء");
    expect(f.documentPlan.some((d) => d.domainCode === "D10")).toBe(false);
    expect(f.processes.map((p) => p.code)).toContain("MF-07"); // traceability required
  });

  it("software always includes design & development", () => {
    const s = bp("softwareCo");
    expect(s.applicability.find((a) => a.domainCode === "D10")!.applicable).toBe(true);
    expect(s.documentPlan.some((d) => d.code === "QM-PRO-009")).toBe(true);
  });

  it("calibration only when measuring equipment is used", () => {
    expect(bp("restaurantChain").processes.some((p) => p.code === "SUP-05")).toBe(true);
    expect(bp("softwareCo").processes.some((p) => p.code === "SUP-05")).toBe(false);
  });
});

describe("licensing gate & classification honesty (charter §5, §15)", () => {
  it("never marks anything REQUIRED_VERIFIED without a reviewed licensed mapping", () => {
    for (const k of Object.keys(GOLDEN) as (keyof typeof GOLDEN)[]) {
      const b = bp(k);
      expect(b.documentPlan.some((d) => d.classification === "REQUIRED_VERIFIED")).toBe(false);
      expect(b.licensing.requirementMapping).toBe("UNAVAILABLE_NO_LICENSE");
    }
  });
  it("quality manual is OPTIONAL, not mandatory", () => {
    expect(bp("factory").documentPlan.find((d) => d.type === "MANUAL")!.classification).toBe("OPTIONAL");
  });
  it("risks are hypotheses and regulators require verification", () => {
    const b = bp("contractor");
    expect(b.risks.length).toBeGreaterThan(0);
    expect(b.regulatorsToVerify.every((r) => r.status === "NEEDS_SOURCE_VERIFICATION")).toBe(true);
  });
});

describe("adaptive interview", () => {
  it("branches: multi-site question only appears for >1 site; delivery channel only with delivery", () => {
    expect(nextQuestion("FOOD_SERVICE", { "core.products_services": "x", "core.customer_types": ["individuals"], "core.sites_count": 1 })!.id).toBe("core.headcount");
    expect(nextQuestion("FOOD_SERVICE", { "core.products_services": "x", "core.customer_types": ["individuals"], "core.sites_count": 3 })!.id).toBe("core.multi_site_same_activities");
    const ids = (a: Record<string, unknown>) => questionsFor("FOOD_SERVICE").filter((q) => !q.when || q.when(a as never)).map((q) => q.id);
    expect(ids({ "fs.service_model": ["dine_in"] })).not.toContain("fs.delivery_channel");
    expect(ids({ "fs.service_model": ["delivery"] })).toContain("fs.delivery_channel");
  });

  it("sector question sets differ", () => {
    const a = questionsFor("FOOD_SERVICE").map((q) => q.id);
    const b = questionsFor("SOFTWARE").map((q) => q.id);
    expect(a).toContain("fs.service_model");
    expect(b).not.toContain("fs.service_model");
    expect(b).toContain("sw.delivery_model");
  });

  it("detects contradictions", () => {
    expect(detectConflicts("SOFTWARE", { "core.design_dev": false }).map((c) => c.id)).toContain("software_without_design");
    expect(detectConflicts("FOOD_SERVICE", { "core.headcount": 2, "core.sites_count": 5 }).map((c) => c.id)).toContain("headcount_lt_sites");
    expect(detectConflicts("FOOD_SERVICE", { "core.existing_certs": ["none", "iso9001_2015"] }).map((c) => c.id)).toContain("none_with_other_certs");
  });

  it("blocks blueprint when critical facts are missing or conflicted", () => {
    const b = buildBlueprint({ industry: "SOFTWARE", answers: { ...GOLDEN.softwareCo.answers, "core.design_dev": false }, orgName: "x", siteNames: [], licenseActive: false });
    expect(b.gates.ready).toBe(false);
    const m = buildBlueprint({ industry: "FOOD_SERVICE", answers: {}, orgName: "x", siteNames: [], licenseActive: false });
    expect(m.gates.missingCritical).toContain("core.products_services");
  });

  it("validates answers server-side", () => {
    const q = findQuestion("FOOD_SERVICE", "core.sites_count")!;
    expect(() => normaliseAnswer(q, "0")).toThrow();
    expect(() => normaliseAnswer(q, "abc")).toThrow();
    expect(normaliseAnswer(q, "4")).toBe(4);
    const m = findQuestion("FOOD_SERVICE", "fs.service_model")!;
    expect(() => normaliseAnswer(m, ["hacked"])).toThrow();
    expect(progress("FOOD_SERVICE", {}).answered).toBe(0);
  });
});

describe("document writer never fabricates", () => {
  it("objectives leave targets to management as [MISSING] placeholders", () => {
    const b = bp("restaurantChain");
    const obj = writeDocument(b.documentPlan.find((d) => d.type === "OBJECTIVES")!, { orgName: "مطاعم", products: "وجبات", bp: b });
    expect(findPlaceholders(obj).join(" ")).toMatch(/المستهدف/);
    const json = JSON.stringify(obj);
    expect(json).not.toMatch(/\d+\s*%/); // no invented percentages
  });
  it("policy carries no pre-filled signature or approval date", () => {
    const b = bp("factory");
    const pol = writeDocument(b.documentPlan.find((d) => d.type === "POLICY")!, { orgName: "مصنع", products: "عبوات", bp: b });
    expect(JSON.stringify(pol)).toContain("لا يُدرج توقيع");
  });
});
