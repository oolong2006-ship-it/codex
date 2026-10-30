/**
 * QMS Systems Designer — deterministic blueprint engine (rules:v1).
 * Pure function: answers + industry pack → process map, applicability, risks, document plan.
 * Everything it derives is marked INFERRED until the client approves the scope.
 */
import {
  CORE_PROCESSES,
  DOMAINS,
  applicableQuestions,
  detectConflicts,
  getPack,
  type Answers,
  type DetectedConflict,
  type ProcessTemplate,
} from "../packs";

export const BLUEPRINT_ENGINE = "rules:v1";

export type Classification = "REQUIRED_VERIFIED" | "REQUIRED_UNVERIFIED" | "SUGGESTED" | "OPTIONAL";
export type DocType =
  | "SCOPE" | "POLICY" | "OBJECTIVES" | "PROCEDURE" | "WORK_INSTRUCTION" | "PROCESS_MAP"
  | "RACI" | "RISK_REGISTER" | "FORM" | "PLAN" | "MANUAL" | "REPORT";

export interface PlannedDocument {
  code: string;
  type: DocType;
  title: string;
  classification: Classification;
  basis: string;
  domainCode: string;
  processCode?: string;
}

export interface BlueprintProcess {
  code: string;
  nameAr: string;
  nameEn: string;
  category: ProcessTemplate["category"];
  ownerRole: string;
  inputs: string[];
  outputs: string[];
  kpis: string[];
  steps: string[];
  rationale: string;
  provenance: "INFERRED";
}

export interface Blueprint {
  engine: string;
  industry: string;
  industryNameAr: string;
  scopeStatement: string;
  processes: BlueprintProcess[];
  applicability: { domainCode: string; nameAr: string; applicable: boolean; justification: string | null; provenance: string }[];
  risks: { processCode: string; kind: "RISK" | "OPPORTUNITY"; title: string; description: string; likelihood: number; impact: number; treatment: string }[];
  documentPlan: PlannedDocument[];
  gates: { missingCritical: string[]; conflicts: DetectedConflict[]; ready: boolean };
  regulatorsToVerify: { country: string; nameAr: string; topicAr: string; status: "NEEDS_SOURCE_VERIFICATION" }[];
  separateSchemes: string[];
  licensing: { requirementMapping: "UNAVAILABLE_NO_LICENSE" | "LICENSED"; note: string };
}

export interface BlueprintInput {
  industry: string;
  answers: Answers;
  orgName: string;
  siteNames: string[];
  licenseActive: boolean;
}

const UNVERIFIED_BASIS =
  "مصنفة «مطلوبة» بناءً على الممارسة المستقرة في إصدارات ISO 9001؛ يلزم تأكيدها مقابل نص ISO 9001:2026 المرخّص قبل ادعاء الإلزام.";

