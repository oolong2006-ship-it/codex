// Marketing content (bilingual tuples: [Arabic, English]).
import {
  BarChart3, Briefcase, Building2, CalendarDays, Calculator, Clock, FileText, HardHat, Flag,
  ShoppingBag, Smartphone, Stethoscope, Target, Truck, Users, UtensilsCrossed, Wallet,
  type LucideIcon,
} from 'lucide-react';

export type T2 = readonly [ar: string, en: string];

/** Official Shuoon contact details, used across the website. */
export const CONTACT = {
  phone: '+966 55 042 1235',
  phoneHref: 'tel:+966550421235',
  whatsappHref: 'https://wa.me/966550421235',
  email: 'hello@shuoon.net',
  privacyEmail: 'privacy@shuoon.net',
  website: 'www.shuoon.net',
} as const;

export const NAV_LINKS: { href: string; label: T2 }[] = [
  { href: '/features', label: ['المزايا', 'Features'] },
  { href: '/pricing', label: ['الأسعار', 'Pricing'] },
  { href: '/tools/end-of-service', label: ['أدوات مجانية', 'Free tools'] },
  { href: '/about', label: ['عن شؤون', 'About'] },
];

export interface Module {
  id: string;
  icon: LucideIcon;
  name: T2;
  short: T2;
  long: T2;
  points: T2[];
}

