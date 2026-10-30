/**
 * Delivery package (ZIP): controlled documents (DOCX + PDF), Master Document List, missing-items
 * register, implementation plan and README. Everything is derived from recorded data — nothing
 * is invented: unknown dates/owners appear as [MISSING: …].
 */
import JSZip from "jszip";
import type { Blueprint } from "../domain/blueprint-engine";
import { packagingSet } from "../domain/documents";
import { getProject, listFacts } from "../domain/projects";
import type { TenantCtx } from "../domain/tenant";
import { renderDocx } from "./docx";
import { CLASS_AR, DOC_TYPE_AR, STATUS_AR, type RenderMeta } from "./labels";
import { renderPdf } from "./pdf";
import { findPlaceholders, type DocContent } from "./writer";

const FOLDER: Record<string, string> = {
  SCOPE: "01_Scope_Policy_Objectives", POLICY: "01_Scope_Policy_Objectives", OBJECTIVES: "01_Scope_Policy_Objectives",
  PROCESS_MAP: "02_Process_Map_RACI_Risks", RACI: "02_Process_Map_RACI_Risks", RISK_REGISTER: "02_Process_Map_RACI_Risks",
  PROCEDURE: "03_Procedures", WORK_INSTRUCTION: "04_Work_Instructions", FORM: "05_Forms", MANUAL: "06_Optional", PLAN: "07_Plans", REPORT: "07_Plans",
};

/** CSV cell: quoted, and neutralised against spreadsheet formula injection. */
export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
const csv = (headers: string[], rows: unknown[][]) =>
  "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

export interface PackageOptions {
  includePdf?: boolean;
  now?: Date;
}

