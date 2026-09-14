# دليل التنصيب — GitHub ينفّذ النشر عنك

خوادم GitHub متصلة بالإنترنت وتستطيع الوصول إلى Supabase. أُعدّت ثلاثة
سيور عمل جاهزة تتولى التنصيب والنشر كاملًا.

**ما ستفعله:** تضيف ثلاثة مفاتيح مرة واحدة، وتضغط زر تشغيل.
**الوقت المتوقع: ٢٠ دقيقة.**

> الاستضافة على **GitHub Pages** — مجانية لأن المستودع عام، ولا تحتاج
> أي حساب إضافي. رابط البوابة سيكون:
> `https://oolong2006-ship-it.github.io/codex/`

---

## الخطوة ١ — أضف المفاتيح الثلاثة

المسار: **Settings ← Secrets and variables ← Actions ← New repository secret**

| اسم السر | من أين تنسخه |
|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase ← Project Settings ← API ← مفتاح **anon public** |
| `SUPABASE_DB_URL` | Supabase ← Project Settings ← Database ← Connection string ← تبويب **URI** |
| `SUPABASE_ACCESS_TOKEN` | `supabase.com/dashboard/account/tokens` ← Generate new token |

> ⚠️ **لا تستخدم `service_role`** في المفتاح الأول — المطلوب `anon public`.
>
> ⚠️ في `SUPABASE_DB_URL` استبدل `[YOUR-PASSWORD]` بكلمة مرور قاعدة البيانات
> الفعلية، وإلا فشل الاتصال.

المفاتيح تُخزَّن مشفّرة في GitHub ولا تظهر في أي سجل.

---

## الخطوة ٢ — شغّل تهيئة قاعدة البيانات

**Actions ← «تهيئة قاعدة البيانات والخدمة» ← Run workflow**

اختر الفرع `claude/alnadeg-procurement-portal-6urp3o` ثم **Run workflow**.

يقوم بالآتي في تشغيل واحد:

1. يفحص قاعدتك ويتوقف إن وجد تعارضًا (بلا أي تعديل).
2. يطبّق الجداول والصلاحيات والمواقع الـ27.
3. ينشر الواجهة البرمجية ويضبط النطاق المسموح.
4. يفحص صحة الخدمة.

**المطلوب في الملخص:** جدول من ١٢ بندًا كلها ✅ سليم، ثم «الخدمة تعمل».

**إن توقّف بتعارض أنواع:** الصق `00b-fix-column-types.sql` في Supabase
SQL Editor واضغط Run، ثم أعد تشغيل سير العمل. الإصلاح يحافظ على بياناتك.

---

## الخطوة ٣ — تأكّد من نشر الموقع

نشر الواجهة يبدأ تلقائيًا عند الدفع. تحقق في:
**Actions ← «نشر الواجهة — بوابة المشتريات»**

إن لم يكن قد عمل، شغّله يدويًا بنفس طريقة الخطوة ٢.

> **إن فشل برسالة `Branch is not allowed to deploy`:**
> Settings ← Environments ← `github-pages` ← Deployment branches،
> أضف `claude/alnadeg-procurement-portal-6urp3o`، ثم أعد التشغيل.

---

## الخطوة ٤ — فعّل حسابك

**هذه الخطوة خارج GitHub عمدًا.** المستودع عام وسجلات Actions فيه مكشوفة
للجميع؛ توليد رمز التفعيل هناك يعني إتاحته للعالم ٢٤ ساعة. لذلك يُولَّد
داخل حساب Supabase الخاص بك وحدك.

1. الصق `03-activation-link.sql` في Supabase ← SQL Editor ← **Run**
2. انسخ قيمة **«الرابط الكامل»** وافتحها في المتصفح
3. اختر كلمة مرورك: ١٢ حرفًا على الأقل بحروف كبيرة وصغيرة ورقم ورمز

**اكتب كلمة المرور داخل صفحة التفعيل فقط.**

---

## تم ✅

افتح `https://oolong2006-ship-it.github.io/codex/` وسجّل دخولك برقم جوالك
وكلمة المرور التي اخترتها.

### اختياري — تقرير اختبارات القبول

**Actions ← «اختبارات القبول» ← Run workflow**

يتطلب إضافة سر `SUPABASE_SERVICE_ROLE_KEY`. أسرار GitHub مشفّرة ولا تظهر
في السجلات، لكن المستودع عام — فأضفه فقط إن أردت هذا التقرير، ويمكنك
حذفه بعده. ينشئ مستخدمين تجريبيين ثم يحذفهم، ولا يمسّ بياناتك.

---

## الطريقة اليدوية — إن تعذّر استخدام Actions

الصق هذه الملفات في Supabase ← SQL Editor بالترتيب:

| الملف | الغرض |
|---|---|
| `00-preflight.sql` | فحص قراءة فقط ينتهي بحكم ✅/❌ |
| `00b-fix-column-types.sql` | يُشغَّل فقط عند ظهور ❌ |
| `01-database.sql` | التنصيب الكامل + تقرير تحقق من ١٢ بندًا |
| `03-activation-link.sql` | رابط التفعيل |

والخدمة تُنشر من: Supabase ← Edge Functions ← Deploy a new function ←
Via editor، بالاسم `procurement-portal`، بلصق `02-edge-function.ts`،
مع إضافة السر `ALLOWED_ORIGINS` بقيمة `https://oolong2006-ship-it.github.io`.

---

## جدول الأعطال

| ما تراه | السبب الغالب |
|---|---|
| «سر غير مضبوط» فور التشغيل | خطأ إملائي في اسم السر — راجع الجدول أعلاه |
| توقف عند الفحص بتعارض أنواع | شغّل `00b-fix-column-types.sql` |
| ❌ في جدول البنود الـ12 | أرسل الملخص؛ البند الفاشل يحدد السبب |
| `Branch is not allowed to deploy` | أضف الفرع في Settings ← Environments ← github-pages |
| الموقع يفتح لكن «تعذر الاتصال بالخادم» | أعد تشغيل التهيئة لضبط `ALLOWED_ORIGINS` |
| خطأ اتصال بقاعدة البيانات | `[YOUR-PASSWORD]` لم يُستبدل في `SUPABASE_DB_URL` |
| «رابط التفعيل غير صحيح» | الرمز نُسخ ناقصًا أو مضت ٢٤ ساعة — أعد الخطوة ٤ |

---

## ملاحظة

`01-database.sql` و `02-edge-function.ts` و `guide.html` **مُولَّدة آليًا**
من الكود المصدري. لإعادة بنائها بعد أي تعديل:

```bash
npm run build:deploy
node scripts/build-guide.mjs
```
