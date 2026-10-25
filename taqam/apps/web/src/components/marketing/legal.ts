import type { LegalSection } from './LegalPage';

export const LEGAL_UPDATED = '2026-10-01';

export const PRIVACY: LegalSection[] = [
  { id: 'scope', title: ['نطاق السياسة', 'Scope'], body: [
    ['توضح هذه السياسة كيف تجمع منصة «شؤون» البيانات الشخصية وتستخدمها وتحميها، سواء بيانات زوار الموقع أو بيانات المنشآت العميلة وموظفيها التي تُعالج داخل المنصة.', 'This policy explains how Shuoon collects, uses and protects personal data — both website visitors’ data and the data of customer businesses and their employees processed in the platform.'],
    ['نلتزم في معالجتنا للبيانات بنظام حماية البيانات الشخصية الصادر في المملكة العربية السعودية ولوائحه التنفيذية والضوابط ذات العلاقة.', 'We process data in compliance with the Saudi Personal Data Protection Law (PDPL), its implementing regulations and related controls.'],
  ] },
  { id: 'roles', title: ['أدوارنا في المعالجة', 'Our processing roles'], body: [
    ['بالنسبة لبيانات موظفي المنشأة العميلة، تكون المنشأة هي «جهة التحكم» ويكون «شؤون» «جهة معالجة» تعالج البيانات وفق تعليمات العميل والعقد المبرم معه.', 'For customer employees’ data, the customer business is the controller and Shuoon is the processor, processing data on the customer’s instructions and under our agreement.'],
    ['أما بيانات زوار الموقع وطالبي العروض التجريبية فيكون «شؤون» جهة التحكم فيها.', 'For website visitors and demo requesters, Shuoon is the controller.'],
  ] },
  { id: 'data', title: ['البيانات التي نجمعها', 'Data we collect'], body: [
    ['بيانات التواصل: الاسم واسم المنشأة والبريد الإلكتروني ورقم الجوال عند طلب عرض تجريبي أو التسجيل.', 'Contact data: name, company, email and mobile number when requesting a demo or signing up.'],
    ['بيانات الموظفين التي يدخلها العميل: البيانات الوظيفية والأجور والمستندات وسجلات الحضور والإجازات.', 'Employee data entered by the customer: job details, wages, documents, attendance and leave records.'],
    ['بيانات الموقع الجغرافي: تُجمع فقط لحظة تسجيل الحضور أو الانصراف عبر تطبيق الخدمة الذاتية، للتحقق من وجود الموظف داخل نطاق الفرع، ولا نتتبع الموقع بشكل مستمر.', 'Location data: collected only at the moment of check-in or check-out in the self-service app to verify the employee is inside the branch geofence. We never track location continuously.'],
    ['بيانات تقنية: مثل نوع المتصفح وسجلات الدخول لأغراض الأمان وتحسين الخدمة.', 'Technical data such as browser type and access logs for security and service improvement.'],
  ] },
  { id: 'use', title: ['أغراض الاستخدام', 'How we use data'], body: [
    ['تقديم خدمات المنصة: إدارة الموظفين، والحضور، والإجازات، والرواتب، وإصدار ملفات حماية الأجور.', 'Providing the platform: employee management, attendance, leave, payroll and WPS files.'],
    ['التواصل معك بخصوص طلبك أو حسابك، وإرسال إشعارات تشغيلية ضرورية.', 'Contacting you about your request or account and sending essential operational notices.'],
    ['لا نبيع البيانات الشخصية ولا نستخدم بيانات موظفي عملائنا لأغراض تسويقية.', 'We never sell personal data or use customers’ employee data for marketing.'],
  ] },
  { id: 'hosting', title: ['الاستضافة ونقل البيانات', 'Hosting & transfers'], body: [
    ['نلتزم باستضافة بيانات العملاء وتخزينها في مراكز بيانات داخل المملكة العربية السعودية.', 'We are committed to hosting and storing customer data in data centres inside Saudi Arabia.'],
    ['لا تُنقل البيانات الشخصية خارج المملكة إلا في الحالات التي يجيزها نظام حماية البيانات الشخصية ولوائحه، وبالضمانات المطلوبة نظاماً.', 'Personal data is not transferred outside the Kingdom except where permitted by the PDPL and its regulations, with the required safeguards.'],
  ] },
  { id: 'security', title: ['أمن المعلومات', 'Security'], body: [
    ['نطبق ضوابط تقنية وتنظيمية تشمل التشفير أثناء النقل والتخزين، والتحكم بالصلاحيات حسب الدور (مدير الفرع يرى فريقه فقط)، وسجلات تدقيق للعمليات الحساسة، ونسخاً احتياطية منتظمة.', 'We apply technical and organisational controls including encryption in transit and at rest, role-based access (branch managers see only their team), audit logs for sensitive actions, and regular backups.'],
  ] },
  { id: 'retention', title: ['الاحتفاظ بالبيانات', 'Retention'], body: [
    ['نحتفظ بالبيانات طوال مدة الاشتراك، وبعد انتهائه يمكن للعميل تصدير بياناته خلال 30 يوماً، ثم نحذفها ما لم يلزمنا نظام بالاحتفاظ بها مدة أطول.', 'We retain data for the subscription term. After it ends, customers can export their data within 30 days, after which we delete it unless the law requires longer retention.'],
  ] },
  { id: 'rights', title: ['حقوق أصحاب البيانات', 'Data subject rights'], body: [
    ['يحق لصاحب البيانات وفق نظام حماية البيانات الشخصية: العلم بكيفية معالجة بياناته، والوصول إليها، وطلب تصحيحها أو إتلافها، والحصول على نسخة منها، وذلك وفق الضوابط النظامية.', 'Under the PDPL, data subjects have the right to be informed, to access their data, to request correction or destruction, and to obtain a copy, subject to legal controls.'],
    ['يمكن لموظفي عملائنا توجيه طلباتهم إلى جهة عملهم بصفتها جهة التحكم، وسنساعدها في تلبيتها.', 'Customers’ employees can direct requests to their employer as the controller, and we will assist in fulfilling them.'],
  ] },
  { id: 'cookies', title: ['ملفات تعريف الارتباط', 'Cookies'], body: [
    ['نستخدم ملفات تعريف ارتباط وتخزيناً محلياً ضرورياً لتشغيل الموقع، مثل حفظ تفضيل اللغة وجلسة الدخول.', 'We use essential cookies and local storage to run the site, such as remembering your language preference and login session.'],
  ] },
];

