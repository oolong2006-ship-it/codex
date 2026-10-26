# الثقة والدقة — رفع دقة قرار الحضور إلى أقصى حد ضمن الميثاق

- **الحالة:** مقترح — للنقاش والاعتماد البشري. لا يغيّر specs.md بذاته. كل بند موسوم `ADR` لا يُنفَّذ قبل ADR معتمد.
- **التاريخ:** 2026-10-26
- **المراجع الملزمة:** CLAUDE.md §2 و§5، specs §A و§B و§C و§G، ADR-0001، risks.md (R-T1..R-T6، R-L2، R-L3، R-L5، R-C6)، assumptions.md (A-03، A-04، A-06، A-07).
- **المنهج:** WebSearch مقيّد بالنطاقات الرسمية (`developer.apple.com`، `developer.android.com`، `source.android.com`، `developers.google.com`). الجلب المباشر (WebFetch/curl) ممنوع في بيئة التنفيذ (proxy 403)، لذلك **قرأنا ملخصات نتائج البحث للصفحات الرسمية لا الصفحات كاملة**. ما ورد في منتديات Apple يُوسم «تقرير مطورين» لا «سلوك موثق». كل واجهة تُعاد قراءتها كاملة في Spike المرحلة 1 قبل الاعتماد.
- **قاعدة الأرقام:** كل نسبة أو زمن مستهدف هنا **فرضية تُقاس**، لا ادعاء. الأرقام الإحصائية (حجم العينة) حسابية وليست ادعاء أداء.

### وسوم التصنيف
- **[ميثاق]** ضمن الميثاق وspecs الحالية — يمكن تنفيذه دون ADR.
- **[ADR]** متسق مع روح الميثاق لكنه يغيّر specs (حقل جديد، أو reason code، أو منطق قرار) — يحتاج ADR.
- **[DPIA]** يحتاج تقييم أثر على حماية البيانات (PDPL) إضافة إلى ADR.
- **[يخالف]** يخالف الميثاق — مرفوض ما لم يُعدَّل الميثاق نفسه.

---

## 1. تعريف قابل للقياس للدقة

### 1.1 الحقيقة الأرضية (Ground truth)
لا يمكن قياس الدقة دون معرفة «أين كان الموظف فعلًا». نعرّف لكل محاولة بصمة تسمية `truth ∈ {INSIDE, OUTSIDE}`:
- **في الاختبار الميداني:** يسجلها المختبِر يدويًا لحظة البصمة (نقطة معلومة على مخطط الفرع).
- **في الـ Pilot:** لا توجد حقيقة أرضية مباشرة؛ نستخدم **بدائل** (proxies) — انظر 1.4 — ونوسم المقاييس الناتجة «تقديرية».

### 1.2 المقاييس
| المقياس | التعريف | الاتجاه |
|---|---|---|
| **TAR** — معدل القبول الصحيح | `VERIFIED ÷ محاولات INSIDE` | ↑ |
| **FRR** — الرفض الخاطئ (False Reject) | `REJECTED ÷ محاولات INSIDE` | ↓ (الأخطر على تجربة الموظف) |
| **PR_in** — نسبة PENDING للداخلين | `PENDING_REVIEW ÷ محاولات INSIDE` | ↓ (عبء المراجعة، R-C6) |
| **FAR** — القبول الخاطئ (False Accept) | `VERIFIED ÷ محاولات OUTSIDE` | ↓ (الأخطر على العميل) |
| **CRR** — الرفض الصحيح | `REJECTED ÷ محاولات OUTSIDE` | ↑ |
| **FAR_attack** | FAR تحت هجوم مقصود (mock، محاكي، جهاز مروّت، مشاركة) | ↓ |
| **FASR** — نجاح المحاولة الأولى | نسبة الداخلين الذين حصلوا على VERIFIED دون `RETRY_LOCATION` | ↑ |
| **T_punch** | زمن من الضغط حتى رد الخادم (p50، p95) | ↓ |
| **T_final** | زمن من الضغط الأول حتى قرار نهائي (يشمل إعادة المحاولة؛ ولـ PENDING حتى قرار المراجع) | ↓ |
| **RR** — معدل الانقلاب | نسبة قرارات PENDING التي اعتمدها المراجع ÷ كل PENDING المحسومة | مؤشر معايرة |

> ملاحظة: TAR + FRR + PR_in = 100% للداخلين. يُقاس كل مقياس **لكل موقع، ولكل منصة، ولكل ظرف**، لا كرقم واحد للمنتج — المتوسط يخفي الفرع السيئ.

### 1.3 أهداف مقترحة (فرضيات تُقاس — ليست ادعاءات)
| المقياس | فرضية الهدف (Standard) | يُبطل إذا |
|---|---|---|
| FAR (غير هجومي) | ≤ 1% بثقة 95% | تجاوز الحد الأعلى لفترة الثقة 1% |
| FRR | ≤ 1% | > 2% في أي موقع |
| PR_in | ≤ 10% في المواقع الداخلية، ≤ 3% في الخارجية | > 20% في أي موقع بعد المعايرة (يؤكد R-T5 ويبطل A-04) |
| T_punch p95 | ≤ 8 ثوانٍ (منها انتظار fix) | > 15 ثانية |
| FAR_attack (mock على Android) | 0 VERIFIED | أي VERIFIED |

### 1.4 بروتوكول القياس

