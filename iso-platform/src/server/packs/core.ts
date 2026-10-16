/**
 * Common Management System Core — original operational content authored for this platform.
 * Nothing here reproduces ISO text. Domain names are operational design areas, not clause titles.
 */
import type { Answers, ConflictRule, ProcessTemplate, Question } from "./types";

const yes = (a: Answers, id: string) => a[id] === true;
const num = (a: Answers, id: string) => (typeof a[id] === "number" ? (a[id] as number) : undefined);
const arr = (a: Answers, id: string) => (Array.isArray(a[id]) ? (a[id] as string[]) : []);

export const CORE_QUESTIONS: Question[] = [
  {
    id: "core.products_services",
    section: "PROFILE",
    type: "text",
    ar: "صف المنتجات أو الخدمات الرئيسية التي تقدمها المنشأة لعملائها.",
    en: "Describe the main products or services you deliver to customers.",
    helpAr: "هذه الإجابة أساس صياغة نطاق نظام الجودة؛ كن محدداً (مثال: تقديم وجبات في صالة وتوصيل للمنازل).",
    critical: true,
  },
  {
    id: "core.customer_types",
    section: "PROFILE",
    type: "multi",
    ar: "من هم عملاؤك الرئيسيون؟",
    en: "Who are your main customers?",
    choices: [
      { value: "individuals", ar: "أفراد", en: "Individuals" },
      { value: "businesses", ar: "شركات ومؤسسات", en: "Businesses" },
      { value: "government", ar: "جهات حكومية", en: "Government" },
    ],
    critical: true,
  },
  {
    id: "core.sites_count",
    section: "PROFILE",
    type: "number",
    ar: "كم عدد المواقع أو الفروع التي ستدخل ضمن نطاق النظام؟",
    en: "How many sites/branches will be in scope?",
    min: 1,
    max: 10000,
    critical: true,
  },
  {
    id: "core.multi_site_same_activities",
    section: "PROFILE",
    type: "boolean",
    ar: "هل تمارس جميع المواقع الأنشطة نفسها بالطريقة نفسها؟",
    en: "Do all sites perform the same activities the same way?",
    when: (a) => (num(a, "core.sites_count") ?? 1) > 1,
  },
  {
    id: "core.headcount",
    section: "PROFILE",
    type: "number",
    ar: "كم إجمالي عدد العاملين ضمن النطاق (تقريباً)؟",
    en: "Approximate total headcount in scope?",
    min: 1,
    max: 1_000_000,
    critical: true,
  },
  {
    id: "core.design_dev",
    section: "OPERATIONS",
    type: "boolean",
    ar: "هل تصمم المنشأة منتجاتها أو خدماتها أو تطورها بنفسها (لا تكتفي بالتنفيذ وفق تصميم العميل أو المورّد)؟",
    en: "Do you design/develop your own products or services?",
    helpAr: "يحدد هذا انطباق مجال التصميم والتطوير. الإجابة بـ«لا» تتطلب مسوغاً موثقاً.",
    critical: true,
  },
  {
    id: "core.design_dev_justification",
    section: "OPERATIONS",
    type: "text",
    ar: "وضّح لماذا لا تقوم المنشأة بالتصميم والتطوير (مثلاً: التنفيذ يتم وفق مواصفات العميل كاملة).",
    en: "Explain why design & development is not performed.",
    when: (a) => a["core.design_dev"] === false,
    critical: true,
  },
  {
    id: "core.outsourced",
    section: "OPERATIONS",
    type: "text",
    ar: "ما العمليات أو الأنشطة التي تُسند إلى جهات خارجية وتؤثر في جودة ما تقدمه؟ (اكتب «لا يوجد» إن لم توجد)",
    en: "Which processes affecting quality are outsourced?",
  },
  {
    id: "core.critical_suppliers",
    section: "OPERATIONS",
    type: "number",
    ar: "كم عدد الموردين أو المقاولين الذين يؤثرون مباشرة في جودة منتجك أو خدمتك؟",
    en: "How many suppliers directly affect quality?",
    min: 0,
    max: 100000,
  },
  {
    id: "core.measuring_equipment",
    section: "OPERATIONS",
    type: "boolean",
    ar: "هل تستخدم أجهزة قياس أو فحص يعتمد عليها قرار قبول المنتج أو الخدمة (موازين، موازين حرارة، أجهزة اختبار...)؟",
    en: "Do you use measuring/inspection equipment to accept product or service?",
  },
  {
    id: "core.licenses",
    section: "OPERATIONS",
    type: "text",
    ar: "ما التراخيص أو التصاريح النظامية التي تعمل بموجبها المنشأة؟",
    en: "Which regulatory licenses/permits do you hold?",
    helpAr: "تُسجّل كما يذكرها العميل (CLIENT_PROVIDED) ولا تُعد متحققاً منها حتى تُرفق الأدلة.",
    optional: true,
  },
  {
    id: "core.complaints_channel",
    section: "SYSTEM",
    type: "single",
    ar: "كيف تستقبل شكاوى العملاء وملاحظاتهم حالياً؟",
    en: "How are customer complaints handled today?",
    choices: [
      { value: "none", ar: "لا توجد آلية", en: "No mechanism" },
      { value: "informal", ar: "بشكل غير رسمي (هاتف/واتساب دون تسجيل)", en: "Informal" },
      { value: "formal", ar: "قناة رسمية وتسجيل ومتابعة", en: "Formal & recorded" },
    ],
  },
  {
    id: "core.has_quality_lead",
    section: "SYSTEM",
    type: "boolean",
    ar: "هل يوجد شخص مكلّف بمتابعة الجودة أو نظام الإدارة؟",
    en: "Is someone assigned to lead quality?",
  },
  {
    id: "core.existing_certs",
    section: "SYSTEM",
    type: "multi",
    ar: "ما الشهادات أو الأنظمة المطبقة حالياً؟",
    en: "Which certifications/systems are in place?",
    choices: [
      { value: "none", ar: "لا يوجد", en: "None" },
      { value: "iso9001_2015", ar: "ISO 9001:2015", en: "ISO 9001:2015" },
      { value: "other_iso", ar: "مواصفات ISO أخرى", en: "Other ISO standards" },
      { value: "sector_scheme", ar: "نظام قطاعي (مثل سلامة الغذاء)", en: "Sector scheme" },
    ],
  },
  {
    id: "core.existing_docs",
    section: "SYSTEM",
    type: "single",
    ar: "ما مستوى التوثيق الموجود لديكم حالياً؟",
    en: "Current level of documentation?",
    choices: [
      { value: "none", ar: "لا يوجد توثيق يُذكر", en: "None" },
      { value: "some", ar: "بعض الإجراءات والنماذج", en: "Some" },
      { value: "extensive", ar: "توثيق شامل ومعتمد", en: "Extensive" },
    ],
  },
];

