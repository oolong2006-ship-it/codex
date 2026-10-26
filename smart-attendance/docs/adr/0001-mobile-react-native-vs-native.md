# ADR-0001: تطبيق الجوال — React Native (Expo dev build) مقابل Native كامل

- **الحالة:** مقترح — بانتظار الاعتماد البشري
- **التاريخ:** 2026-10-26
- **السياق المرجعي:** CLAUDE.md §3 (Mobile)، specs §C و§D

## السياق

CLAUDE.md يقرر React Native (Expo dev build) مع وحدات أصلية، ويسمح بالتحويل إلى Native كامل بـ ADR «إذا تعذر أمن الوحدات الأصلية». المطلوب من المرحلة 0: التحقق من توفر مكتبات أو وحدات لـ App Attest وDeviceCheck وPlay Integrity وKey Attestation وصيانتها.

### ما يحتاجه المنتج من الجوال (specs §C، §D)

| القدرة | iOS | Android |
|---|---|---|
| مفتاح مرتبط بالعتاد + شهادة عند الربط | App Attest `attestKey` | Keystore key + Key Attestation (سلسلة شهادات) |
| توقيع كل بصمة على `SHA256(nonce ‖ canonical_json(body))` | App Attest `generateAssertion` | توقيع Keystore + Play Integrity token |
| سلامة الجهاز | (ضمن App Attest) | Play Integrity verdict (`MEETS_DEVICE_INTEGRITY`) |
| إشارة تبقى بعد إعادة التثبيت | DeviceCheck — بتّان لكل جهاز | hash `ANDROID_ID`؛ اختياريًا Play Integrity device recall |
| موقع + `isMock` + دقة | Core Location | Fused Location (`isMock`) |

## الأدلة (تحقق 2026-10-26)

> منهج: محرك البحث مقيدًا بالنطاقات الرسمية؛ الجلب المباشر و npm/GitHub API ممنوعان في بيئة التنفيذ، لذلك **لم نتحقق من أرقام التنزيل وتواريخ الإصدارات والقضايا المفتوحة**. هذا ناقص ويُستكمل في Spike المرحلة 1.