**أ) الاختبار الميداني (T-FIELD-01، يُسجل في `docs/field-tests.md`)**
- **حجم العينة (حسابي):**
  - لتقدير نسبة (TAR أو PR_in) بهامش ±5% وثقة 95%: `n ≈ 1.96² × 0.25 / 0.05² ≈ 385` محاولة INSIDE لكل (منصة × فئة ظرف). بهامش ±10%: ≈ 97.
  - لإثبات FAR منخفض: «قاعدة الثلاثة» — إن لم نرصد أي قبول خاطئ في `n` محاولة OUTSIDE فالحد الأعلى لـ FAR بثقة 95% ≈ `3/n`. لإثبات FAR ≤ 1% نحتاج ≥ 300 محاولة OUTSIDE دون قبول خاطئ؛ ولـ ≤ 2% نحتاج 150.
  - عمليًا للمرحلة الأولى: 3 مواقع × ≥ 100 INSIDE و≥ 100 OUTSIDE لكل منصة، ثم التوسع في الـ Pilot.
- **الأجهزة (مصفوفة دنيا):** iOS حديث + iOS أقدم إصدار مدعوم؛ Android: Samsung فئة عليا، Samsung فئة متوسطة، طراز صيني شائع (Xiaomi/Oppo/Realme)، جهاز منخفض السعر، **جهاز دون خدمات Google** (R-T4). تُسجل الطرازات الفعلية في `field-tests.md`. لا نفترض حصص سوق دون مصدر (A-03).
- **الظروف (لكل جهاز):**
  - INSIDE: (1) قرب المدخل/النافذة، (2) وسط الصالة، (3) عمق المطبخ/المستودع/الغرفة الباردة، (4) داخل مول (فرع داخلي)، (5) قبو/موقف سفلي إن وُجد، (6) طابق علوي لمبنى متعدد.
  - OUTSIDE: (7) خارج الباب مباشرة (< 10م من الحد)، (8) 25م، (9) 50م، (10) 100–200م، (11) المحل المجاور في المول، (12) الطابق فوق/تحت الفرع.
  - متغيرات: نهار/ليل (وردية ليلية)، Wi-Fi مفعّل/معطّل، إذن **موقع تقريبي** مقابل دقيق (iOS `reducedAccuracy`، Android «Approximate»)، بطارية منخفضة/توفير طاقة، أول بصمة بعد تشغيل الجهاز (cold fix).
- **ما يُسجل لكل محاولة:** truth، والنقطة، والجهاز، وإصدار النظام، والقرار، والأكواد، و`a`، و`s`، والمزوّد، وT_punch، وعدد إعادة المحاولات.
- **الهجوم (FAR_attack):** محاولات بمختبر داخلي وبموافقة: تطبيق mock location (Android)، أدوات تزييف موقع على iOS من حاسوب، محاكي، جهاز مروّت، إعادة إرسال طلب، مشاركة هاتف.

**ب) الـ Pilot**
- لا حقيقة أرضية؛ نقيس: PR_in التقريبي (PENDING ÷ كل البصمات في وقت الوردية)، و**RR** (إذا اعتُمد ≥ 95% من PENDING في موقع، فالسياسة متشددة دون فائدة → مرشح للمعايرة؛ وإذا رُفض كثير منها فالإشارات مفيدة)، والاعتراضات، وT_punch من سجلات الخادم.
- **تدقيق عيّني:** أسبوعيًا يؤكد مدير الفرع حضور عينة عشوائية من VERIFIED (يقدّر FAR تقريبيًا) — دون إضافة أي تتبع.
- **اختبار أحمر دوري بموافقة العميل:** موظف تجريبي يحاول البصمة من خارج الفرع بطرق مختلفة.

---

## 2. دمج إشارات الموقع عند لحظة البصمة فقط

**مبدأ الميثاق:** كل الإشارات أدناه تُقرأ **فقط** داخل نافذة البصمة (بعد الضغط وحتى الإرسال، وضمن صلاحية التحدي 60 ثانية — specs §D). لا خدمة خلفية، ولا geofence monitoring، ولا تسجيل دوري. أي جمع خارج هذه النافذة **[يخالف]**.

### 2.1 جدول الإشارات

| الإشارة | iOS | Android | ما نستخدمه منها | التصنيف |
|---|---|---|---|---|
| **دقة أفقية `a`** | `CLLocation.horizontalAccuracy` | `Location.getAccuracy()` | معادلة §B كما هي | [ميثاق] |
| **عينات متعددة داخل النافذة** | تحديثات Core Location خلال 3–8 ث | `FusedLocationProviderClient.getCurrentLocation` مع `maxUpdateAge = 0` لعينة طازجة، أو عدة عينات | إرسال عدة عينات (الحقل `location_samples[]` موجود) ليختار §B الأقل `a` | [ميثاق] |
| **المزوّد** | غير متاح بهذا الشكل | `provider` (gps/fused/network) — موجود في §D | إشارة داعمة: `network` فقط مع دقة ضعيفة يفسر PENDING | [ميثاق] للتسجيل؛ [ADR] لأي أثر على القرار |
| **صلاحية دقيقة/تقريبية** | `CLAccuracyAuthorization.reducedAccuracy` + `requestTemporaryFullAccuracyAuthorization` | المستخدم يختار «Approximate» (≈ 3 كم²) منذ Android 12 | رسالة واضحة بدل PENDING غامض؛ طلب دقة كاملة مؤقتة على iOS عند البصمة | [ADR] (كود جديد `LOC_APPROXIMATE_PERMISSION`) |
| **كشف المحاكاة** | `CLLocationSourceInformation.isSimulatedBySoftware` (iOS 15+) | `Location.isMock()` (API 31+)، و`isFromMockProvider()` (مهمل منذ 31)، و`LocationCompat.isMock` | → `RISK_MOCK_LOCATION` | [ميثاق] — specs §A تقول «أو ما يعادلها» |
| **موقع من ملحق خارجي** | `CLLocationSourceInformation.isProducedByAccessory` | — | إشارة مخاطرة/دليل (CarPlay أو GPS خارجي قد يحقن موقعًا) | [ADR] (`RISK_LOCATION_ACCESSORY`) |
| **Wi-Fi المتصل (BSSID)** | `NEHotspotNetwork.fetchCurrent` — يتطلب entitlement `com.apple.developer.networking.wifi-info` + أحد الشروط (أبرزها صلاحية موقع دقيق) | `WifiInfo.getBSSID()` — يتطلب صلاحية موقع | مطابقة BSSID مع مجموعة الفرع المعايرة (§3) | [ADR] + تحديث إشعار الخصوصية |
| **مسح Wi-Fi (شبكات مرئية)** | **لا توجد واجهة عامة لمسح الشبكات** — لم نجد في التوثيق الرسمي ما يسمح لتطبيق عادي بذلك؛ iOS يعطي فقط الشبكة المتصلة | `WifiManager.startScan()` (مهمل منذ API 28 وقد يُزال، ومقيد: 4 مسوح/دقيقتين للتطبيق الأمامي على Android 9+) و`getScanResults()` — يتطلبان `ACCESS_FINE_LOCATION` حتى مع target 13+ | Android فقط: نقرأ `getScanResults()` (قد تكون نتائج مخزنة — نسجل عمرها) | [ADR] |
| **الخلية** | لا واجهة عامة لمعرّف الخلية (لم نجد) | `TelephonyManager.getAllCellInfo()` (قد يعيد نتائج مخزنة لـ target Q+) و`requestCellInfoUpdate()` (محدود المعدل وغير مضمون) — `ACCESS_FINE_LOCATION` | إشارة ضعيفة: «الخلية المخدِّمة ضمن المجموعة المعتادة للفرع» | [ADR] — قيمة منخفضة، نوصي بتأجيله |
| **الارتفاع/الطابق** | `CLLocation.floor` (`CLFloor.level`، منطقي لا يطابق ترقيم المبنى، ويظهر غالبًا في مواقع Apple المخططة داخليًا)، و`ellipsoidalAltitude`، و`verticalAccuracy` | `Location.getAltitude()`/`getVerticalAccuracyMeters()` | **دليل فقط** يُخزن، لا يؤثر على القرار (عدم الموثوقية موثقة في تقارير المطورين) | [ميثاق] للتسجيل كدليل؛ [ADR] لأي استخدام |

