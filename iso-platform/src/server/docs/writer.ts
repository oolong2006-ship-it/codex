/**
 * Policy & Procedure Writer — deterministic (rules:v1).
 * Produces structured content from the approved blueprint. It never invents facts:
 * anything the client must decide or provide is emitted as a [MISSING: …] placeholder,
 * so it is visible in review and blocks approval until resolved.
 */
import type { Blueprint, BlueprintProcess, PlannedDocument } from "../domain/blueprint-engine";

export interface DocTable {
  headers: string[];
  rows: string[][];
}
export interface DocSection {
  heading: string;
  paragraphs: string[];
  table?: DocTable;
}
export interface DocContent {
  sections: DocSection[];
}

export const WRITER_ID = "rules:v1";
export const MISSING_RE = /\[MISSING:[^\]]*\]/g;

export function findPlaceholders(content: DocContent): string[] {
  const out = new Set<string>();
  for (const s of content.sections) {
    for (const t of [s.heading, ...s.paragraphs, ...(s.table ? s.table.rows.flat() : [])]) {
      for (const m of t.match(MISSING_RE) ?? []) out.add(m);
    }
  }
  return [...out];
}

export interface WriterCtx {
  orgName: string;
  products: string;
  bp: Blueprint;
}

const purpose = (text: string): DocSection => ({ heading: "الغرض", paragraphs: [text] });
const scopeSec = (text: string): DocSection => ({ heading: "مجال التطبيق", paragraphs: [text] });
const refs = (codes: string[]): DocSection => ({
  heading: "المراجع",
  paragraphs: [
    ...(codes.length ? [`وثائق مرتبطة: ${codes.join("، ")}.`] : []),
    "الربط بمتطلبات ISO 9001:2026 يُضاف بعد توفر مرجع متطلبات مرخّص ومراجعته.",
  ],
});

function procedureFromProcess(p: BlueprintProcess | undefined, title: string, related: string[]): DocContent {
  if (!p) {
    return {
      sections: [
        purpose(`تحديد طريقة تنفيذ «${title}» وضبطها.`),
        { heading: "الخطوات", paragraphs: ["[MISSING: خطوات العمل الفعلية كما تنفذها المنشأة]"] },
        refs(related),
      ],
    };
  }
  return {
    sections: [
      purpose(`تحديد طريقة تنفيذ عملية «${p.nameAr}» وضبطها بما يحقق نتائجها المقصودة.`),
      scopeSec("تنطبق على جميع المواقع والأنشطة الداخلة في نطاق نظام إدارة الجودة ما لم يُذكر خلاف ذلك."),
      {
        heading: "المسؤوليات",
        paragraphs: [`مالك العملية: ${p.ownerRole}. يُحدَّد اسم الشاغل الفعلي في مصفوفة المسؤوليات.`],
      },
      {
        heading: "المدخلات والمخرجات",
        paragraphs: [],
        table: { headers: ["المدخلات", "المخرجات"], rows: zip(p.inputs, p.outputs) },
      },
      { heading: "الخطوات", paragraphs: p.steps.map((s, i) => `${i + 1}. ${s}`) },
      {
        heading: "مؤشرات الأداء",
        paragraphs: [],
        table: {
          headers: ["المؤشر", "المستهدف", "دورية القياس"],
          rows: p.kpis.map((k) => [k, "[MISSING: المستهدف تحدده الإدارة]", "[MISSING: الدورية]"]),
        },
      },
      { heading: "السجلات", paragraphs: p.outputs.map((o) => `• ${o} — تُحفظ إلكترونياً في المنصة وفق مدة الاحتفاظ المعتمدة.`) },
      refs(related),
    ],
  };
}

function zip(a: string[], b: string[]): string[][] {
  const n = Math.max(a.length, b.length);
  return Array.from({ length: n }, (_, i) => [a[i] ?? "", b[i] ?? ""]);
}