export const CORE_CONFLICTS: ConflictRule[] = [
  {
    id: "headcount_lt_sites",
    level: "CONFLICT",
    questionIds: ["core.headcount", "core.sites_count"],
    test: (a) => (num(a, "core.headcount") ?? Infinity) < (num(a, "core.sites_count") ?? 0),
    ar: "عدد العاملين أقل من عدد المواقع؛ كل موقع يحتاج عاملاً واحداً على الأقل.",
  },
  {
    id: "software_without_design",
    level: "CONFLICT",
    questionIds: ["core.design_dev"],
    test: (a, ind) => ind === "SOFTWARE" && a["core.design_dev"] === false,
    ar: "تطوير البرمجيات نشاط تصميم وتطوير بطبيعته؛ استبعاد التصميم يتعارض مع نشاط المنشأة.",
  },
  {
    id: "certified_without_docs",
    level: "CONFLICT",
    questionIds: ["core.existing_certs", "core.existing_docs"],
    test: (a) => arr(a, "core.existing_certs").includes("iso9001_2015") && a["core.existing_docs"] === "none",
    ar: "ذُكر وجود شهادة ISO 9001:2015 مع عدم وجود توثيق؛ النظام المعتمد يتطلب معلومات موثقة.",
  },
  {
    id: "none_with_other_certs",
    level: "CONFLICT",
    questionIds: ["core.existing_certs"],
    test: (a) => arr(a, "core.existing_certs").includes("none") && arr(a, "core.existing_certs").length > 1,
    ar: "تم اختيار «لا يوجد» مع شهادات أخرى في الوقت نفسه.",
  },
  {
    id: "no_suppliers_physical",
    level: "WARNING",
    questionIds: ["core.critical_suppliers"],
    test: (a, ind) => ["FOOD_SERVICE", "MANUFACTURING", "CONSTRUCTION"].includes(ind) && num(a, "core.critical_suppliers") === 0,
    ar: "من غير المعتاد ألا يوجد موردون مؤثرون في هذا النشاط؛ يُرجى التأكيد.",
  },
];