### 2.2 قيود مهمة وصادقة
1. **iOS `isSimulatedBySoftware` ليس كاشفًا كاملًا.** التوثيق يصفه بأن النظام ولّد الموقع بمحاكاة برمجية على الجهاز؛ وتقارير مطورين في منتديات Apple تفيد بأنه يكون `true` مع محاكاة Xcode و`false` مع أدوات تزييف من طرف ثالث (ثريد 803179) — **تقرير مطورين، غير مؤكد رسميًا**. لذلك لا نَعِد العميل بكشف تزييف iOS؛ الحماية الحقيقية على iOS هي App Attest (تطبيق أصلي على جهاز Apple حقيقي) + اتساق الإشارات.
2. **Android `isMock` يكشف مزوّدي الاختبار** (`setTestProviderLocation` تُعلَّم mock لكل العملاء). الجهاز المروّت قد يخفي ذلك → لذلك يُقرن بـ Play Integrity وKey Attestation (§5).
3. **BSSID ليس سرًا**: يمكن تزييفه بنقطة وصول تحمل نفس BSSID. هو إشارة **داعمة** لا إثبات — ويقل خطر التزييف لأن المهاجم يحتاج المعدّات + تجاوز الإشارات الأخرى.
4. **BSSID بيانات شخصية محتملة** (قد تشمل hotspot جوال زميل). القرار: نخزن `HMAC(tenant_salt, BSSID)` لا الخام، وفقط الشبكات التي تظهر في نافذة البصمة، مع مدة احتفاظ معلنة (R-L2).
5. **لا نرسل أي من هذه الإشارات لمزوّد خارجي** (لا Google Geolocation API ولا ما يماثلها) — R-L3 والميثاق «الخادم صاحب القرار».

### 2.3 سلوك التطبيق عند البصمة [ميثاق]
- عند الضغط: طلب تحدٍّ + بدء قراءة الموقع **بالتوازي** (يقلل T_punch).
- جمع عينات حتى `a ≤ target_accuracy_m` للموقع أو انقضاء مهلة (سياسة)، ثم الإرسال بكل العينات.
- على iOS عند `reducedAccuracy`: طلب `requestTemporaryFullAccuracyAuthorization` بنص غرض واضح قبل البصمة.
- عند `LOC_LOW_ACCURACY`: رسالة الاقتراب من نافذة/المدخل (§B) — مع نص خاص بالموقع تحدده المعايرة («أقرب نقطة جيدة الاستقبال: المدخل الرئيسي»).

---

## 3. معايرة لكل موقع (Site calibration) — قواعد قابلة للتفسير فقط

**الهدف:** تقليل PR_in في الفروع الداخلية دون رفع FAR، وبقواعد يقرؤها HR والمدقق. **لا ML** — أي نموذج متعلم [ADR].

### 3.1 مصدر التعلم (منع التسميم)
- يُستخدم فقط: بصمات `VERIFIED` دون أي إشارة RISK، + بصمات `PENDING_REVIEW` **اعتمدها إنسان** صراحةً.
- يُستبعد: المرفوض، وما فيه `RISK_*`، والأحداث غير المتصلة، وبصمات الأجهزة في فترة `RISK_RECENT_REBIND`.
- حد أدنى: ≥ 200 بصمة مؤهلة من ≥ 10 موظفين مختلفين و≥ 14 يومًا (فرضية تُضبط) — كي لا يحدد موظف واحد بصمة الفرع.