1. **`@expo/app-integrity` (رسمية من Expo)** — https://docs.expo.dev/versions/latest/sdk/app-integrity/
   - توفر Play Integrity API (تدفق Standard request عبر `prepareIntegrityTokenProviderAsync(cloudProjectNumber)`) على Android، وApp Attest على iOS (مفتاح عتادي، attest مرة واحدة، ثم assertions).
   - **Alpha**: التوثيق ينص أنها «changes significantly and frequently».
   - أُعلنت مع Expo SDK 54 (مدونة Expo: https://expo.dev/blog/expo-app-integrity)، وتظهر في توثيق SDK 57.
   - لا تعمل في Expo Go ولا على المحاكيات — تتطلب dev build على جهاز حقيقي (متوافق مع قرار «Expo dev build»).
   - التحقق على الخادم مسؤوليتنا (nonce وفحص الشهادات والعداد).
   - **لم نجد** فيها DeviceCheck (البتّان) ولا Android Key Attestation.
2. **Apple DeviceCheck** — https://developer.apple.com/documentation/devicecheck/accessing-and-modifying-per-device-data
   - بتّان لكل جهاز على خادم Apple، تبقى بعد إعادة التثبيت (WWDC21: https://developer.apple.com/videos/play/wwdc2021/10244/).
   - اتفاقية المطور تمنع اعتبارها نقطة البيانات الوحيدة (الجهاز قد يُباع) — متسق مع specs §C «لا معرف جهاز وحده إثبات».
   - على الجوال يكفي `DCDevice.current.generateToken()` — دالة واحدة يسهل كتابتها في وحدة Expo.
3. **Play Integrity device recall** — https://developer.android.com/google/play/integrity/device-recall
   - **Beta**، يتطلب نموذج اهتمام؛ 3 بتات لكل جهاز، مشتركة بين كل تطبيقات حساب المطور؛ لا يعمل على المحاكيات؛ **يُمنع استخدامه لعمل fingerprint أو تتبع المستخدمين**.
   - القرار: لا نعتمد عليه في الـ MVP (R-T3).
4. **Android Key Attestation** — لا توجد حزمة رسمية من Expo. حزم مجتمعية وُجدت:
   - `@pagopa/io-react-native-integrity` (تولّد مفتاحًا مع سلسلة شهادات؛ آخر بيانات npm ظاهرة ~523 يومًا — **صيانة غير مؤكدة**)
   - `react-native-device-binding` (حديثة ومحدودة الانتشار)
   - `@baudtech/react-native-device-attest` (App Attest + Play Integrity عبر Nitro Modules، **دون** Key Attestation)
5. **`@react-native-firebase/app-check`** — يدعم DeviceCheck/App Attest/Play Integrity لكن عبر Firebase App Check: الخادم يتحقق من رمز Firebase لا من الشهادة الخام، ويمر الطلب عبر خدمة Google خارج المملكة. **مرفوض**: يخالف «الخادم صاحب القرار بأدلته» ويضيف معالجًا فرعيًا خارجيًا (R-L3).

## الخيارات

| | A. RN/Expo + `@expo/app-integrity` + وحدة Expo داخلية صغيرة | B. RN/Expo + وحدات أصلية داخلية بالكامل | C. Native كامل (Swift + Kotlin) |
|---|---|---|---|
| App Attest | الحزمة الرسمية | داخلي | أصلي |
| Play Integrity | الحزمة الرسمية | داخلي | أصلي |
| DeviceCheck | وحدة داخلية (دالة واحدة) | داخلي | أصلي |
| Key Attestation | وحدة داخلية (Kotlin) | داخلي | أصلي |
| لغة واحدة للفريق | نعم (TS + ~2 ملفات أصلية) | نعم (TS + أصلي أكثر) | لا — قاعدتا كود |
| خطر alpha | موجود (R-T1) | لا | لا |
| الجهد | الأقل | متوسط | الأعلى (×2 للشاشات) |

لا توجد قدرة أمنية مطلوبة **تتعذر** في RN: كل واجهات النظام المطلوبة تُستدعى من وحدة Expo أصلية، والمفاتيح لا تغادر Secure Enclave/Keystore في أي خيار. الأمن الحقيقي على الخادم (CLAUDE.md §5.1) وهو مستقل عن إطار الواجهة.

## القرار

**تأكيد React Native (Expo dev build) — الخيار A مع B كمسار رجوع**:

1. واجهة TypeScript داخلية `AttestationClient` في `apps/mobile` (لا تستورد الشاشات أي حزمة attestation مباشرة).
2. تنفيذها الأول: `@expo/app-integrity` لـ App Attest وPlay Integrity، بإصدار مثبت.
3. وحدة Expo داخلية `expo-device-trust` (Swift + Kotlin) لـ: DeviceCheck `generateToken`، وKeystore key + Key Attestation chain، وتوقيع Keystore للبصمة، وhash `ANDROID_ID`.
4. إذا كسر تحديث alpha شيئًا أو هُجرت الحزمة: ننقل App Attest/Play Integrity إلى `expo-device-trust` (الخيار B) دون تغيير الشاشات.
5. **لا** Firebase App Check.

### شروط التحويل إلى Native كامل (يتطلب ADR جديد)
- تعذر تشغيل Key Attestation أو App Attest من وحدة Expo على جهاز حقيقي، أو
- p95 لزمن البصمة على الجهاز (من الضغط إلى إرسال الطلب) يتجاوز ميزانية لا يمكن تحسينها بسبب الجسر، أو
- متطلب أمني من اختبار الاختراق لا يمكن تلبيته في RN.

## Spike مطلوب في بداية المرحلة 1 (معايير قبول هذا الـ ADR)

- [ ] جهاز iOS حقيقي: attestKey + assertion يتحقق منها خادم تجريبي (فحص السلسلة، و nonce، والعداد المتزايد).
- [ ] جهاز Android حقيقي: Key Attestation chain يتحقق منها الخادم (challenge = nonce) + Play Integrity standard token بـ requestHash.
- [ ] DeviceCheck token → `query_two_bits` من الخادم في بيئة development.
- [ ] تسجيل: إصدار كل حزمة، وتاريخ آخر إصدار، وعدد القضايا المفتوحة، والترخيص — (ما تعذر في المرحلة 0).

## العواقب

- (+) قاعدة كود واحدة للشاشات، ولغة واحدة للفريق (متسق مع CLAUDE.md §3).
- (+) لا اعتماد على خدمة وسيطة لقرار الثقة.
- (−) نتحمل صيانة وحدة أصلية صغيرة (Swift/Kotlin) — نحتاج شخصًا يقرؤها في الفريق.
- (−) خطر alpha في `@expo/app-integrity` (R-T1) مخفف بالواجهة الداخلية.