export async function buildDeliveryPackage(ctx: TenantCtx, projectId: string, opts: PackageOptions = {}) {
  const includePdf = opts.includePdf ?? true;
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const project = await getProject(ctx, projectId);
  const bp = project.blueprint as Blueprint | null;
  if (!bp) throw new (await import("../errors")).DomainError("GATE_BLOCKED", "لا يوجد هيكل نظام لهذا المشروع بعد");
  const docs = await packagingSet(ctx, projectId);
  const facts = await listFacts(ctx, projectId);
  const orgName = docs[0]?.meta.orgName ?? "";
  const zip = new JSZip();
  const root = zip.folder(`ISO9001-${today}`)!;

  // 1) Controlled documents
  for (const d of docs) {
    const folder = root.folder(`documents/${FOLDER[d.docType] ?? "08_Other"}`)!;
    folder.file(`${d.fileBase}.docx`, await renderDocx(d.content, d.meta));
    if (includePdf) folder.file(`${d.fileBase}.pdf`, await renderPdf(d.content, d.meta));
  }

  // 2) Master Document List
  const mdlHeaders = ["الرمز", "العنوان", "النوع", "التصنيف", "الإصدار المضمّن", "حالة الإصدار المضمّن", "أحدث حالة", "تاريخ السريان", "أعدّه", "اعتمده", "الملف"];
  const mdlRows = docs.map((d) => [
    d.meta.code, d.meta.title, DOC_TYPE_AR[d.docType] ?? d.docType, CLASS_AR[d.classification] ?? d.classification,
    String(d.meta.versionNo), STATUS_AR[d.meta.status] ?? d.meta.status, STATUS_AR[d.latestStatus] ?? d.latestStatus,
    d.meta.effectiveAt ?? "—", d.meta.author, d.meta.approver ?? "—", `${FOLDER[d.docType] ?? "08_Other"}/${d.fileBase}.docx`,
  ]);
  root.file("00_Master_Document_List.csv", csv(mdlHeaders, mdlRows));
  const effective = docs.filter((d) => d.isEffective).length;
  const mdl: DocContent = {
    sections: [
      { heading: "الغرض", paragraphs: ["قائمة الوثائق الرئيسية لنظام إدارة الجودة: الرمز والإصدار والحالة والتصنيف لكل وثيقة مضمّنة في هذه الحزمة."] },
      { heading: "الملخص", paragraphs: [`عدد الوثائق: ${docs.length}. السارية: ${effective}. غير السارية بعد: ${docs.length - effective}.`, "تُضمَّن النسخة السارية إن وُجدت، وإلا أحدث إصدار مع وسمه «غير سارية»."] },
      { heading: "القائمة", paragraphs: [], table: { headers: mdlHeaders.slice(0, 10), rows: mdlRows.map((r) => r.slice(0, 10)) } },
    ],
  };
  const mdlMeta = packMeta(orgName, "QM-MDL", "قائمة الوثائق الرئيسية", today);
  root.file("00_Master_Document_List.docx", await renderDocx(mdl, mdlMeta));

  // 3) Missing-items register
  const missing: string[][] = [];
  for (const d of docs) for (const p of findPlaceholders(d.content)) missing.push(["بيانات ناقصة في وثيقة", d.meta.code, p, "يُستكمل ثم يُعاد الاعتماد"]);
  for (const d of docs.filter((x) => !x.isEffective)) missing.push(["وثيقة غير سارية", d.meta.code, `${d.meta.title} — ${STATUS_AR[d.latestStatus] ?? d.latestStatus}`, "مراجعة واعتماد وسريان"]);
  for (const f of facts.filter((x) => x.status === "MISSING" || x.status === "CONFLICTED")) missing.push(["حقيقة " + (f.status === "MISSING" ? "ناقصة" : "متعارضة"), f.key, "من المقابلة التشخيصية", "إجابة/تصحيح"]);
  for (const r of bp.regulatorsToVerify) missing.push(["متطلب تنظيمي يحتاج تحققاً", r.country, `${r.nameAr} — ${r.topicAr}`, "إرفاق المصدر وتاريخ التحقق"]);
  for (const d of docs.filter((x) => x.classification === "REQUIRED_UNVERIFIED")) missing.push(["تصنيف إلزام غير متحقق", d.meta.code, d.basis, "تأكيد مقابل مرجع ISO 9001:2026 مرخّص"]);
  if (bp.licensing.requirementMapping !== "LICENSED") missing.push(["ترخيص", "ISO 9001:2026", bp.licensing.note, "قرار المؤسس D-01"]);
  const missHeaders = ["الفئة", "المرجع", "البند", "الإجراء المطلوب"];
  root.file("00_Missing_Items_Register.csv", csv(missHeaders, missing));
  root.file(
    "00_Missing_Items_Register.docx",
    await renderDocx(
      { sections: [{ heading: "الغرض", paragraphs: ["كل ما يلزم استكماله أو التحقق منه قبل اعتبار النظام موثقاً بالكامل. لا يُعد خلو هذا السجل دليلاً على التطبيق."] }, { heading: "السجل", paragraphs: [`عدد البنود: ${missing.length}`], table: { headers: missHeaders, rows: missing } }] },
      packMeta(orgName, "QM-MIS", "سجل النواقص", today),
    ),
  );

  // 4) Implementation plan
  const plan = implementationPlan(bp, docs.length - effective);
  const planMeta = packMeta(orgName, "QM-PLN", "خطة تطبيق نظام إدارة الجودة", today);
  root.file("00_Implementation_Plan.docx", await renderDocx(plan, planMeta));
  if (includePdf) root.file("00_Implementation_Plan.pdf", await renderPdf(plan, planMeta));

  // 5) README
  root.file(
    "README.txt",
    [
      `حزمة تسليم نظام إدارة الجودة — ${orgName}`,
      `المشروع: ${project.title} — ISO 9001:${project.edition.edition_label}`,
      `تاريخ الإنشاء: ${now.toISOString()}`,
      "",
      "المحتويات:",
      "- documents/: الوثائق المضبوطة (Word قابل للتحرير، وPDF).",
      "- 00_Master_Document_List: قائمة الوثائق الرئيسية (CSV يفتح في Excel، وWord).",
      "- 00_Missing_Items_Register: سجل النواقص.",
      "- 00_Implementation_Plan: خطة التطبيق (المواعيد يحددها العميل).",
      "",
      "تنبيهات:",
      "- الوثيقة الموسومة «غير سارية» ليست معتمدة للاستخدام.",
      "- النسخة المطبوعة أو المنزّلة غير مضبوطة؛ الإصدار الساري في المنصة هو المرجع.",
      "- نظام موثق ≠ نظام مطبق ≠ نظام مدقق ≠ منشأة حاصلة على شهادة. المنصة لا تمنح شهادات ISO.",
      "- لا يوجد ترخيص نشط لنص ISO 9001:2026؛ لا تُدّعى تغطية كاملة للمتطلبات.",
    ].join("\r\n"),
  );

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { buffer: buf, fileName: `ISO9001-package-${today}.zip`, counts: { documents: docs.length, effective, missingItems: missing.length } };
}