### 3.2 ما تُنتجه المعايرة (لقطة `site_calibration_snapshot`)
| الحقل | القاعدة (قابلة للتفسير) |
|---|---|
| `accuracy_p50/p90` | مئينات `a` في البصمات المؤهلة |
| `suggested_tolerance_m` | `min(policy.tolerance_cap_m, max(0, p90(s + a) للبصمات المؤهلة))` — يُقترح فقط |
| `known_bssids[]` | (hash) كل BSSID ظهر في ≥ 30% من البصمات المؤهلة خلال النافذة (فرضية) |
| `typical_providers` | توزيع المزوّد |
| `good_signal_hint` | نص يكتبه HR (لا يُستنتج آليًا) |

### 3.3 قابلية التدقيق والارتباط بالسياسة
- اللقطة **غير قابلة للتعديل** (append-only)، وتحمل: نافذة البيانات، وعدد البصمات، والقاعدة وإصدارها، وhash للمدخلات.
- **لا تُطبَّق آليًا.** HR/مالك الحساب يرى الاقتراح + **محاكاة أثر (policy replay)**: إعادة تقييم بصمات آخر 30 يومًا من `location_evidence` المخزنة بالسياسة المقترحة → «كانت 47 بصمة PENDING ستصبح VERIFIED، و0 REJECTED ستصبح VERIFIED». المحاكاة لا تغيّر أي قرار تاريخي (append-only).
- عند الاعتماد: إصدار سياسة جديد `policy_version_id` يشير إلى `calibration_snapshot_id`، فيبقى كل قرار مستقبلي قابلًا للتفسير: «VERIFIED لأن s+a ≤ t، وt=25 من المعايرة #12 المعتمدة من فلان في تاريخ».
- تنبيه: رفع `t` يرفع FAR نظريًا. لذلك: سقف `tolerance_cap_m` في السياسة، وعرض المسافة لأقرب موقع غير مصرح/مبنى مجاور في شاشة الاعتماد.
- **التصنيف:** حساب الإحصاءات والاقتراح والمحاكاة = [ميثاق] (التوصية لإنسان يعتمد، و`tolerance_m` موجود في specs). استخدام `known_bssids` في القرار = [ADR].

---

## 4. درجة ثقة قابلة للتفسير (Evidence score)

### 4.1 المبدأ
الدرجة **تكمّل** §B ولا تستبدلها: §B تبقى المصدر الوحيد لـ `LOC_INSIDE / LOC_OUTSIDE / LOC_UNCERTAIN / LOC_LOW_ACCURACY`. الدرجة = مجموع نقاط، **لكل نقطة reason code** يظهر في `signals[]`، وأوزانها جزء من **إصدار السياسة** (لا أرقام في الكود — CLAUDE.md §5.4).

```
risk_points    = Σ weight(code)   لكل إشارة RISK_* مرصودة
support_points = Σ weight(code)   لكل إشارة SUP_* مرصودة (تُسجل دائمًا)
```

### 4.2 كيف تؤثر
| الأثر | القاعدة | التصنيف |
|---|---|---|
| **خفض** (VERIFIED → PENDING) | `risk_points ≥ pending_threshold` حتى لو لم تكن أي إشارة منفردة كافية | [ADR] — specs §A تذكر الإشارات منفردة، والتجميع منطق جديد |
| **رفع** (LOC_UNCERTAIN → VERIFIED) | فقط إذا: `s − a ≤ t` (ليس LOC_OUTSIDE)، و`a ≤ max_accuracy_m`، و`risk_points = 0`، و`SUP_WIFI_KNOWN` موجود، والموقع مفعّل عليه الخيار | [ADR] — يغيّر نتيجة §B؛ **أكبر رافعة لتقليل PR_in** |
| **ترتيب طابور المراجعة** | PENDING مرتبة بـ `risk_points` تنازليًا + عرض «لماذا» | [ميثاق] — مساعدة المراجع لا قرار |

لا مسار يحوّل أي شيء إلى `REJECTED` عبر الدرجة إلا بتفعيل صريح من العميل (specs §A).

### 4.3 أكواد مقترحة (تحتاج ADR لتحديث specs §A/§B)
| الكود | النوع | المصدر | ملاحظة |
|---|---|---|---|
| `LOC_APPROXIMATE_PERMISSION` | LOC (PENDING) | iOS reducedAccuracy / Android approximate | رسالة: «فعّل الموقع الدقيق لهذا التطبيق» |
| `RISK_LOCATION_ACCESSORY` | RISK | iOS `isProducedByAccessory` | قد يكون مشروعًا (سيارة) — وزن منخفض |
| `RISK_SAMPLE_INCONSISTENT` | RISK | عينات النافذة نفسها تقفز مسافة تتجاوز `a1 + a2 + هامش` في ثوانٍ | علامة على حقن موقع |
| `RISK_ACCURACY_IMPLAUSIBLE` | RISK | `a` أصغر بكثير من `accuracy_p50` المعايَر لموقع داخلي (مثلًا a=1م في عمق مول) | قاعدة على المعايرة |
| `RISK_WIFI_UNKNOWN_AT_SITE` | RISK | الموقع له `known_bssids` لكن البصمة المتصلة بـ Wi-Fi ترى BSSID غير معروف | لا تُفعَّل إن لم يكن الجهاز متصلًا |
| `SUP_WIFI_KNOWN` | SUP | BSSID مطابق | داعم فقط |
| `SUP_PROVIDER_GNSS` | SUP | المزوّد gps مع a جيدة | داعم ضعيف |
| `RISK_REMOTE_CONTROL_APP` | RISK | Play Integrity `appAccessRiskVerdict` يحوي `…_CONTROLLING` أو `…_CAPTURING` | يشير لتحكم عن بعد بالجهاز |
| `RISK_HIGH_DEVICE_ACTIVITY` | RISK | `recentDeviceActivity` = LEVEL_3/4 | مزرعة أجهزة/أتمتة |
| `RISK_BOOT_UNVERIFIED` | RISK | Key Attestation `verifiedBootState ≠ Verified` أو `deviceLocked = false` | bootloader مفتوح |
| `RISK_APP_ATTEST_KEY_CHURN` | RISK (تحقيق فقط) | مقياس الاحتيال في receipt الخاص بـ App Attest | Apple توصي بعدم الحجب به — للتحقيق |