export const MODULES: Module[] = [
  {
    id: 'branches', icon: Building2,
    name: ['الفروع والأقسام', 'Branches & departments'],
    short: ['كل فرع وحدة مستقلة بموقعه ومديره ونسبة سعودته.', 'Every branch is a unit with its own location, manager and Saudization rate.'],
    long: ['الفرع في شؤون ليس مجرد حقل في ملف الموظف؛ إنه وحدة التشغيل الأساسية. حدّد إحداثيات كل فرع ونطاقه الجغرافي ومديره، وابنِ أقسامك بشكل هرمي، ودع كل مدير يرى فريقه فقط.', 'In Shuoon the branch is the core operating unit, not just a field. Set each branch’s coordinates, geofence and manager, build departments hierarchically, and let each manager see only their team.'],
    points: [
      ['نطاق جغرافي (Geofence) قابل للضبط لكل فرع', 'Adjustable geofence per branch'],
      ['مدير فرع بصلاحيات محصورة في فريقه', 'Branch managers scoped to their own team'],
      ['أقسام هرمية وهيكل تنظيمي مرئي', 'Hierarchical departments and a visual org chart'],
      ['مؤشرات تكلفة وحضور وسعودة لكل فرع', 'Cost, attendance and Saudization per branch'],
    ],
  },
  {
    id: 'employees', icon: Users,
    name: ['الموظفون والمستندات', 'Employees & documents'],
    short: ['ملف رقمي كامل مع تنبيهات انتهاء الإقامات والعقود.', 'Complete digital file with iqama and contract expiry alerts.'],
    long: ['ملف موحّد لكل موظف: البيانات الشخصية، والعقد، والراتب وبدلاته، والفرع والقسم، والمستندات. يذكّرك شؤون قبل انتهاء الإقامة أو الجواز أو التأمين الطبي بوقت كافٍ.', 'One file per employee: personal data, contract, wage and allowances, branch and department, and documents. Shuoon reminds you well before an iqama, passport or medical insurance expires.'],
    points: [
      ['تنبيهات انتهاء على 90 و30 يوماً', 'Expiry alerts at 90 and 30 days'],
      ['أرشفة الإقامة والجواز والعقد والشهادات', 'Store iqama, passport, contract and certificates'],
      ['سجل تغييرات كامل لكل ملف', 'Full change history per file'],
      ['استيراد جماعي للموظفين', 'Bulk employee import'],
    ],
  },
  {
    id: 'attendance', icon: Clock,
    name: ['الحضور والورديات', 'Attendance & shifts'],
    short: ['بصمة بالموقع، وجدول ورديات أسبوعي لكل فرع.', 'Location-based check-in and weekly rosters per branch.'],
    long: ['صمّم ورديات كل فرع (صباحية، مسائية، ليلية تمتد بعد منتصف الليل) ووزّعها في جدول أسبوعي. يبصم الموظف من جواله داخل نطاق الفرع، ويحسب شؤون التأخير والخروج المبكر والإضافي والغياب تلقائياً.', 'Design each branch’s shifts (morning, evening, overnight) and plan them on a weekly roster. Employees check in from their phone inside the branch geofence, and Shuoon computes lateness, early leave, overtime and absence automatically.'],
    points: [
      ['بصمة بالموقع داخل نطاق الفرع فقط', 'Check-in allowed only inside the branch geofence'],
      ['ورديات ليلية وفترات سماح واستراحات', 'Overnight shifts, grace periods and breaks'],
      ['احتساب التأخير والإضافي آلياً', 'Automatic lateness and overtime'],
      ['لوحة حضور لحظية لكل فرع', 'Live attendance board per branch'],
    ],
  },
  {
    id: 'leave', icon: CalendarDays,
    name: ['الإجازات', 'Leave'],
    short: ['أنواع الإجازات وفق نظام العمل وأرصدة تُحتسب تلقائياً.', 'Labor-law leave types with automatic balances.'],
    long: ['إجازة سنوية 21 يوماً تصبح 30 بعد خمس سنوات، ومرضية بشرائحها، وأمومة وزواج ووفاة وحج وغيرها. الأرصدة تُستحق تلقائياً، والطلب يمر على مدير الفرع ثم الموارد البشرية.', 'Annual leave of 21 days rising to 30 after five years, tiered sick leave, maternity, marriage, bereavement, Hajj and more. Balances accrue automatically and requests flow through the branch manager, then HR.'],
    points: [
      ['أنواع إجازات مهيأة وفق نظام العمل السعودي', 'Leave types preconfigured per Saudi Labor Law'],
      ['استحقاق تلقائي للأرصدة', 'Automatic balance accrual'],
      ['سير اعتماد متعدد المستويات', 'Multi-level approval flow'],
      ['تقويم إجازات للفريق والعطل الرسمية', 'Team leave calendar and public holidays'],
    ],
  },
  {
    id: 'requests', icon: FileText,
    name: ['الطلبات والخطابات', 'Requests & letters'],
    short: ['تعريف بالراتب، وسلف، ومصروفات، وخروج وعودة.', 'Salary certificates, loans, expenses and exit/re-entry.'],
    long: ['بدلاً من الأوراق والرسائل المتفرقة، يقدم الموظف طلبه من التطبيق ويتابع حالته. السلف المعتمدة تُخصم تلقائياً من المسير على أقساط.', 'Instead of paper and scattered messages, employees submit requests from the app and track them. Approved loans are deducted automatically from payroll in instalments.'],
    points: [
      ['تعريف بالراتب وخطابات جاهزة', 'Salary certificates and ready letters'],
      ['سلف بأقساط تُربط بالمسير', 'Loans with instalments linked to payroll'],
      ['مطالبات مصروفات مع مرفقات', 'Expense claims with attachments'],
      ['تصحيح حضور وخروج وعودة', 'Attendance corrections and exit/re-entry'],
    ],
  },
  {
    id: 'payroll', icon: Wallet,
    name: ['الرواتب وحماية الأجور', 'Payroll & WPS'],
    short: ['مسير شهري دقيق وملف حماية الأجور بضغطة.', 'Accurate monthly payroll and a WPS file in one click.'],
    long: ['يجمع شؤون الاستحقاقات والبدلات والإضافي والغياب والسلف واشتراكات التأمينات في مسير واحد قابل للمراجعة. بعد الاعتماد، صدّر ملف حماية الأجور بصيغة جاهزة للرفع وأرسل القسائم للموظفين.', 'Shuoon combines earnings, allowances, overtime, absence, loans and GOSI contributions into one reviewable run. Once approved, export a WPS file ready for upload and send payslips to employees.'],
    points: [
      ['احتساب الإضافي وفق المادة 107', 'Overtime per Article 107'],
      ['اشتراكات التأمينات للسعودي وغير السعودي', 'GOSI contributions for Saudis and non-Saudis'],
      ['تصدير ملف حماية الأجور (WPS)', 'WPS file export'],
      ['قسائم رواتب رقمية للموظفين', 'Digital payslips for employees'],
    ],
  },
  {
    id: 'eosb', icon: Calculator,
    name: ['نهاية الخدمة', 'End of service'],
    short: ['مكافأة دقيقة وفق المادتين 84 و85 مع رصيد الإجازات.', 'Accurate award per Articles 84 & 85 incl. leave balance.'],
    long: ['احسب مكافأة نهاية الخدمة حسب سبب انتهاء العلاقة ومدة الخدمة بالأيام، مع تعويض رصيد الإجازات غير المستخدمة، وتفصيل واضح يمكن مشاركته مع الموظف.', 'Compute the end-of-service award by termination reason and exact service days, including unused leave encashment, with a clear breakdown you can share with the employee.'],
    points: [
      ['نصف شهر عن كل سنة من الخمس الأولى ثم شهر كامل', 'Half a month per year for the first five, then a full month'],
      ['تطبيق نسب الاستقالة (ثلث، ثلثان، كاملة)', 'Resignation fractions (⅓, ⅔, full)'],
      ['تعويض رصيد الإجازات', 'Leave balance encashment'],
      ['مخالصة نهائية قابلة للطباعة', 'Printable final settlement'],
    ],
  },
  {
    id: 'saudization', icon: Flag,
    name: ['السعودة ونطاقات', 'Saudization (Nitaqat)'],
    short: ['نسبة السعودة لكل فرع مع محاكاة أثر التوظيف.', 'Saudization per branch with hiring simulation.'],
    long: ['تابع نسبة السعودة على مستوى المنشأة وكل فرع، واعرف النطاق المتوقع قبل أن تتخذ قرار التوظيف القادم عبر محاكاة بسيطة: ماذا لو وظفنا سعودياً في فرع جدة؟', 'Track Saudization for the company and each branch, and see the expected band before your next hire with a simple simulation: what if we hire one Saudi in the Jeddah branch?'],
    points: [
      ['نسبة السعودة لكل فرع لحظياً', 'Live Saudization per branch'],
      ['محاكاة أثر التوظيف على النطاق', 'Simulate hiring impact on the band'],
      ['تنبيه عند الاقتراب من نطاق أدنى', 'Alerts when approaching a lower band'],
      ['تقارير جاهزة للإدارة', 'Management-ready reports'],
    ],
  },
  {
    id: 'performance', icon: Target,
    name: ['الأداء', 'Performance'],
    short: ['دورات تقييم وأهداف ودرجات واضحة.', 'Review cycles, goals and clear scores.'],
    long: ['أطلق دورة تقييم ربع سنوية أو سنوية، وحدد أهدافاً قابلة للقياس، ودع مدير الفرع يقيّم فريقه بمعايير موحدة عبر كل الفروع.', 'Launch quarterly or annual review cycles, set measurable goals, and let branch managers rate their teams with consistent criteria across branches.'],
    points: [
      ['دورات تقييم مرنة', 'Flexible review cycles'],
      ['أهداف بأوزان ونِسب إنجاز', 'Weighted goals with progress'],
      ['مقارنة الأداء بين الفروع', 'Compare performance across branches'],
      ['سجل تقييمات لكل موظف', 'Review history per employee'],
    ],
  },
  {
    id: 'recruitment', icon: Briefcase,
    name: ['التوظيف', 'Recruitment'],
    short: ['وظائف شاغرة ومرشحون بمراحل واضحة.', 'Openings and candidates across clear stages.'],
    long: ['انشر الوظائف لكل فرع، وتابع المرشحين على لوحة مراحل من التقديم حتى التعيين، ثم حوّل المرشح المقبول إلى موظف بنقرة دون إعادة إدخال بياناته.', 'Post openings per branch, move candidates across a stage board from application to hire, then convert the hired candidate into an employee with one click.'],
    points: [
      ['لوحة مراحل (Kanban) للمرشحين', 'Kanban board for candidates'],
      ['وظائف مرتبطة بالفرع والقسم', 'Openings tied to branch and department'],
      ['ملاحظات وتقييم للمقابلات', 'Interview notes and ratings'],
      ['تحويل المرشح إلى موظف مباشرة', 'Convert candidate to employee instantly'],
    ],
  },
  {
    id: 'reports', icon: BarChart3,
    name: ['التقارير ولوحة القيادة', 'Reports & dashboard'],
    short: ['أرقامك المهمة في شاشة واحدة.', 'Your key numbers on one screen.'],
    long: ['عدد الموظفين، وتكلفة الرواتب واتجاهها، والحضور اليومي، والمستندات المنتهية، والطلبات المعلقة — مقسمة حسب الفرع والقسم، وقابلة للتصدير.', 'Headcount, payroll cost and trend, daily attendance, expiring documents and pending requests — split by branch and department, and exportable.'],
    points: [
      ['لوحة قيادة لحظية', 'Live dashboard'],
      ['اتجاه تكلفة الرواتب', 'Payroll cost trends'],
      ['تقارير حضور لكل فرع', 'Attendance reports per branch'],
      ['تصدير CSV', 'CSV export'],
    ],
  },
  {
    id: 'ess', icon: Smartphone,
    name: ['تطبيق الخدمة الذاتية', 'Self-service app'],
    short: ['الموظف يبصم ويطلب ويرى قسيمته من جواله.', 'Employees check in, request and view payslips from their phone.'],
    long: ['تطبيق ويب خفيف يعمل على أي جوال دون تحميل من المتجر: بصمة بالموقع، وطلب إجازة، ورصيد الإجازات، وقسائم الرواتب، والإعلانات — بالعربية أولاً.', 'A lightweight web app that runs on any phone without an app-store download: location check-in, leave requests, balances, payslips and announcements — Arabic first.'],
    points: [
      ['يعمل على أي جوال دون تثبيت', 'Runs on any phone, no install needed'],
      ['بصمة بالموقع بنقرة واحدة', 'One-tap location check-in'],
      ['قسائم الرواتب والأرصدة', 'Payslips and balances'],
      ['إشعارات بحالة الطلبات', 'Request status notifications'],
    ],
  },
];