export function writeDocument(doc: PlannedDocument, ctx: WriterCtx): DocContent {
  const { bp, orgName } = ctx;
  const proc = doc.processCode ? bp.processes.find((p) => p.code === doc.processCode) : undefined;

  switch (doc.type) {
    case "SCOPE":
      return {
        sections: [
          purpose(`توثيق حدود نظام إدارة الجودة لدى ${orgName} وقابليته للتطبيق.`),
          { heading: "بيان النطاق", paragraphs: [bp.scopeStatement] },
          {
            heading: "انطباق المجالات التشغيلية",
            paragraphs: ["يُعتمد هذا الجدول من الإدارة العليا؛ أي مجال غير منطبق يجب أن يكون مسوغه موثقاً ولا يؤثر في قدرة المنشأة على تقديم منتجات وخدمات مطابقة."],
            table: {
              headers: ["المجال", "الانطباق", "المسوغ"],
              rows: bp.applicability.map((a) => [a.nameAr, a.applicable ? "منطبق" : "غير منطبق", a.justification ?? "—"]),
            },
          },
          refs(["QM-PMP-001"]),
        ],
      };
    case "POLICY":
      return {
        sections: [
          purpose(`إعلان التزام الإدارة العليا في ${orgName} بالجودة وتوجيه الأهداف.`),
          {
            heading: "نص السياسة (مسودة للمراجعة من الإدارة العليا)",
            paragraphs: [
              `تلتزم ${orgName} بتقديم ${ctx.products} بما يلبي متطلبات العملاء والمتطلبات النظامية المنطبقة.`,
              "وتلتزم بوضع أهداف جودة قابلة للقياس ومراجعتها، وبالتحسين المستمر لنظام إدارة الجودة، وبتوفير الموارد والكفاءات اللازمة.",
              "[MISSING: توجهات الإدارة العليا الخاصة — مثل الأولويات الاستراتيجية أو القيم التي تريد المنشأة إبرازها]",
            ],
          },
          {
            heading: "الاعتماد والتواصل",
            paragraphs: [
              "تُعتمد السياسة من أعلى سلطة تنفيذية، وتُبلّغ للعاملين وتُتاح للأطراف المعنية عند الحاجة، وتُراجع في مراجعة الإدارة.",
              "لا تعد السياسة سارية حتى يعتمدها صاحب الصلاحية في المنصة؛ لا يُدرج توقيع أو تاريخ اعتماد مسبق.",
            ],
          },
        ],
      };
    case "OBJECTIVES":
      return {
        sections: [
          purpose("تحديد أهداف الجودة القابلة للقياس وخطط تحقيقها."),
          {
            heading: "الأهداف المقترحة",
            paragraphs: ["المؤشرات التالية مقترحة من خريطة العمليات؛ القيم المستهدفة والمواعيد تحددها الإدارة ولا تقترحها المنصة نيابة عنها."],
            table: {
              headers: ["العملية", "المؤشر", "القيمة الحالية", "المستهدف", "المسؤول", "الموعد"],
              rows: bp.processes
                .filter((p) => p.category === "CORE")
                .flatMap((p) =>
                  p.kpis.slice(0, 1).map((k) => [p.nameAr, k, "[MISSING: خط الأساس]", "[MISSING: المستهدف]", p.ownerRole, "[MISSING: الموعد]"]),
                ),
            },
          },
        ],
      };
    case "PROCESS_MAP":
      return {
        sections: [
          purpose("عرض عمليات نظام إدارة الجودة وتصنيفها وتسلسلها."),
          ...(["MANAGEMENT", "CORE", "SUPPORT"] as const).map((cat) => ({
            heading: { MANAGEMENT: "العمليات الإدارية", CORE: "العمليات الرئيسية", SUPPORT: "العمليات الداعمة" }[cat],
            paragraphs: [],
            table: {
              headers: ["الرمز", "العملية", "المالك", "المدخلات", "المخرجات"],
              rows: bp.processes
                .filter((p) => p.category === cat)
                .map((p) => [p.code, p.nameAr, p.ownerRole, p.inputs.join("، "), p.outputs.join("، ")]),
            },
          })),
          {
            heading: "التفاعلات",
            paragraphs: [
              "تتلقى العمليات الرئيسية متطلبات العملاء وتحولها إلى منتجات وخدمات، وتدعمها العمليات الداعمة بالموارد والمدخلات الخارجية، وتراقبها العمليات الإدارية وتحسنها عبر التدقيق ومراجعة الإدارة والإجراءات التصحيحية.",
            ],
          },
        ],
      };
    case "RACI":
      return {
        sections: [
          purpose("توضيح المسؤوليات والصلاحيات لكل عملية."),
          {
            heading: "المصفوفة",
            paragraphs: ["R منفذ، A مساءل، C مستشار، I يُحاط علماً. أسماء الشاغلين تُستكمل من المنشأة."],
            table: {
              headers: ["العملية", "المالك (A)", "المنفذ (R)", "مدير الجودة", "الإدارة العليا"],
              rows: bp.processes.map((p) => [p.nameAr, p.ownerRole, "[MISSING: المنفذ]", p.code.startsWith("MGT") ? "R" : "C", p.code === "MGT-02" ? "A" : "I"]),
            },
          },
        ],
      };
    case "RISK_REGISTER":
      return {
        sections: [
          purpose("تسجيل المخاطر والفرص المؤثرة في تحقيق نتائج النظام ومتابعة معالجتها."),
          {
            heading: "منهجية التقييم",
            paragraphs: ["الدرجة = الاحتمال (1–5) × الأثر (1–5). الدرجة 15 فأكثر عالية، 8–14 متوسطة، أقل من 8 منخفضة."],
          },
          {
            heading: "السجل (فرضيات أولية تحتاج تأكيد المنشأة)",
            paragraphs: ["البنود التالية فرضيات مستنتجة من نشاط المنشأة (INFERRED) وليست نتائج تقييم فعلي؛ تُؤكد أو تُرفض في ورشة مع مالكي العمليات."],
            table: {
              headers: ["العملية", "النوع", "البند", "الاحتمال", "الأثر", "الدرجة", "المعالجة المقترحة"],
              rows: bp.risks.map((r) => [
                r.processCode,
                r.kind === "RISK" ? "خطر" : "فرصة",
                r.title,
                String(r.likelihood),
                String(r.impact),
                String(r.likelihood * r.impact),
                r.treatment,
              ]),
            },
          },
        ],
      };
    case "MANUAL":
      return {
        sections: [
          purpose(`تقديم نظرة عامة على نظام إدارة الجودة لدى ${orgName}. هذه الوثيقة اختيارية وليست شرطاً.`),
          { heading: "النطاق", paragraphs: [bp.scopeStatement] },
          { heading: "العمليات", paragraphs: bp.processes.map((p) => `• ${p.code} — ${p.nameAr}`) },
          { heading: "الوثائق", paragraphs: bp.documentPlan.map((d) => `• ${d.code} — ${d.title}`) },
        ],
      };
    case "FORM":
      return writeForm(doc);
    case "PROCEDURE":
    case "WORK_INSTRUCTION":
    default:
      return procedureFromProcess(proc, doc.title, ["QM-PMP-001", "QM-RCI-001"]);
  }
}