---

## 5. سلامة الجهاز والطلب

| المكوّن | ما نتحقق منه رسميًا | الاستخدام المقترح | التصنيف |
|---|---|---|---|
| **App Attest (iOS)** | attestation مرة عند الربط ثم assertion لكل طلب؛ **عداد assertion متزايد** — ثباته أو تناقصه قد يدل على نسخة تطبيق مخترقة (WWDC21). **Receipt + fraud metric**: عدد تقريبي للمفاتيح المصدّقة للتطبيق على الجهاز خلال 30 يومًا؛ Apple **توصي بعدم حجب المستخدمين به** واستخدامه للتحقيق ومراقبة القفزات | رفض عند فشل التحقق/العداد (`ATTESTATION_FAILED` موجود)؛ fraud metric → `RISK_APP_ATTEST_KEY_CHURN` للتحقيق فقط | [ميثاق] للتحقق؛ [ADR] للكود الجديد |
| **Play Integrity (Android)** | **Standard request** مع `requestHash` (حد 500 بايت) يُعاد داخل الاستجابة الموقّعة → نضع فيه `SHA256(nonce ‖ canonical_json(body))`. الحقول الحالية: `deviceIntegrity.deviceRecognitionVerdict` (`MEETS_BASIC_INTEGRITY`، `MEETS_DEVICE_INTEGRITY`، `MEETS_STRONG_INTEGRITY` — الأخير على Android 13+ يتطلب تحديثات أمنية خلال سنة)؛ و`deviceAttributes.sdkVersion` (اختياري opt-in)؛ و`recentDeviceActivity` (LEVEL_1..4، opt-in)؛ و`environmentDetails.appAccessRiskVerdict.appsDetected` (`KNOWN_/UNKNOWN_` + `INSTALLED/CAPTURING/CONTROLLING/OVERLAYS`). الحقول الاختيارية تتطلب تفعيلًا في Play Console | `MEETS_DEVICE_INTEGRITY` غائب → `RISK_DEVICE_INTEGRITY` (موجود)؛ Strict: اشتراط `MEETS_STRONG_INTEGRITY` + sdkVersion | [ميثاق] للأساسي؛ [ADR] للحقول الاختيارية |
| **Key Attestation (Android)** | الجذر موقّع بمفتاح Google، و`attestationSecurityLevel` = TrustedEnvironment/StrongBox، وفحص الإلغاء، وقراءة أول امتداد attestation فقط في السلسلة، و`attestationChallenge` = nonce، و`RootOfTrust` (`verifiedBootState`، `deviceLocked`)، وفحص `attestationVersion` قبل التفسير؛ التحقق **على الخادم** لا الجهاز. Google توصي بمكتبة التحقق الرسمية (Kotlin) | Software-only key → رفض الربط في High/Strict؛ boot غير موثق → `RISK_BOOT_UNVERIFIED` | [ميثاق] للتحقق (ADR-0001)؛ [ADR] للكود |
| **سفر مستحيل** | — | تحسين: `effective_distance = max(0, d − a_prev − a_now)` قبل حساب السرعة، لتجنب الإنذار الكاذب من دقة ضعيفة. استثناء فرعين بينهما مسافة < هامش | [ADR] (تعديل تعريف `RISK_IMPOSSIBLE_TRAVEL`) |
| **انحراف الساعة** | وقت الخادم مرجع (موجود) | إضافة: مقارنة `captured_at` للعينة بوقت العميل والخادم — عينة «من المستقبل» أو أقدم من التحدي → `CHALLENGE`-مرتبطة: نرفض العينات الملتقطة قبل `challenge.issued_at` | [ADR] — يقوّي ربط الموقع باللحظة |
| **الجهاز المشترك** | `RISK_SHARED_DEVICE` (موجود) | إضافة إشارات: تبديل الحساب على نفس مفتاح الجهاز، وتقارب بصمتين لموظفين مختلفين من نفس `key_id` خلال دقائق | [ميثاق] |
| **الروت/الجيلبريك** | Android: Play Integrity + RootOfTrust. iOS: **لا توجد واجهة رسمية لكشف الجيلبريك** (لم نجد)؛ App Attest هو الإشارة الرسمية | لا فحوص روت داخل التطبيق كأمن (CLAUDE.md §5.1)؛ يمكن إضافتها كتجربة مستخدم فقط | [ميثاق] |

**R-T4 (Android دون GMS):** لا Play Integrity ولا `getCurrentLocation` من Fused (يُستخدم `LocationManager`). المسار: Key Attestation فقط + `RISK_DEVICE_INTEGRITY` → PENDING، وفي Strict: غير مسموح (يُعلن للعميل مسبقًا).

---

## 6. وضعيات الضمان (Assurance levels) — لكل موقع [ADR]

يختارها العميل لكل موقع وتُخزَّن في إصدار السياسة. كلها تستخدم معادلة §B نفسها؛ تختلف في المدخلات والعتبات وما يُشترط.