export type SectorSlug = 'restaurants' | 'retail' | 'contracting' | 'healthcare' | 'logistics';

export interface Sector {
  slug: SectorSlug;
  icon: LucideIcon;
  name: T2;
  tagline: T2;
  headline: T2;
  intro: T2;
  pains: { title: T2; body: T2 }[];
  features: { title: T2; body: T2 }[];
  caseStudy: { company: T2; profile: T2; quote: T2; person: T2; stats: { value: string; label: T2 }[] };
}

export const SECTORS: Sector[] = [
  {
    slug: 'restaurants', icon: UtensilsCrossed,
    name: ['المطاعم والمقاهي', 'Restaurants & cafés'],
    tagline: ['ورديات متغيرة، وفروع كثيرة، ودوران عالٍ للعمالة.', 'Changing shifts, many branches, high turnover.'],
    headline: ['من المطبخ إلى الكاشير… كل وردية في مكانها', 'From kitchen to counter… every shift in place'],
    intro: ['المطاعم تعمل بإيقاع لا يرحم: وردية تمتد بعد منتصف الليل، وموظف ينتقل بين فرعين، ومدير يحتاج أن يعرف من حضر قبل الافتتاح. شؤون صُمّم لهذا الإيقاع.', 'Restaurants run at a relentless pace: shifts past midnight, staff moving between branches, and managers who need to know who showed up before opening. Shuoon is built for that rhythm.'],
    pains: [
      { title: ['ورديات ليلية تربك الحسابات', 'Overnight shifts break the math'], body: ['الوردية التي تبدأ 6 مساءً وتنتهي 2 فجراً تُحسب خطأً في أغلب الأنظمة.', 'A 6 pm – 2 am shift is miscounted in most systems.'] },
      { title: ['بصمة بالنيابة', 'Buddy punching'], body: ['زميل يبصم عن زميله، والمدير لا يعرف إلا عند نهاية الشهر.', 'One colleague clocks in for another and you find out at month end.'] },
      { title: ['دوران مرتفع للعمالة', 'High staff turnover'], body: ['تعيينات وإنهاءات كل شهر تعني مسيراً جزئياً ومخالصات متكررة.', 'Monthly joiners and leavers mean prorated payroll and frequent settlements.'] },
    ],
    features: [
      { title: ['ورديات تمتد بعد منتصف الليل', 'Shifts that cross midnight'], body: ['احتساب صحيح للساعات والتأخير والإضافي مهما كان توقيت الوردية.', 'Correct hours, lateness and overtime whatever the shift timing.'] },
      { title: ['بصمة داخل نطاق الفرع', 'Check-in inside the geofence'], body: ['لا تُقبل البصمة إلا من داخل الفرع، مع تسجيل الموقع.', 'Check-ins are accepted only inside the branch, with location logged.'] },
      { title: ['جدول أسبوعي لكل فرع', 'Weekly roster per branch'], body: ['مدير الفرع يوزع الورديات ويرى النقص قبل حدوثه.', 'Branch managers plan shifts and spot gaps before they happen.'] },
      { title: ['مسير يراعي التعيين المتأخر', 'Prorated payroll'], body: ['أيام مستحقة تُحتسب آلياً لمن انضم أو غادر خلال الشهر.', 'Payable days computed automatically for mid-month joiners and leavers.'] },
    ],
    caseStudy: {
      company: ['مطاعم «نَكهة» (مثال توضيحي)', '“Nakha” Restaurants (sample)'],
      profile: ['14 فرعاً في الرياض والقصيم، 260 موظفاً', '14 branches in Riyadh & Qassim, 260 staff'],
      quote: ['صرنا نعرف من حضر قبل الافتتاح بربع ساعة، لا بعد نهاية الشهر.', 'We now know who showed up 15 minutes before opening, not at month end.'],
      person: ['مدير العمليات', 'Operations manager'],
      stats: [
        { value: '−38%', label: ['في ساعات الإضافي غير المبررة', 'unjustified overtime hours'] },
        { value: '3', label: ['أيام أقل لإقفال المسير', 'fewer days to close payroll'] },
        { value: '0', label: ['بصمات من خارج الفروع', 'check-ins outside branches'] },
      ],
    },
  },
  {
    slug: 'retail', icon: ShoppingBag,
    name: ['التجزئة', 'Retail'],
    tagline: ['معارض في مدن متعددة ونسب سعودة يجب ضبطها.', 'Stores across cities and Saudization targets to hit.'],
    headline: ['معارضك في كل مدينة… وأرقامها في شاشة واحدة', 'Stores in every city… numbers on one screen'],
    intro: ['في التجزئة، نسبة السعودة ليست رقماً سنوياً بل قرار يومي. وأوقات الذروة في المواسم تحتاج ورديات مرنة وتكلفة واضحة لكل معرض.', 'In retail, Saudization is a daily decision, not a yearly figure. Seasonal peaks need flexible shifts and a clear cost per store.'],
    pains: [
      { title: ['سعودة غير مرئية لكل معرض', 'Invisible per-store Saudization'], body: ['تعرف النسبة الإجمالية لكن لا تعرف أي معرض يسحبها للأسفل.', 'You know the overall rate but not which store drags it down.'] },
      { title: ['مواسم ذروة مرهقة', 'Exhausting peak seasons'], body: ['رمضان والأعياد والعودة للمدارس تعني ورديات إضافية وإضافي يصعب ضبطه.', 'Ramadan, Eid and back-to-school mean extra shifts and hard-to-control overtime.'] },
      { title: ['مديرو معارض بلا أدوات', 'Store managers without tools'], body: ['كل اعتماد إجازة يمر عبر الإدارة المركزية ويتأخر.', 'Every leave approval goes through head office and gets delayed.'] },
    ],
    features: [
      { title: ['سعودة لكل معرض', 'Saudization per store'], body: ['لوحة تبين نسبة كل معرض ونطاقه مع محاكاة التوظيف.', 'A board showing each store’s rate and band with hiring simulation.'] },
      { title: ['ورديات المواسم', 'Seasonal rosters'], body: ['انسخ جدول الأسبوع وعدّله للمواسم في دقائق.', 'Copy a week’s roster and adapt it for peaks in minutes.'] },
      { title: ['صلاحيات مدير المعرض', 'Store manager rights'], body: ['يعتمد إجازات فريقه ويرى حضورهم دون الوصول لبقية الفروع.', 'Approves their team’s leave and sees attendance without seeing other stores.'] },
      { title: ['تكلفة رواتب لكل معرض', 'Payroll cost per store'], body: ['اعرف تكلفة القوى العاملة لكل معرض شهرياً.', 'See workforce cost per store every month.'] },
    ],
    caseStudy: {
      company: ['متاجر «دار الأناقة» (مثال توضيحي)', '“Dar Al-Anaqa” Stores (sample)'],
      profile: ['22 معرضاً في 6 مدن، 410 موظفين', '22 stores in 6 cities, 410 staff'],
      quote: ['اكتشفنا أن ثلاثة معارض فقط كانت تهدد نطاقنا، وعالجناها قبل التجديد.', 'We found only three stores were threatening our band, and fixed them before renewal.'],
      person: ['مديرة الموارد البشرية', 'HR director'],
      stats: [
        { value: '+6.2%', label: ['في نسبة السعودة خلال 4 أشهر', 'Saudization in 4 months'] },
        { value: '48h→4h', label: ['زمن اعتماد الإجازة', 'leave approval time'] },
        { value: '22', label: ['معرضاً بلوحة واحدة', 'stores on one board'] },
      ],
    },
  },
  {
    slug: 'contracting', icon: HardHat,
    name: ['المقاولات', 'Contracting'],
    tagline: ['مواقع مشاريع متنقلة وعمالة ميدانية كبيرة.', 'Moving project sites and large field workforces.'],
    headline: ['كل موقع مشروع فرع… وكل عامل في مكانه', 'Every site is a branch… every worker accounted for'],
    intro: ['مواقع المشاريع تُفتح وتُغلق، والعمالة تنتقل بينها، والإقامات تنتهي في أسوأ توقيت. شؤون تعامل كل موقع كفرع بنطاق جغرافي خاص به.', 'Sites open and close, crews move between them, and iqamas expire at the worst time. Shuoon treats each site as a branch with its own geofence.'],
    pains: [
      { title: ['حضور يصعب التحقق منه', 'Hard-to-verify attendance'], body: ['كشوف ورقية من المشرفين تصل متأخرة وبأخطاء.', 'Paper sheets from supervisors arrive late and with errors.'] },
      { title: ['إقامات منتهية', 'Expired iqamas'], body: ['غرامات وتوقف عمالة بسبب مستند لم يُجدد في وقته.', 'Fines and idle crews because a document wasn’t renewed in time.'] },
      { title: ['سلف كثيرة ومتداخلة', 'Many overlapping loans'], body: ['سلف العمال تُتابع في جداول منفصلة وتُنسى عند المسير.', 'Worker loans tracked in separate sheets and forgotten at payroll.'] },
    ],
    features: [
      { title: ['موقع المشروع = فرع', 'Project site = branch'], body: ['أنشئ موقعاً جديداً بنطاقه في دقيقة وانقل العمالة إليه.', 'Create a site with its geofence in a minute and move crews to it.'] },
      { title: ['بصمة ميدانية بالجوال', 'Mobile field check-in'], body: ['العامل يبصم من جواله داخل الموقع، والمشرف يرى الحضور لحظياً.', 'Workers check in on-site from their phone; supervisors see it live.'] },
      { title: ['تنبيهات المستندات', 'Document alerts'], body: ['قائمة بالإقامات التي تنتهي خلال 30 و90 يوماً.', 'A list of iqamas expiring in 30 and 90 days.'] },
      { title: ['سلف تُخصم تلقائياً', 'Auto-deducted loans'], body: ['أقساط السلف تدخل المسير دون تدخل يدوي.', 'Loan instalments flow into payroll with no manual step.'] },
    ],
    caseStudy: {
      company: ['شركة «أساس البناء» (مثال توضيحي)', '“Asas Al-Binaa” Co. (sample)'],
      profile: ['9 مواقع مشاريع، 780 عاملاً', '9 project sites, 780 workers'],
      quote: ['لم نعد ننتظر كشوف المشرفين؛ الحضور يصلنا من الموقع مباشرة.', 'We no longer wait for supervisor sheets; attendance arrives straight from site.'],
      person: ['المدير المالي', 'CFO'],
      stats: [
        { value: '0', label: ['غرامات إقامات منتهية منذ التشغيل', 'expired-iqama fines since go-live'] },
        { value: '−70%', label: ['في وقت تجهيز كشوف الحضور', 'time preparing attendance sheets'] },
        { value: '9', label: ['مواقع بنطاقات مستقلة', 'sites with own geofences'] },
      ],
    },
  },
  {
    slug: 'healthcare', icon: Stethoscope,
    name: ['العيادات والصحة', 'Clinics & healthcare'],
    tagline: ['كوادر طبية بورديات دقيقة وتراخيص يجب متابعتها.', 'Medical staff on precise shifts with licences to track.'],
    headline: ['كوادرك الطبية… في المناوبة الصحيحة دائماً', 'Your medical staff… always on the right rota'],
    intro: ['العيادات تجمع أطباء وتمريضاً وإداريين بعقود وورديات مختلفة، وأي نقص في المناوبة يعني مواعيد ضائعة. شؤون تمنحك جدولاً واضحاً ومستندات محدثة.', 'Clinics mix doctors, nurses and admin staff on different contracts and shifts, and any rota gap means missed appointments. Shuoon gives you a clear roster and up-to-date documents.'],
    pains: [
      { title: ['مناوبات معقدة', 'Complex rotas'], body: ['ورديات صباحية ومسائية ومناوبات عطلة يصعب توزيعها بعدل.', 'Morning, evening and weekend on-call shifts are hard to distribute fairly.'] },
      { title: ['تراخيص وشهادات تنتهي', 'Expiring licences and certificates'], body: ['ترخيص مهني منتهٍ قد يوقف ممارساً عن العمل.', 'An expired professional licence can stop a practitioner from working.'] },
      { title: ['عيادات متعددة بسياسات مختلفة', 'Multiple clinics, different policies'], body: ['كل فرع يدير حضوره بطريقته.', 'Each branch manages attendance its own way.'] },
    ],
    features: [
      { title: ['جدول مناوبات أسبوعي', 'Weekly on-call roster'], body: ['وزّع المناوبات لكل عيادة واطّلع على التغطية.', 'Distribute shifts per clinic and see coverage.'] },
      { title: ['مستندات وشهادات مهنية', 'Professional documents'], body: ['أرشف التراخيص والشهادات مع تنبيهات الانتهاء.', 'Store licences and certificates with expiry alerts.'] },
      { title: ['سياسة موحدة لكل الفروع', 'One policy for all branches'], body: ['فترات سماح وقواعد إضافي موحدة أو مخصصة لكل عيادة.', 'Shared or per-clinic grace periods and overtime rules.'] },
      { title: ['تقييم أداء الكوادر', 'Staff performance reviews'], body: ['دورات تقييم بمعايير تناسب الأدوار الطبية والإدارية.', 'Review cycles with criteria fit for medical and admin roles.'] },
    ],
    caseStudy: {
      company: ['مجمع «رعاية» الطبي (مثال توضيحي)', '“Riaya” Medical Group (sample)'],
      profile: ['5 عيادات، 140 موظفاً', '5 clinics, 140 staff'],
      quote: ['تنبيهات الشهادات وحدها وفّرت علينا مواقف محرجة كثيرة.', 'Certificate alerts alone saved us many awkward situations.'],
      person: ['المدير الإداري', 'Administrative director'],
      stats: [
        { value: '100%', label: ['من التراخيص محدثة', 'licences up to date'] },
        { value: '−25%', label: ['في فجوات المناوبات', 'rota gaps'] },
        { value: '5', label: ['عيادات بسياسة موحدة', 'clinics, one policy'] },
      ],
    },
  },
  {
    slug: 'logistics', icon: Truck,
    name: ['النقل والخدمات اللوجستية', 'Logistics'],
    tagline: ['مستودعات ومراكز توزيع وسائقون على الطريق.', 'Warehouses, hubs and drivers on the road.'],
    headline: ['مستودعاتك وسائقوك… على الإيقاع نفسه', 'Warehouses and drivers… in the same rhythm'],
    intro: ['بين مستودع يعمل على مدار الساعة وسائقين يتنقلون بين المدن، يصعب ضبط الحضور والإضافي. شؤون تجمع كل المراكز في منظومة واحدة.', 'Between 24/7 warehouses and drivers moving between cities, attendance and overtime are hard to control. Shuoon brings every hub into one system.'],
    pains: [
      { title: ['تشغيل على مدار الساعة', '24/7 operations'], body: ['ثلاث ورديات يومياً وإضافي متكرر يرفع التكلفة.', 'Three shifts a day and recurring overtime push costs up.'] },
      { title: ['سائقون خارج المقر', 'Drivers off-site'], body: ['صعوبة إثبات حضور من يبدأ يومه من مركز توزيع آخر.', 'Hard to verify attendance for drivers starting at another hub.'] },
      { title: ['مصروفات طريق متفرقة', 'Scattered road expenses'], body: ['فواتير وقود وإقامة تصل ورقياً بعد أسابيع.', 'Fuel and lodging receipts arrive on paper weeks later.'] },
    ],
    features: [
      { title: ['ثلاث ورديات بلا أخطاء', 'Three shifts, no errors'], body: ['احتساب دقيق للإضافي وفق المادة 107 لكل وردية.', 'Accurate Article 107 overtime for each shift.'] },
      { title: ['بصمة من أي مركز', 'Check in at any hub'], body: ['اسمح للسائق بالبصمة من عدة مراكز معتمدة.', 'Allow drivers to check in at several approved hubs.'] },
      { title: ['مطالبات مصروفات رقمية', 'Digital expense claims'], body: ['صورة الفاتورة من الجوال واعتماد سريع.', 'Snap the receipt on the phone and get quick approval.'] },
      { title: ['تقارير تكلفة لكل مركز', 'Cost reports per hub'], body: ['تكلفة القوى العاملة والإضافي لكل مستودع.', 'Workforce and overtime cost per warehouse.'] },
    ],
    caseStudy: {
      company: ['«مسار» للخدمات اللوجستية (مثال توضيحي)', '“Masar” Logistics (sample)'],
      profile: ['7 مراكز توزيع، 320 موظفاً', '7 hubs, 320 staff'],
      quote: ['الإضافي كان صندوقاً أسود؛ اليوم نعرف كل ساعة ومن اعتمدها.', 'Overtime was a black box; now we know every hour and who approved it.'],
      person: ['مدير الموارد البشرية', 'HR manager'],
      stats: [
        { value: '−22%', label: ['في تكلفة الإضافي', 'overtime cost'] },
        { value: '2 دقيقة', label: ['لتقديم مطالبة مصروفات', 'to file an expense claim'] },
        { value: '7', label: ['مراكز في منظومة واحدة', 'hubs in one system'] },
      ],
    },
  },
];