export function buildBlueprint(input: BlueprintInput): Blueprint {
  const { industry, answers } = input;
  const pack = getPack(industry);

  const missingCritical = applicableQuestions(industry, answers)
    .filter((q) => q.critical && answers[q.id] === undefined)
    .map((q) => q.id);
  const conflicts = detectConflicts(industry, answers);

  const templates = [...CORE_PROCESSES, ...pack.processes].filter((p) => !p.when || p.when(answers));
  const processes: BlueprintProcess[] = templates.map((p) => ({
    code: p.code,
    nameAr: p.ar,
    nameEn: p.en,
    category: p.category,
    ownerRole: p.ownerAr,
    inputs: p.inputsAr,
    outputs: p.outputsAr,
    kpis: p.kpisAr,
    steps: p.stepsAr,
    rationale: p.rationaleAr,
    provenance: "INFERRED",
  }));
  const codes = new Set(processes.map((p) => p.code));

  const applicability = DOMAINS.map((d) => {
    const reason = d.notApplicableBecause?.(answers, industry, !!pack.forcesDesign) ?? null;
    return { domainCode: d.code, nameAr: d.ar, applicable: reason === null, justification: reason, provenance: "INFERRED" };
  });
  const isApplicable = (code: string) => applicability.find((a) => a.domainCode === code)?.applicable ?? true;

  const risks = pack.risks
    .filter((r) => codes.has(r.processCode))
    .map((r) => ({
      processCode: r.processCode,
      kind: r.kind,
      title: r.ar,
      description: r.descAr,
      likelihood: r.likelihood,
      impact: r.impact,
      treatment: r.treatmentAr,
    }));

  const products = String(answers["core.products_services"] ?? "[MISSING: المنتجات والخدمات]");
  const sites = input.siteNames.length ? input.siteNames.join("، ") : "[MISSING: المواقع]";
  const nonApplicable = applicability.filter((a) => !a.applicable);
  const scopeStatement =
    `يشمل نظام إدارة الجودة لدى ${input.orgName} الأنشطة التالية: ${products}، ` +
    `والمنفذة في المواقع: ${sites}.` +
    (nonApplicable.length
      ? ` المجالات غير المنطبقة: ${nonApplicable.map((a) => `${a.nameAr} (${a.justification})`).join("؛ ")}.`
      : "");

  const documentPlan = planDocuments(processes, isApplicable);

  return {
    engine: BLUEPRINT_ENGINE,
    industry: pack.code,
    industryNameAr: pack.ar,
    scopeStatement,
    processes,
    applicability,
    risks,
    documentPlan,
    gates: {
      missingCritical,
      conflicts,
      ready: missingCritical.length === 0 && !conflicts.some((c) => c.level === "CONFLICT"),
    },
    regulatorsToVerify: pack.regulatorsToVerify.map((r) => ({ ...r, status: "NEEDS_SOURCE_VERIFICATION" as const })),
    separateSchemes: pack.separateSchemesAr,
    licensing: input.licenseActive
      ? { requirementMapping: "LICENSED", note: "ربط المتطلبات متاح وفق الترخيص النشط ويخضع لمراجعة خبير." }
      : {
          requirementMapping: "UNAVAILABLE_NO_LICENSE",
          note: "لا يوجد ترخيص نشط لمحتوى ISO 9001:2026؛ المخطط مبني على مجالات تشغيلية أصلية ولا يدّعي تغطية كاملة للمتطلبات.",
        },
  };
}