function packMeta(orgName: string, code: string, title: string, date: string): RenderMeta {
  return {
    orgName, code, title, versionNo: 1, status: "DRAFT", classification: "SUGGESTED",
    author: "منصة أيزو الاستشارية (تقرير مولّد)", approver: null, approvedAt: null, effectiveAt: null,
    history: [{ versionNo: 1, status: "DRAFT", summary: "تقرير مولّد آلياً من بيانات المنصة", date }],
  };
}

export function implementationPlan(bp: Blueprint, notEffective: number): DocContent {
  const D = "[MISSING: الموعد يحدده العميل]";
  const core = bp.processes.filter((p) => p.category === "CORE");
  const rows: string[][] = [
    ["1. التوثيق", `استكمال ومراجعة واعتماد الوثائق غير السارية (${notEffective})`, "مدير الجودة", "وثائق سارية في المنصة", D],
    ["2. التوعية", "تعميم سياسة الجودة والأهداف على العاملين", "الإدارة العليا", "سجل تعميم/حضور", D],
    ...core.map((p) => ["3. التدريب", `تدريب فريق «${p.nameAr}» على إجراءاتها وتعليماتها`, p.ownerRole, "سجل تدريب معبأ مع تقييم الفاعلية", D]),
    ["4. التشغيل", "بدء استخدام النماذج كسجلات فعلية (عدم المطابقة، الموردون، التدريب)", "مالكو العمليات", "سجلات معبأة — النموذج الفارغ ليس دليلاً", D],
    ["5. المخاطر", "ورشة تأكيد/رفض فرضيات المخاطر والفرص وتحديد المعالجات", "مدير الجودة + مالكو العمليات", "سجل مخاطر محدث بحالات مؤكدة", D],
    ...core.map((p) => ["6. القياس", `قياس مؤشر: ${p.kpis[0] ?? "[MISSING: المؤشر]"}`, p.ownerRole, "قيم مقاسة مقابل المستهدف", D]),
    ["7. التدقيق الداخلي", "تدقيق داخلي يغطي جميع العمليات بمدققين مستقلين عن النشاط", "مدير الجودة", "خطة وتقرير تدقيق وحالات عدم مطابقة", D],
    ["8. التصحيح", "معالجة نتائج التدقيق بإجراءات تصحيحية والتحقق من فاعليتها", "مالكو العمليات", "سجلات CAPA مغلقة بعد التحقق", D],
    ["9. مراجعة الإدارة", "عقد مراجعة الإدارة بمدخلاتها وتوثيق قراراتها", "المدير العام", "محضر مراجعة الإدارة", D],
    ["10. الشهادة (اختياري)", "اختيار جهة مانحة معتمدة وترتيب التدقيق الخارجي", "الإدارة العليا", "عقد مع جهة مانحة — المنصة لا تمنح الشهادة", D],
  ];
  return {
    sections: [
      { heading: "الغرض", paragraphs: ["خطة الانتقال من نظام موثق إلى نظام مطبق ومدقق داخلياً. الأنشطة مشتقة من هيكل النظام المعتمد؛ المواعيد والأسماء يحددها العميل."] },
      { heading: "الأنشطة", paragraphs: [], table: { headers: ["المرحلة", "النشاط", "المسؤول", "الدليل المتوقع", "الموعد"], rows } },
      { heading: "تمييز المراحل", paragraphs: ["نظام موثق: الوثائق سارية.", "نظام مطبق: سجلات وأدلة فعلية لفترة تشغيل كافية.", "نظام مدقق: تدقيق داخلي ومراجعة إدارة مكتملان.", "منشأة حاصلة على شهادة: بعد تدقيق خارجي من جهة مانحة معتمدة فقط."] },
    ],
  };
}