export const getSector = (slug: string) => SECTORS.find((s) => s.slug === slug);

export const COMPLIANCE_CHIPS: T2[] = [
  ['متوافق مع نظام العمل السعودي', 'Aligned with Saudi Labor Law'],
  ['جاهز لملفات حماية الأجور', 'WPS-file ready'],
  ['يحتسب اشتراكات التأمينات الاجتماعية', 'GOSI contributions built in'],
  ['ملفات رواتب متوافقة مع مُدد', 'Mudad-compatible payroll files'],
  ['بيانات جاهزة لمنصة قوى', 'Qiwa-ready employee data'],
  ['نظام حماية البيانات الشخصية', 'PDPL-minded data handling'],
];

export interface Tier {
  id: 'basic' | 'growth' | 'enterprise';
  name: T2;
  price: number | null; // SAR per employee / month (monthly billing)
  desc: T2;
  highlight?: boolean;
  features: T2[];
  cta: { href: string; label: T2 };
}

export const TIERS: Tier[] = [
  {
    id: 'basic', name: ['أساسي', 'Essential'], price: 19,
    desc: ['للمنشآت التي تبدأ بفرع أو فرعين.', 'For businesses starting with one or two branches.'],
    features: [
      ['ملفات الموظفين والمستندات', 'Employee files & documents'],
      ['الحضور بالموقع والورديات', 'Location attendance & shifts'],
      ['الإجازات والطلبات', 'Leave & requests'],
      ['مسير الرواتب وملف حماية الأجور', 'Payroll & WPS file'],
      ['تطبيق الخدمة الذاتية للموظف', 'Employee self-service app'],
    ],
    cta: { href: '/signup', label: ['ابدأ تجربتك المجانية', 'Start free trial'] },
  },
  {
    id: 'growth', name: ['نمو', 'Growth'], price: 29, highlight: true,
    desc: ['للمنشآت متعددة الفروع التي تتوسع.', 'For multi-branch businesses that are expanding.'],
    features: [
      ['كل ما في الباقة الأساسية', 'Everything in Essential'],
      ['فروع غير محدودة ومديرو فروع', 'Unlimited branches & branch managers'],
      ['السعودة لكل فرع ومحاكاة التوظيف', 'Per-branch Saudization & simulation'],
      ['الأداء والتوظيف', 'Performance & recruitment'],
      ['تقارير متقدمة وتصدير', 'Advanced reports & export'],
    ],
    cta: { href: '/signup', label: ['ابدأ تجربتك المجانية', 'Start free trial'] },
  },
  {
    id: 'enterprise', name: ['مؤسسات', 'Enterprise'], price: null,
    desc: ['للمجموعات الكبيرة ومتطلبات التكامل الخاصة.', 'For large groups with custom integration needs.'],
    features: [
      ['كل ما في باقة النمو', 'Everything in Growth'],
      ['مدير حساب مخصص', 'Dedicated account manager'],
      ['تكاملات مع أنظمة المحاسبة', 'Accounting system integrations'],
      ['اتفاقية مستوى خدمة (SLA)', 'Service level agreement (SLA)'],
      ['تهيئة وترحيل بيانات بالكامل', 'Full onboarding & data migration'],
    ],
    cta: { href: '/demo', label: ['تواصل مع المبيعات', 'Talk to sales'] },
  },
];