| البند | Standard | High | Strict |
|---|---|---|---|
| معادلة §B | كما هي | كما هي | كما هي |
| `max_accuracy_m` (افتراضي سياسة) | 100 | 50 | 30 |
| `max_sample_age_s` | 30 | 20 | 15 + عينة بعد `challenge.issued_at` |
| رفع LOC_UNCERTAIN بدعم Wi-Fi (§4.2) | مسموح (اختياري) | مسموح | ممنوع |
| `risk_points` → PENDING | العتبة عالية | متوسطة | أي RISK → PENDING |
| Android `MEETS_DEVICE_INTEGRITY` | غيابه → PENDING | غيابه → PENDING | مطلوب، و`STRONG` اختياري بسياسة؛ غيابه → REJECTED (بتفعيل صريح) |
| Key Attestation software-only | PENDING | REJECTED للربط | REJECTED للربط |
| أجهزة دون GMS | مسموحة (PENDING) | مسموحة (PENDING) | غير مسموحة |
| Mock/simulated | PENDING (specs) | PENDING | REJECTED (تفعيل صريح من العميل وفق specs §A) |
| البصمة دون اتصال | PENDING (specs §E) | PENDING | غير مسموحة |
| رمز مدير الفرع الدوّار (§7) | — | — | اختياري كعامل ثانٍ (ADR منفصل) |
| الأثر المتوقع (فرضية تُقاس) | PR_in أقل، FAR أعلى قليلًا | توازن | FAR الأدنى، PR_in وFRR أعلى |

**التحقق بالوجه:** ليس مستوى في الـ MVP (**[يخالف]** الميثاق §2 حاليًا). يُحجز مكانه كمستوى مستقبلي `Strict+Biometric` يتطلب: DPIA معتمدة، وتعديل الميثاق، وADR، وموافقة صريحة منفصلة من الموظف، وبديل غير بيومتري، وأن تكون المطابقة على الجهاز إن أمكن (لا تخزين قوالب وجه مركزيًا دون مبرر). R-L5.

---

## 7. أفكار مبتكرة — تقييم أمين

| # | الفكرة | الفائدة | الكلفة | الخصوصية | قابلية التحايل | التصنيف |
|---|---|---|---|---|---|---|
| I1 | **رمز تحدٍّ دوّار على جوال مدير الفرع**: رقم 6 خانات (أو QR ديناميكي) مشتق من سر الموقع + الوقت (نمط TOTP) يتغير كل 30 ث؛ الموظف يدخله/يمسحه، والخادم يتحقق | دليل «تواجد مع المدير» قوي في الأماكن ضعيفة GPS | متوسطة: شاشة في تطبيق المدير، والمدير يجب أن يكون حاضرًا والتطبيق مفتوحًا | منخفض (لا بيانات إضافية للموظف) | **متوسطة–عالية**: المدير أو زميل يصوّر الرمز ويرسله بالواتساب خلال 30 ث (relay). يُخفف بالجمع مع §B (لا يرفع LOC_OUTSIDE أبدًا) ومع تسجيل من شاهد الرمز | [ADR] — ليس «QR ثابتًا» لكنه قريب من حظر الميثاق؛ يُقبل **عاملًا ثانيًا** في Strict أو **مسار استثناء** لـ LOC_LOW_ACCURACY، لا وسيلة أساسية |
| I2 | **تأكيد زميل** (موظف VERIFIED قريب زمنيًا يؤكد) | يقلل PENDING بلا جهد HR | منخفضة تقنيًا | متوسطة: يكشف لزميل حضور غيره | **عالية**: التواطؤ هو أصل «buddy punching» الذي نحاربه (A-01) | [ADR] — **لا نوصي به** |
| I3 | **Beacon BLE من جوال المدير** | إشارة قرب لا تحتاج تفاعلًا | عالية: iOS في الخلفية يتجاهل الاسم ويضع UUIDs في منطقة overflow لا تراها إلا أجهزة iOS تبحث عنها صراحةً، والإعلان «best effort»؛ Android 12+ يحتاج `BLUETOOTH_ADVERTISE`/`BLUETOOTH_SCAN` و`neverForLocation` يحجب بعض الـ beacons | متوسطة: صلاحية «الأجهزة القريبة» إضافية | متوسطة: relay BLE ممكن لكنه مكلف؛ نسخ الإعلان سهل إن كان ثابتًا (يجب أن يحمل رمزًا دوّارًا) | [ADR] — جدوى منخفضة بسبب قيود iOS؛ يُؤجل لـ Spike |
| I4 | **«بصمة حضور الفريق» للمدير** (المدير يؤكد حضور قائمة الوردية) | حل لحالات الفشل الجماعي (انقطاع، قبو) | منخفضة | منخفضة | **عالية**: المدير يؤكد موظفين وهميين أو غائبين؛ يعيد السلطة لشخص واحد | [ADR] — كـ**تسوية بشرية** موسومة (`attendance_adjustments`) مع سبب، لا كبصمة؛ وتُعرض لـ HR كمؤشر |
| I5 | **إعادة محاولة ذكية مرتبطة بالمعايرة** («اذهب إلى المدخل الرئيسي») | تقليل PR_in مباشرة | منخفضة | لا شيء | لا يضيف ثغرة | [ميثاق] |
| I6 | **محاكاة السياسة (policy replay)** قبل أي تغيير | قرارات أفضل للعميل، شفافية | منخفضة–متوسطة | تُعالج بيانات مخزنة أصلًا | — | [ميثاق] |
| I7 | **مطابقة BSSID المتصل** (§2، §3) | أكبر رافعة داخلية في الفروع ذات Wi-Fi ثابت | متوسطة (entitlement على iOS) | تحتاج إشعارًا وتجزئة | متوسطة (تزييف BSSID ممكن) | [ADR] |
| I8 | **Wi-Fi RTT (Android)** | دقة داخلية عالية حيث تدعمها نقاط الوصول | عالية: يتطلب نقاط وصول وأجهزة داعمة — «أجهزة إضافية» فعليًا إن لم تكن موجودة | متوسطة | منخفضة | [يخالف] إن تطلب شراء نقاط وصول؛ [ADR] إن وُجدت مسبقًا |
| I9 | **مراقبة السياج الخلفية للبصمة التلقائية** | راحة | — | عالية | — | **[يخالف]** (تتبع مستمر) |
| I10 | **التحقق بالوجه** | ضد مشاركة الهاتف | عالية | عالية جدًا (بيومتري) | متوسطة | **[يخالف]** في الـ MVP؛ مستقبلًا بـ DPIA |
| I11 | **«اثبت الحياة» بلا بيومتري**: البصمة تتطلب فتح قفل الجهاز (`userPresence`/biometric-bound key محليًا) | يثبت أن مالك الجهاز (أو من يعرف رمزه) فتحه — يقلل مشاركة الهاتف العابرة | منخفضة | منخفضة: المطابقة داخل الجهاز، والخادم لا يرى بيانات بيومترية | متوسطة: من يعرف رمز القفل يتجاوزه | [ADR] + **مراجعة نظامية** لأن استخدام Face ID/بصمة الإصبع المحلية قد يُفسَّر كمعالجة بيومترية — يُقيد بـ «رمز الجهاز» حتى رأي المستشار |