/** Processes every QMS needs regardless of industry (original wording). */
export const CORE_PROCESSES: ProcessTemplate[] = [
  {
    code: "MGT-01",
    ar: "التخطيط الاستراتيجي وفهم السياق",
    en: "Strategic planning & context",
    category: "MANAGEMENT",
    ownerAr: "الإدارة العليا",
    inputsAr: ["توجهات الملاك", "تحليل السوق", "متطلبات الأطراف المعنية"],
    outputsAr: ["سياسة الجودة", "الأهداف", "خطة المخاطر والفرص"],
    kpisAr: ["نسبة تحقق الأهداف السنوية"],
    stepsAr: [
      "مراجعة القضايا الداخلية والخارجية سنوياً وعند التغيرات الجوهرية.",
      "تحديث سجل الأطراف المعنية واحتياجاتهم.",
      "تحديد الأهداف وخطط تحقيقها ومسؤولياتها.",
    ],
    rationaleAr: "عملية إدارية لازمة لكل نظام إدارة.",
  },
  {
    code: "MGT-02",
    ar: "مراجعة الإدارة",
    en: "Management review",
    category: "MANAGEMENT",
    ownerAr: "المدير العام",
    inputsAr: ["نتائج التدقيق", "أداء العمليات", "رضا العملاء", "حالة الإجراءات التصحيحية"],
    outputsAr: ["قرارات التحسين", "احتياجات الموارد", "محضر المراجعة"],
    kpisAr: ["نسبة تنفيذ قرارات المراجعة في موعدها"],
    stepsAr: ["تجميع المدخلات قبل الاجتماع بأسبوعين.", "عقد الاجتماع وتوثيق القرارات.", "متابعة تنفيذ القرارات."],
    rationaleAr: "آلية القيادة للحكم على ملاءمة النظام وفاعليته.",
  },
  {
    code: "MGT-03",
    ar: "التدقيق الداخلي",
    en: "Internal audit",
    category: "MANAGEMENT",
    ownerAr: "مدير الجودة",
    inputsAr: ["برنامج التدقيق", "نتائج التدقيقات السابقة", "المخاطر"],
    outputsAr: ["تقارير التدقيق", "حالات عدم المطابقة"],
    kpisAr: ["نسبة تنفيذ برنامج التدقيق", "متوسط زمن إغلاق الملاحظات"],
    stepsAr: ["إعداد برنامج سنوي مبني على المخاطر.", "تعيين مدققين مستقلين عن النشاط المدقق.", "إصدار التقرير ومتابعة الإجراءات."],
    rationaleAr: "تقييم مستقل لتطبيق النظام.",
  },
  {
    code: "MGT-04",
    ar: "معالجة عدم المطابقة والتحسين المستمر",
    en: "Nonconformity, corrective action & improvement",
    category: "MANAGEMENT",
    ownerAr: "مدير الجودة",
    inputsAr: ["شكاوى", "نتائج تدقيق", "حالات عدم مطابقة", "اقتراحات"],
    outputsAr: ["إجراءات تصحيحية", "تحقق من الفاعلية", "تحسينات"],
    kpisAr: ["نسبة الإجراءات التصحيحية المغلقة بعد التحقق من فاعليتها"],
    stepsAr: ["تسجيل الحالة واحتواؤها.", "تحليل السبب الجذري.", "تنفيذ الإجراء ثم التحقق من فاعليته قبل الإغلاق."],
    rationaleAr: "حلقة التحسين الأساسية في أي نظام إدارة.",
  },
  {
    code: "SUP-01",
    ar: "ضبط المعلومات الموثقة",
    en: "Documented information control",
    category: "SUPPORT",
    ownerAr: "مدير الجودة",
    inputsAr: ["طلبات إنشاء/تعديل الوثائق"],
    outputsAr: ["وثائق معتمدة وسارية", "سجلات محفوظة"],
    kpisAr: ["نسبة الوثائق المراجعة في موعدها"],
    stepsAr: ["إعداد الوثيقة ومراجعتها واعتمادها قبل الإصدار.", "إتاحة الإصدار الساري فقط في مواقع الاستخدام.", "حفظ السجلات وفق مدد الاحتفاظ."],
    rationaleAr: "تضمن استخدام الإصدار الصحيح وحماية السجلات.",
  },
  {
    code: "SUP-02",
    ar: "الموارد البشرية والكفاءة والتوعية",
    en: "People, competence & awareness",
    category: "SUPPORT",
    ownerAr: "مدير الموارد البشرية",
    inputsAr: ["متطلبات الوظائف", "احتياجات التدريب"],
    outputsAr: ["سجلات التدريب", "تقييمات الكفاءة"],
    kpisAr: ["نسبة إكمال خطة التدريب", "نسبة الموظفين المقيمين كأكفاء"],
    stepsAr: ["تحديد الكفاءة المطلوبة لكل وظيفة.", "سد الفجوات بالتدريب أو التوجيه.", "تقييم فاعلية التدريب وحفظ الأدلة."],
    rationaleAr: "جودة التنفيذ تعتمد على كفاءة الأفراد.",
  },
  {
    code: "SUP-03",
    ar: "المشتريات وتقييم الموردين",
    en: "Purchasing & supplier evaluation",
    category: "SUPPORT",
    ownerAr: "مسؤول المشتريات",
    inputsAr: ["طلبات الشراء", "قائمة الموردين المعتمدين"],
    outputsAr: ["أوامر شراء", "تقييمات الموردين"],
    kpisAr: ["نسبة التوريد المطابق", "نسبة التوريد في الموعد"],
    stepsAr: ["تقييم الموردين قبل اعتمادهم وفق معايير معلنة.", "التحقق من المواد/الخدمات عند الاستلام.", "إعادة تقييم الموردين دورياً."],
    rationaleAr: "المدخلات الخارجية تؤثر مباشرة في جودة المخرجات.",
  },
  {
    code: "SUP-04",
    ar: "البنية التحتية وبيئة العمل والصيانة",
    en: "Infrastructure, work environment & maintenance",
    category: "SUPPORT",
    ownerAr: "مسؤول الصيانة",
    inputsAr: ["قائمة المعدات والمرافق", "بلاغات الأعطال"],
    outputsAr: ["خطة صيانة", "سجلات صيانة"],
    kpisAr: ["نسبة تنفيذ الصيانة الوقائية", "زمن التوقف"],
    stepsAr: ["حصر المعدات المؤثرة في الجودة.", "تنفيذ الصيانة الوقائية والعلاجية.", "تسجيل الأعطال وتحليل تكرارها."],
    rationaleAr: "تضمن جاهزية الموارد اللازمة للتشغيل.",
  },
  {
    code: "SUP-05",
    ar: "ضبط أجهزة القياس والمعايرة",
    en: "Measuring equipment & calibration",
    category: "SUPPORT",
    ownerAr: "مدير الجودة",
    inputsAr: ["قائمة أجهزة القياس"],
    outputsAr: ["شهادات معايرة", "سجل حالة الأجهزة"],
    kpisAr: ["نسبة الأجهزة المعايرة في موعدها"],
    stepsAr: ["ترقيم الأجهزة وتحديد فترات المعايرة.", "معايرتها لدى جهة مؤهلة أو التحقق الداخلي الموثق.", "تقييم أثر الجهاز غير الصالح على النتائج السابقة."],
    when: (a) => yes(a, "core.measuring_equipment"),
    rationaleAr: "مُدرجة لأن العميل أفاد باستخدام أجهزة قياس تعتمد عليها قرارات القبول.",
  },
  {
    code: "SUP-06",
    ar: "التواصل مع العملاء وإدارة الشكاوى والرضا",
    en: "Customer communication, complaints & satisfaction",
    category: "SUPPORT",
    ownerAr: "مسؤول خدمة العملاء",
    inputsAr: ["شكاوى", "استفسارات", "استبيانات"],
    outputsAr: ["ردود موثقة", "تقارير الرضا"],
    kpisAr: ["زمن الاستجابة للشكوى", "مؤشر رضا العملاء"],
    stepsAr: ["استقبال الشكوى وتسجيلها وإشعار العميل.", "التحقيق وتحديد الإجراء.", "إغلاق الشكوى بعد إبلاغ العميل وقياس رضاه."],
    rationaleAr: "صوت العميل مدخل أساسي لقياس الأداء والتحسين.",
  },
];