export const ANNUAL_DISCOUNT = 0.15;

/** Comparison rows: value per tier (true/false or text). */
export const COMPARISON: { group: T2; rows: { label: T2; values: [boolean | T2, boolean | T2, boolean | T2] }[] }[] = [
  {
    group: ['الأساسيات', 'Core'],
    rows: [
      { label: ['ملفات الموظفين والمستندات', 'Employee files & documents'], values: [true, true, true] },
      { label: ['عدد الفروع', 'Branches'], values: [['حتى 2', 'Up to 2'], ['غير محدود', 'Unlimited'], ['غير محدود', 'Unlimited']] },
      { label: ['تطبيق الخدمة الذاتية', 'Self-service app'], values: [true, true, true] },
      { label: ['الطلبات والخطابات', 'Requests & letters'], values: [true, true, true] },
    ],
  },
  {
    group: ['الحضور والإجازات', 'Attendance & leave'],
    rows: [
      { label: ['بصمة بالموقع (Geofence)', 'Geofenced check-in'], values: [true, true, true] },
      { label: ['جدول ورديات أسبوعي', 'Weekly roster'], values: [true, true, true] },
      { label: ['مديرو فروع بصلاحيات محصورة', 'Scoped branch managers'], values: [false, true, true] },
      { label: ['الإجازات وفق نظام العمل', 'Labor-law leave types'], values: [true, true, true] },
    ],
  },
  {
    group: ['الرواتب والامتثال', 'Payroll & compliance'],
    rows: [
      { label: ['مسير الرواتب والقسائم', 'Payroll & payslips'], values: [true, true, true] },
      { label: ['ملف حماية الأجور (WPS)', 'WPS file'], values: [true, true, true] },
      { label: ['نهاية الخدمة والمخالصة', 'End of service & settlement'], values: [true, true, true] },
      { label: ['السعودة لكل فرع ومحاكاة', 'Per-branch Saudization & simulation'], values: [false, true, true] },
    ],
  },
  {
    group: ['النمو والتحليل', 'Growth & analytics'],
    rows: [
      { label: ['الأداء والتقييم', 'Performance reviews'], values: [false, true, true] },
      { label: ['التوظيف (Kanban)', 'Recruitment (Kanban)'], values: [false, true, true] },
      { label: ['تقارير متقدمة', 'Advanced reports'], values: [false, true, true] },
      { label: ['تكاملات مخصصة', 'Custom integrations'], values: [false, false, true] },
    ],
  },
  {
    group: ['الدعم', 'Support'],
    rows: [
      { label: ['دعم بالعربية', 'Arabic support'], values: [['بريد ومحادثة', 'Email & chat'], ['أولوية', 'Priority'], ['مدير حساب', 'Account manager']] },
      { label: ['تهيئة وترحيل بيانات', 'Onboarding & migration'], values: [['ذاتية', 'Self-serve'], ['بمساعدة', 'Assisted'], ['كاملة', 'Full']] },
      { label: ['اتفاقية مستوى خدمة', 'SLA'], values: [false, false, true] },
    ],
  },
];