function writeForm(doc: PlannedDocument): DocContent {
  const fields: Record<string, string[]> = {
    "QM-FRM-001": ["رقم الحالة", "تاريخ الاكتشاف", "المصدر (شكوى/تدقيق/فحص)", "وصف عدم المطابقة", "الاحتواء الفوري", "السبب الجذري", "الإجراء التصحيحي", "المسؤول والموعد", "التحقق من الفاعلية (التاريخ/النتيجة/المتحقق)"],
    "QM-FRM-002": ["اسم المورد", "المواد/الخدمات", "معيار الجودة (1–5)", "معيار الالتزام بالموعد (1–5)", "معيار الاستجابة (1–5)", "النتيجة", "القرار", "المقيّم والتاريخ"],
    "QM-FRM-003": ["اسم الموظف", "الوظيفة", "موضوع التدريب", "الجهة المدربة", "التاريخ", "طريقة تقييم الفاعلية", "النتيجة"],
  };
  const f = fields[doc.code] ?? ["[MISSING: حقول النموذج]"];
  return {
    sections: [
      purpose(`نموذج لتسجيل ${doc.title.replace("نموذج ", "")}. النموذج الفارغ ليس دليلاً على التطبيق؛ الدليل هو السجل المعبأ والمعتمد.`),
      { heading: "الحقول", paragraphs: [], table: { headers: ["الحقل", "القيمة"], rows: f.map((x) => [x, ""]) } },
    ],
  };
}