**التوصية:** I5 وI6 فورًا؛ I7 ثم I11 (رمز الجهاز فقط) بـ ADR؛ I1 كعامل ثانٍ لـ Strict ومسار استثناء؛ رفض I2 وI9.

---

## 8. مصفوفة اختبارات إضافية (تكمّل F1–F18)

| # | السيناريو | النتيجة المتوقعة | المستوى | يعتمد على |
|---|---|---|---|---|
| F19 | iOS: عينة `isSimulatedBySoftware = true` داخل السياج | `PENDING_REVIEW / RISK_MOCK_LOCATION` | unit + جهاز | [ميثاق] |
| F20 | Android: عينة من test provider (`isMock = true`) على API ≥ 31، وأخرى بـ `isFromMockProvider` على API < 31 | `RISK_MOCK_LOCATION` في الحالتين | unit + جهاز | [ميثاق] |
| F21 | عينة `captured_at` قبل إصدار التحدي | تُستبعد → `LOC_NO_VALID_SAMPLE` | unit | [ADR] |
| F22 | عينة `captured_at` بعد وقت استلام الخادم (من المستقبل) | تُستبعد + `RISK_CLOCK_SKEW` | unit | [ADR] |
| F23 | Play Integrity token بـ `requestHash` لا يطابق body | `REJECTED / ATTESTATION_FAILED` | API e2e | [ميثاق] |
| F24 | App Attest assertion بعداد أقل أو مساوٍ للسابق | `REJECTED / ATTESTATION_FAILED` | API e2e | [ميثاق] |
| F25 | Key Attestation بسلسلة غير موقعة من جذر Google أو مستوى Software عند الربط في High | رفض الربط | API e2e | [ميثاق]/[ADR] |
| F26 | Key Attestation بـ `attestationChallenge ≠ nonce` | رفض الربط | API e2e | [ميثاق] |
| F27 | Key Attestation بـ `verifiedBootState = Unverified` | `RISK_BOOT_UNVERIFIED` | unit | [ADR] |
| F28 | `appAccessRiskVerdict` يحوي `UNKNOWN_CONTROLLING` | `RISK_REMOTE_CONTROL_APP` → PENDING | unit | [ADR] |
| F29 | عينتان في نفس النافذة بفارق 2 كم خلال 3 ث بدقة 10م | `RISK_SAMPLE_INCONSISTENT` | unit | [ADR] |
| F30 | سفر مستحيل ظاهري بين فرعين متجاورين بدقة ضعيفة (`d < a_prev + a_now`) | **لا** `RISK_IMPOSSIBLE_TRAVEL` | unit | [ADR] |
| F31 | إذن موقع تقريبي (iOS reducedAccuracy / Android approximate) | `PENDING / LOC_APPROXIMATE_PERMISSION` + `next_action = RETRY_LOCATION` | unit + جهاز | [ADR] |
| F32 | LOC_UNCERTAIN + `SUP_WIFI_KNOWN` + لا RISK، في موقع Standard مفعّل | `VERIFIED` مع الكودين | unit | [ADR] |
| F33 | LOC_OUTSIDE + `SUP_WIFI_KNOWN` | يبقى `REJECTED` (الدعم لا يتخطى OUTSIDE أبدًا) | unit | [ADR] |
| F34 | نفس F32 في موقع Strict | يبقى `PENDING_REVIEW` | unit | [ADR] |
| F35 | المعايرة لا تتعلم من بصمات مرفوضة أو بها RISK أو من موظف واحد | اللقطة تستبعدها؛ لا لقطة تحت الحد الأدنى | unit | [ميثاق] |
| F36 | تطبيق لقطة معايرة دون اعتماد بشري عبر أي endpoint | 403، دون تغيير السياسة | API e2e | [ميثاق] |
| F37 | policy replay لا يعدّل `attendance_events` ولا `attendance_decisions` التاريخية | عدد الصفوف وhash ثابتان | DB | [ميثاق] |
| F38 | قرار بعد تغيير السياسة يحمل `policy_version_id` و`calibration_snapshot_id` الجديدين، والقديم يبقى بإصداره | تحقق من الأدلة | API e2e | [ميثاق] |
| F39 | التطبيق لا يقرأ الموقع/Wi-Fi/الخلية خارج نافذة البصمة | لا استدعاءات موقع في الخلفية؛ لا background location في manifest/Info.plist | فحص ثابت + جهاز | [ميثاق] — حارس الميثاق |
| F40 | BSSID الخام لا يُخزن في أي جدول أو سجل | فقط HMAC بملح العميل | DB + فحص سجلات | [ADR] |
| F41 | رمز المدير الدوّار (إن اعتُمد) منتهٍ أو لموقع آخر | لا يُحتسب، و`RISK_*` مناسب | API e2e | [ADR] |
| F42 | جهاز Android دون GMS في موقع Strict | `REJECTED` برسالة مفهومة ومسار اعتراض | API e2e | [ADR] |
| F43 | ميداني: 12 ظرفًا × مصفوفة الأجهزة (§1.4) | تُسجل TAR/FRR/PR_in/FAR/T_punch لكل خلية | يدوي `field-tests.md` | [ميثاق] |