export const HOME_FAQ: { q: T2; a: T2 }[] = [
  { q: ['ما الذي يميز شؤون عن أنظمة الموارد البشرية العامة؟', 'How is Shuoon different from generic HR systems?'],
    a: ['شؤون تجعل الفرع هو الوحدة الأساسية: لكل فرع نطاق جغرافي للبصمة، وورديات، ومدير يرى فريقه فقط، ونسبة سعودة خاصة به. هذا ما تحتاجه المنشآت ذات العمالة الميدانية.', 'Shuoon makes the branch the core unit: each branch has its own check-in geofence, shifts, a manager who sees only their team, and its own Saudization rate — exactly what field-workforce businesses need.'] },
  { q: ['هل يحتاج الموظف لتحميل تطبيق من المتجر؟', 'Do employees need to download an app?'],
    a: ['لا. تطبيق الخدمة الذاتية يعمل من متصفح الجوال ويمكن إضافته للشاشة الرئيسية كأي تطبيق.', 'No. The self-service app runs in the phone browser and can be added to the home screen like any app.'] },
  { q: ['هل يدعم شؤون ملف حماية الأجور؟', 'Does Shuoon support the WPS file?'],
    a: ['نعم، بعد اعتماد المسير يمكنك تصدير ملف حماية الأجور بصيغة جاهزة للرفع عبر بنكك أو المنصات المعتمدة.', 'Yes. After approving payroll you can export a WPS file ready to upload via your bank or the approved platforms.'] },
  { q: ['كم يستغرق التشغيل؟', 'How long does onboarding take?'],
    a: ['أغلب المنشآت تبدأ خلال أسبوع: استيراد الموظفين، وإعداد الفروع ونطاقاتها، ثم أول مسير.', 'Most businesses go live within a week: import employees, set up branches and geofences, then run the first payroll.'] },
  { q: ['أين تُستضاف بياناتنا؟', 'Where is our data hosted?'],
    a: ['نلتزم باستضافة البيانات داخل المملكة العربية السعودية وبالتعامل معها وفق نظام حماية البيانات الشخصية.', 'We are committed to hosting data inside Saudi Arabia and handling it in line with the Personal Data Protection Law (PDPL).'] },
  { q: ['هل يمكنني التجربة قبل الاشتراك؟', 'Can I try before subscribing?'],
    a: ['بالتأكيد. ابدأ تجربة مجانية لمدة 14 يوماً دون بطاقة ائتمانية، أو اطلب عرضاً تجريبياً مع فريقنا.', 'Absolutely. Start a 14-day free trial with no credit card, or book a demo with our team.'] },
];

