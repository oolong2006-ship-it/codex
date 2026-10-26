# Backlog — كل ما ليس في الـ MVP

> التصنيف من `docs/research/competitor-matrix.csv`. «المرحلة» هي المرحلة المرشحة وفق `prompts/`، وليست التزامًا.

| ID | البند | التصنيف | المرحلة | المصدر/المنافسون | ملاحظات |
|---|---|---|---|---|---|
| BL-01 | الاستراحات (مدفوعة/غير مدفوعة، حد أدنى/أقصى، تنبيه) | FUTURE | 3 | Connecteam، Deputy، Clockify؛ نظام العمل م 101 (ksa L6) | `BREAK_START/END` موجودة في عقد API لكنها غير مفعلة في الـ MVP (D-05) |
| BL-02 | العمل الإضافي (يومي/أسبوعي/بعد المجدول، معتمد/غير معتمد) | FUTURE | 3 | Jisr، ZenHR، Odoo، TimeMobi؛ ksa L8–L10 | لا حساب أجر إلا بإذن وبيانات أجور مستوردة |
| BL-03 | البصمة دون اتصال | FUTURE | 4 | Palm HR، Jibble، كشك Deputy | specs §E؛ F18 |
| BL-04 | الموافقات متعددة المستويات + التفويض + التصعيد | FUTURE | 3 | — | الـ MVP مستوى واحد (D-04) |
| BL-05 | تصدير صيغة حماية الأجور / مُدد | PARITY (مؤجل) | 3 | TECFY (لا تكامل مباشر)، ZenHR | `Blocked`: يحتاج القالب من حساب مُدد للعميل (ksa W3) |
| BL-06 | الاشتراكات والفوترة | ENTERPRISE | 3 (يدوي) | — | العميل يُنشأ يدويًا في الـ MVP |
| BL-07 | ورديات متناوبة ومقسمة ومرنة ومفتوحة | FUTURE | 3 | Jisr، ZenHR | |
| BL-08 | تبديل الورديات بين الموظفين، ومناوبات شاغرة، وتنبيه نقص التغطية | FUTURE | 3 | Jisr | |
| BL-09 | قواعد تقريب الوقت | FUTURE | 3 | ZenHR | |
| BL-10 | سياسة رمضان الكاملة وتقويم العطلات | PARITY (مؤجل جزئيًا) | 3 | ZenHR، TECFY؛ ksa L2 | في الـ MVP: قالب وردية بتاريخ سريان فقط |
| BL-11 | API عامة بمفاتيح محدودة النطاق + Webhooks موقعة | ENTERPRISE | 3 | Connecteam | |
| BL-12 | الاعتماد الآلي ضمن حدود | FUTURE | 4 | Deputy | سياسة صريحة؛ لا قرار آلي افتراضيًا |
| BL-13 | تقييد البصمة بنطاق IP / Wi-Fi | ENTERPRISE | لاحقًا | Zoho People | يحتاج ADR (قيمة ضعيفة كدليل منفرد) |
| BL-14 | تذكير بالبصمة عند الوصول للموقع | FUTURE | لاحقًا | QuickBooks Time | يتطلب موقعًا في الخلفية — ADR + تقييم خصوصية |
| BL-15 | تنبيهات البصمة الفائتة | FUTURE | 3 | QuickBooks Time | |
| BL-16 | إشعار خصوصية الموظف + سياسة الخصوصية | FUTURE | 4 (مسودة قبل الـ Pilot) | ksa P2–P4 | **يُنصح بتقديمه قبل الـ Pilot** (R-L2) |
| BL-17 | تصدير بيانات الموظف وطلبات الإتلاف (حقوق PDPL) | FUTURE | 3–4 | ksa P4 | |
| BL-18 | SSO (OIDC — Microsoft Entra ID) | ENTERPRISE | 3 | — | |
| BL-19 | الإجازات كمرجع مستورد | FUTURE | 3 | — | لا طلبات إجازة داخل المنصة |
| BL-20 | Fraud cases + Exception Copilot | FUTURE | 4 | — | قواعد قابلة للتفسير فقط |
| BL-21 | التحقق بالوجه (High Assurance) | OUT (حتى DPIA) | بعد 4 | Bayzat، Jibble، Deputy، TECFY، PassMH | ksa P1 |
| BL-22 | تنفيذ سبل الحقيقي لـ NationalAddressAdapter | PARITY | عند توفر الاشتراك | — | `Blocked` (ksa S4) |

## معتمد من تصميم الفريق (2026-10-26)

| ID | البند | المرحلة | المرجع |
|---|---|---|---|
| BL-23 | ملف الأدلة عند النزاع (Evidence Pack) | 3 | vision K1 — حجيته تحتاج رأيًا نظاميًا |
| BL-24 | محاكي السياسات + معايرة الفروع | 3 | ADR-0004، vision K2/K8 |
| BL-25 | لوحة تغطية الوردية اللحظية الكاملة | 3 | vision K3 |
| BL-26 | الإعارة بين الفروع | 3 | vision K4 |
| BL-27 | Decision API + Webhooks بحمولة الثقة | 3 | ADR-0007/0008/0009، vision K5 |
| BL-28 | تقرير الثقة الشهري الكامل | 3 | vision K7 |
| BL-29 | رفع LOC_UNCERTAIN بـ Wi-Fi الفرع | بعد Pilot 1 | ADR-0002/0003 |
| BL-30 | وضعية STRICT | بعد Pilot 1 | ADR-0005 |
| BL-31 | رمز مدير الفرع الدوّار | بعد Pilot 1 | ADR-0006 |
| BL-32 | SCIM + موصلات Jisr/ZenHR/Odoo/Entra (P1) | 3 | ADR-0010، integration-hub §4 |
| BL-33 | Sandbox وسجل مزامنة وواجهة تعيين حقول | 3 | integration-hub §5 |
| BL-34 | ISO 27001 | السنة الأولى | PD-12 |

## خارج المنتج (OUT) — لا يُبنى ما لم يُعتمد خلاف ذلك

| البند | المنافسون | السبب |
|---|---|---|
| أجهزة البصمة وتكاملها | Jisr، Bayzat، Palm HR، Zoho People | الرسالة: «دون أجهزة إضافية» |
| وضع الكشك / QR ثابت / PIN مشترك | Bayzat، Palm HR، Jibble، Deputy، QuickBooks Time، Clockify، Odoo | CLAUDE.md §2 |
| وسوم NFC | TECFY، كشك Jibble | جهاز ثابت في الموقع |
| بصمة من المتصفح | Palm HR | لا ربط جهاز موثق |
| تتبع GPS مستمر/حي، وانصراف آلي عند المغادرة، وتخزين أحداث السياج | Connecteam، Zoho People، QuickBooks Time، Workyard، TimeMobi، Jibble | الموقع عند البصمة فقط |
| إسناد الساعات لبنود تكلفة مشاريع | Workyard | خارج السوق المستهدف |
| إدارة الإجازات الكاملة والتوظيف والتقييم | — | CLAUDE.md §2 |