/**
 * 17 operational design domains (from the project charter §5). These are platform-authored
 * design areas; mapping to licensed requirement IDs happens only via an ACTIVE license grant.
 */
export interface Domain {
  code: string;
  ar: string;
  en: string;
  /** Returns null when applicable; otherwise a justification for non-applicability. */
  notApplicableBecause?: (a: Answers, industry: string, forcesDesign: boolean) => string | null;
}

export const DOMAINS: Domain[] = [
  { code: "D01", ar: "السياق التنظيمي والقضايا الداخلية والخارجية", en: "Organizational context" },
  { code: "D02", ar: "الأطراف المعنية والمتطلبات الواجبة التطبيق", en: "Interested parties & applicable requirements" },
  { code: "D03", ar: "نطاق نظام الجودة وحدوده ومواقعه", en: "QMS scope" },
  { code: "D04", ar: "القيادة والسياسة والمسؤوليات والصلاحيات", en: "Leadership, policy & roles" },
  { code: "D05", ar: "التخطيط للمخاطر والفرص والأهداف والتغيير", en: "Risks, opportunities, objectives & change" },
  { code: "D06", ar: "الموارد والبنية التحتية وموارد المراقبة والقياس", en: "Resources & monitoring resources" },
  { code: "D07", ar: "المعرفة والكفاءة والتوعية والتواصل والمعلومات الموثقة", en: "Knowledge, competence, communication & documented information" },
  { code: "D08", ar: "تخطيط العمليات وتشغيلها والتحكم فيها", en: "Operational planning & control" },
  { code: "D09", ar: "متطلبات العملاء ومراجعة العقود والتواصل", en: "Customer requirements & contract review" },
  {
    code: "D10",
    ar: "التصميم والتطوير",
    en: "Design & development",
    notApplicableBecause: (a, _ind, forcesDesign) =>
      forcesDesign || a["core.design_dev"] !== false
        ? null
        : `غير منطبق وفق إفادة العميل: ${String(a["core.design_dev_justification"] ?? "[MISSING: مسوغ عدم الانطباق]")}`,
  },
  { code: "D11", ar: "ضبط المنتجات والخدمات المقدمة خارجياً والموردين", en: "Externally provided products & services" },
  { code: "D12", ar: "الإنتاج وتقديم الخدمة والتعريف والتتبع والحفظ", en: "Production & service provision" },
  { code: "D13", ar: "الإفراج عن المنتجات والخدمات وضبط المخرجات غير المطابقة", en: "Release & nonconforming outputs" },
  { code: "D14", ar: "قياس الأداء ورضا العملاء وتحليل البيانات", en: "Performance, satisfaction & analysis" },
  { code: "D15", ar: "التدقيق الداخلي", en: "Internal audit" },
  { code: "D16", ar: "مراجعة الإدارة", en: "Management review" },
  { code: "D17", ar: "عدم المطابقة والإجراء التصحيحي والتحسين المستمر", en: "Nonconformity, corrective action & improvement" },
];