export const PRICING_FAQ: { q: T2; a: T2 }[] = [
  { q: ['كيف يُحتسب السعر؟', 'How is pricing calculated?'],
    a: ['السعر لكل موظف نشط شهرياً. الموظفون المنتهية خدماتهم لا يُحتسبون.', 'Per active employee per month. Terminated employees are not counted.'] },
  { q: ['هل الأسعار تشمل ضريبة القيمة المضافة؟', 'Do prices include VAT?'],
    a: ['الأسعار المعروضة لا تشمل ضريبة القيمة المضافة (15%)، وتُضاف في الفاتورة.', 'Displayed prices exclude 15% VAT, which is added on the invoice.'] },
  { q: ['هل يوجد حد أدنى لعدد الموظفين؟', 'Is there a minimum headcount?'],
    a: ['الحد الأدنى للفوترة 10 موظفين في الباقتين الأساسية والنمو.', 'Minimum billing is 10 employees on Essential and Growth.'] },
  { q: ['هل يمكنني تغيير الباقة لاحقاً؟', 'Can I change plans later?'],
    a: ['نعم، يمكنك الترقية في أي وقت ويُحتسب الفرق بالتناسب.', 'Yes, upgrade anytime and the difference is prorated.'] },
  { q: ['ماذا يحدث لبياناتي إذا ألغيت الاشتراك؟', 'What happens to my data if I cancel?'],
    a: ['يمكنك تصدير بياناتك كاملة، ونحذفها بعد 30 يوماً من الإلغاء ما لم يُطلب غير ذلك نظاماً.', 'You can export all your data; we delete it 30 days after cancellation unless the law requires otherwise.'] },
];