function planDocuments(processes: BlueprintProcess[], isApplicable: (d: string) => boolean): PlannedDocument[] {
  // Promoted to REQUIRED_VERIFIED only by expert review of a licensed requirement mapping — never automatically.
  const req: Classification = "REQUIRED_UNVERIFIED";
  const docs: PlannedDocument[] = [
    { code: "QM-SCP-001", type: "SCOPE", title: "نطاق نظام إدارة الجودة", classification: req, basis: UNVERIFIED_BASIS, domainCode: "D03" },
    { code: "QM-POL-001", type: "POLICY", title: "سياسة الجودة", classification: req, basis: UNVERIFIED_BASIS, domainCode: "D04" },
    { code: "QM-OBJ-001", type: "OBJECTIVES", title: "أهداف الجودة وخطط تحقيقها", classification: req, basis: UNVERIFIED_BASIS, domainCode: "D05" },
    { code: "QM-PMP-001", type: "PROCESS_MAP", title: "خريطة العمليات وتفاعلاتها", classification: "SUGGESTED", basis: "وسيلة تطبيق مقترحة لإظهار العمليات وتسلسلها وتفاعلها.", domainCode: "D08" },
    { code: "QM-RCI-001", type: "RACI", title: "مصفوفة المسؤوليات والصلاحيات", classification: "SUGGESTED", basis: "وسيلة مقترحة لتوثيق الأدوار والصلاحيات.", domainCode: "D04" },
    { code: "QM-RSK-001", type: "RISK_REGISTER", title: "سجل المخاطر والفرص", classification: "SUGGESTED", basis: "التفكير المبني على المخاطر مطلوب؛ السجل وسيلة تطبيق مقترحة وليس شكلاً إلزامياً.", domainCode: "D05" },
    { code: "QM-PRO-001", type: "PROCEDURE", title: "إجراء ضبط المعلومات الموثقة", classification: "SUGGESTED", basis: "إجراء مقترح؛ الإلزام يقع على ضبط المعلومات لا على وجود إجراء مكتوب.", domainCode: "D07", processCode: "SUP-01" },
    { code: "QM-PRO-002", type: "PROCEDURE", title: "إجراء الكفاءة والتدريب والتوعية", classification: "SUGGESTED", basis: "إجراء مقترح.", domainCode: "D07", processCode: "SUP-02" },
    { code: "QM-PRO-003", type: "PROCEDURE", title: "إجراء المشتريات وتقييم الموردين", classification: "SUGGESTED", basis: "إجراء مقترح.", domainCode: "D11", processCode: "SUP-03" },
    { code: "QM-PRO-004", type: "PROCEDURE", title: "إجراء شكاوى العملاء وقياس الرضا", classification: "SUGGESTED", basis: "إجراء مقترح.", domainCode: "D14", processCode: "SUP-06" },
    { code: "QM-PRO-005", type: "PROCEDURE", title: "إجراء التدقيق الداخلي", classification: "SUGGESTED", basis: "إجراء مقترح؛ نتائج التدقيق وبرنامجه سجلات يُتوقع الاحتفاظ بها (تُؤكد مقابل النص المرخّص).", domainCode: "D15", processCode: "MGT-03" },
    { code: "QM-PRO-006", type: "PROCEDURE", title: "إجراء مراجعة الإدارة", classification: "SUGGESTED", basis: "إجراء مقترح.", domainCode: "D16", processCode: "MGT-02" },
    { code: "QM-PRO-007", type: "PROCEDURE", title: "إجراء عدم المطابقة والإجراء التصحيحي", classification: "SUGGESTED", basis: "إجراء مقترح؛ سجلات عدم المطابقة والإجراءات المتخذة يُتوقع الاحتفاظ بها.", domainCode: "D17", processCode: "MGT-04" },
  ];
  if (processes.some((p) => p.code === "SUP-05")) {
    docs.push({ code: "QM-PRO-008", type: "PROCEDURE", title: "إجراء ضبط أجهزة القياس والمعايرة", classification: "SUGGESTED", basis: "مُدرج لاستخدام أجهزة قياس تعتمد عليها قرارات القبول.", domainCode: "D06", processCode: "SUP-05" });
  }
  if (isApplicable("D10")) {
    const designProc = processes.find((p) => ["FS-01", "MF-02", "CN-08", "SW-02", "ED-01"].includes(p.code));
    docs.push({ code: "QM-PRO-009", type: "PROCEDURE", title: "إجراء التصميم والتطوير", classification: "SUGGESTED", basis: "مُدرج لانطباق مجال التصميم والتطوير.", domainCode: "D10", processCode: designProc?.code });
  }
  let wi = 1;
  for (const p of processes.filter((x) => x.category === "CORE")) {
    docs.push({
      code: `QM-WI-${String(wi++).padStart(3, "0")}`,
      type: "WORK_INSTRUCTION",
      title: `تعليمات عمل: ${p.nameAr}`,
      classification: "SUGGESTED",
      basis: "تعليمات تشغيلية مقترحة لضبط العملية الأساسية وفق نشاط المنشأة.",
      domainCode: "D08",
      processCode: p.code,
    });
  }
  docs.push(
    { code: "QM-FRM-001", type: "FORM", title: "نموذج تقرير عدم مطابقة وإجراء تصحيحي", classification: "SUGGESTED", basis: "نموذج مقترح لتسجيل الأدلة.", domainCode: "D17" },
    { code: "QM-FRM-002", type: "FORM", title: "نموذج تقييم مورد", classification: "SUGGESTED", basis: "نموذج مقترح.", domainCode: "D11" },
    { code: "QM-FRM-003", type: "FORM", title: "نموذج سجل تدريب", classification: "SUGGESTED", basis: "نموذج مقترح؛ أدلة الكفاءة يُتوقع الاحتفاظ بها.", domainCode: "D07" },
    { code: "QM-MAN-001", type: "MANUAL", title: "دليل الجودة", classification: "OPTIONAL", basis: "غير إلزامي؛ مفيد كمدخل تعريفي للنظام فقط.", domainCode: "D07" },
  );
  return docs;
}