export const TERMS: LegalSection[] = [
  { id: 'acceptance', title: ['القبول', 'Acceptance'], body: [
    ['باستخدامك منصة «شؤون» أو التسجيل فيها فإنك توافق على هذه الشروط نيابة عن نفسك وعن المنشأة التي تمثلها، وتقر بأن لديك الصلاحية لذلك.', 'By using or signing up for Shuoon you agree to these terms on behalf of yourself and the business you represent, and confirm you are authorised to do so.'],
  ] },
  { id: 'service', title: ['وصف الخدمة', 'The service'], body: [
    ['«شؤون» منصة سحابية لإدارة الموارد البشرية والرواتب والحضور تُقدم بنظام الاشتراك (SaaS)، وقد نطور مزاياها أو نعدلها من وقت لآخر.', 'Shuoon is a cloud HR, payroll and attendance platform offered as a subscription (SaaS); we may develop or change features from time to time.'],
    ['الحاسبات والأدوات المجانية في الموقع، ومنها حاسبة نهاية الخدمة، تقدم نتائج تقديرية استرشادية ولا تُعد استشارة قانونية أو محاسبية.', 'Free tools on the website, including the end-of-service calculator, provide indicative estimates and are not legal or accounting advice.'],
  ] },
  { id: 'accounts', title: ['الحسابات والصلاحيات', 'Accounts & access'], body: [
    ['العميل مسؤول عن دقة البيانات التي يدخلها، وعن منح الصلاحيات للمستخدمين في منشأته، والمحافظة على سرية بيانات الدخول.', 'Customers are responsible for the accuracy of data they enter, for granting user permissions within their business, and for keeping credentials confidential.'],
  ] },
  { id: 'compliance', title: ['الامتثال النظامي', 'Regulatory compliance'], body: [
    ['تساعد المنصة على الالتزام بنظام العمل السعودي ومتطلبات حماية الأجور والتأمينات الاجتماعية، لكن المسؤولية النهائية عن الالتزام النظامي وصرف الأجور تبقى على المنشأة العميلة.', 'The platform helps businesses comply with Saudi Labor Law, WPS and GOSI requirements, but final responsibility for compliance and wage payment remains with the customer.'],
    ['«شؤون» ليس جهة حكومية ولا يمثل أي جهة حكومية، والإشارة إلى الأنظمة والمنصات الرسمية لبيان التوافق فقط.', 'Shuoon is not, and does not represent, any government entity; references to official systems and platforms indicate compatibility only.'],
  ] },
  { id: 'fees', title: ['الرسوم والفوترة', 'Fees & billing'], body: [
    ['تُحتسب الرسوم لكل موظف نشط شهرياً وفق الباقة المختارة، وتضاف ضريبة القيمة المضافة. يجدد الاشتراك تلقائياً ما لم يُلغَ قبل نهاية الفترة.', 'Fees are charged per active employee per month according to the selected plan, plus VAT. Subscriptions renew automatically unless cancelled before the period ends.'],
  ] },
  { id: 'data', title: ['البيانات والخصوصية', 'Data & privacy'], body: [
    ['تبقى بيانات العميل ملكاً له، ونعالجها وفق سياسة الخصوصية ونظام حماية البيانات الشخصية، مع الالتزام باستضافتها داخل المملكة.', 'Customer data remains the customer’s property. We process it per our Privacy Policy and the PDPL, committed to hosting it inside the Kingdom.'],
  ] },
  { id: 'availability', title: ['توفر الخدمة', 'Availability'], body: [
    ['نسعى لتوفير الخدمة على مدار الساعة، وقد تتوقف مؤقتاً لأعمال الصيانة المجدولة التي نُشعر بها مسبقاً قدر الإمكان.', 'We aim for round-the-clock availability; the service may pause for scheduled maintenance, announced in advance where possible.'],
  ] },
  { id: 'liability', title: ['حدود المسؤولية', 'Limitation of liability'], body: [
    ['لا تتجاوز مسؤولية «شؤون» في جميع الأحوال قيمة الرسوم المدفوعة خلال الأشهر الاثني عشر السابقة للمطالبة.', 'In all cases, Shuoon’s liability shall not exceed the fees paid in the twelve months preceding the claim.'],
  ] },
  { id: 'law', title: ['النظام الواجب التطبيق', 'Governing law'], body: [
    ['تخضع هذه الشروط لأنظمة المملكة العربية السعودية، وتختص الجهات القضائية في مدينة الرياض بالنظر في أي نزاع ينشأ عنها.', 'These terms are governed by the laws of Saudi Arabia, and the courts of Riyadh have jurisdiction over any dispute.'],
  ] },
];