export const TESTIMONIALS: { quote: T2; name: T2; role: T2; company: T2 }[] = [
  { quote: ['أول مرة نقفل المسير لأربعة عشر فرعاً في يوم واحد.', 'The first time we closed payroll for fourteen branches in one day.'],
    name: ['سارة العتيبي', 'Sarah Al-Otaibi'], role: ['مديرة الموارد البشرية', 'HR manager'], company: ['سلسلة مطاعم (مثال)', 'Restaurant chain (sample)'] },
  { quote: ['مديرو الفروع صاروا يعتمدون إجازات فرقهم بأنفسهم، والإدارة تتابع فقط.', 'Branch managers approve their own team’s leave; head office just monitors.'],
    name: ['فهد القحطاني', 'Fahad Al-Qahtani'], role: ['المدير التنفيذي', 'CEO'], company: ['متاجر تجزئة (مثال)', 'Retail stores (sample)'] },
  { quote: ['البصمة بالموقع أنهت جدل الحضور في مواقع المشاريع.', 'Location check-in ended attendance disputes on our sites.'],
    name: ['م. خالد الزهراني', 'Eng. Khalid Al-Zahrani'], role: ['مدير المشاريع', 'Projects director'], company: ['شركة مقاولات (مثال)', 'Contracting firm (sample)'] },
];