---

## 9. القرارات المطلوب اعتمادها (ملخص ADRs مقترحة)

| ADR مقترح | المحتوى | الأولوية |
|---|---|---|
| ADR-0002 Location signals at punch | إضافة حقول لـ specs §D: `source_info` (iOS simulated/accessory)، و`accuracy_authorization`، و`wifi_connected_bssid_hash`، و`wifi_scan_hashes[]` (Android)، و`vertical`/`floor` كدليل؛ وiOS entitlement `wifi-info`؛ وتحديث إشعار الخصوصية | عالية |
| ADR-0003 Evidence score & new reason codes | §4: الأوزان في السياسة، وقاعدة الخفض، وقاعدة الرفع المقيدة بـ Wi-Fi، والأكواد الجديدة | عالية |
| ADR-0004 Site calibration | §3: مصدر التعلم، والحدود الدنيا، واللقطة، والاعتماد البشري، والسقف، وpolicy replay | متوسطة |
| ADR-0005 Assurance levels | §6 | متوسطة |
| ADR-0006 Manager rotating code | I1 كعامل ثانٍ/مسار استثناء | منخفضة (بعد الـ Pilot) |
| — | تحسين `RISK_IMPOSSIBLE_TRAVEL` ورفض العينات قبل التحدي (تعديل specs §A/§B) | ضمن ADR-0003 |

**أسئلة مفتوحة للمالك:** (1) هل نقبل جمع BSSID (مُجزأ) مع تحديث إشعار الخصوصية؟ (2) هل يُسمح لـ Standard برفع LOC_UNCERTAIN بدعم Wi-Fi؟ (3) هل يُطلب رأي نظامي في «فتح قفل الجهاز» (I11)؟ (4) هل يُعرض Strict للعميل التجريبي أم Standard/High فقط؟

---

## 10. المصادر الرسمية (تحقق عبر بحث مقيد بالنطاق، 2026-10-26)

**Android / Google**
- Location (`isMock`، `isFromMockProvider` مهمل منذ API 31): https://developer.android.com/reference/android/location/Location
- LocationCompat (`isMock`): https://developer.android.com/reference/androidx/core/location/LocationCompat
- CurrentLocationRequest (`maxUpdateAge`، الأولوية): https://developers.google.com/android/reference/com/google/android/gms/location/CurrentLocationRequest
- FusedLocationProviderClient: https://developers.google.com/android/reference/com/google/android/gms/location/FusedLocationProviderClient
- الموقع التقريبي (Android 12): https://developer.android.com/develop/sensors-and-location/location/permissions/runtime
- Wi-Fi scanning (القيود والتقييد): https://developer.android.com/develop/connectivity/wifi/wifi-scan
- صلاحيات Wi-Fi (`NEARBY_WIFI_DEVICES` مقابل الموقع): https://developer.android.com/develop/connectivity/wifi/wifi-permissions
- WifiManager: https://developer.android.com/reference/android/net/wifi/WifiManager — WifiInfo: https://developer.android.com/reference/android/net/wifi/WifiInfo
- Wi-Fi RTT: https://developer.android.com/develop/connectivity/wifi/wifi-rtt
- TelephonyManager (`getAllCellInfo`، `requestCellInfoUpdate`): https://developer.android.com/reference/android/telephony/TelephonyManager
- تغييرات خصوصية Android 10: https://developer.android.com/about/versions/10/privacy/changes
- صلاحيات Bluetooth: https://developer.android.com/develop/connectivity/bluetooth/bt-permissions
- Play Integrity verdicts: https://developer.android.com/google/play/integrity/verdicts
- Play Integrity standard request (`requestHash`): https://developer.android.com/google/play/integrity/standard
- Play Integrity overview: https://developer.android.com/google/play/integrity/overview
- Key Attestation (developer): https://developer.android.com/privacy-and-security/security-key-attestation
- Key and ID attestation (AOSP، `RootOfTrust`): https://source.android.com/docs/security/features/keystore/attestation

**Apple**
- `isSimulatedBySoftware`: https://developer.apple.com/documentation/corelocation/cllocationsourceinformation/issimulatedbysoftware
- `isProducedByAccessory`: https://developer.apple.com/documentation/corelocation/cllocationsourceinformation/isproducedbyaccessory
- تقرير مطورين عن حدود `isSimulatedBySoftware` (غير رسمي): https://developer.apple.com/forums/thread/803179
- CLLocation (`floor`، `ellipsoidalAltitude`، `verticalAccuracy`): https://developer.apple.com/documentation/corelocation/cllocation
- CLAccuracyAuthorization: https://developer.apple.com/documentation/corelocation/claccuracyauthorization
- NEHotspotNetwork `fetchCurrent` وentitlement `wifi-info` (منتدى Apple ينقل ترويسة SDK): https://developer.apple.com/forums/thread/679038
- App Attest/DeviceCheck — WWDC21 (العداد، الـ receipt، fraud metric): https://developer.apple.com/videos/play/wwdc2021/10244/
- WWDC26 «Secure your apps with App Attest» (ظهر في البحث؛ لم نراجع محتواه): https://developer.apple.com/videos/play/wwdc2026/201/
- Core Bluetooth في الخلفية (overflow area): https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html

**لم نتمكن من التحقق منه:** نص صفحة `NEHotspotNetwork.fetchCurrent` الرسمية مباشرة (تعارض «أحد الشروط» مقابل «كل الشروط» في الصياغة المنقولة)؛ غياب واجهة مسح Wi-Fi وواجهة الخلية في iOS (استنتاج من غياب النتائج لا من نص صريح)؛ تفاصيل WWDC26 حول App Attest؛ أي أرقام دقة GPS داخلية — لا نذكر منها شيئًا وتُقاس في T-FIELD-01.
