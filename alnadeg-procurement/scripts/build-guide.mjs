#!/usr/bin/env node
/**
 * يبني صفحة دليل التنصيب التفاعلية مع تضمين ملفات التنصيب نفسها،
 * حتى يتمكن المستخدم من نسخ كل ملف بضغطة دون فتح المستودع.
 *   node scripts/build-guide.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const file = (p) => readFileSync(p, "utf8");
const files = {
  preflight: file("deploy/00-preflight.sql"),
  fix: file("deploy/00b-fix-column-types.sql"),
  database: file("deploy/01-database.sql"),
  edge: file("deploy/02-edge-function.ts"),
  activation: file("deploy/03-activation-link.sql"),
  admin: file("deploy/04-first-admin.sql"),
};

for (const [k, v] of Object.entries(files)) {
  if (/<\/script/i.test(v)) throw new Error(`الملف ${k} يحتوي على </script> ويكسر التضمين`);
}

const embed = (id, content) =>
  `<script type="text/plain" id="file-${id}">${content}</script>`;

const html = `<title>تنصيب بوابة مشتريات الناضج</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&family=Readex+Pro:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{
  /* محايدات بميل أخضر خفيف — مشتقة من هوية النظام نفسه */
  --ground:#f6f5f1; --surface:#ffffff; --surface-2:#f0efe9;
  --ink:#16251c; --ink-2:#465247; --muted:#737e74;
  --line:#dcded6; --line-strong:#c3c7bc;
  --brand:#1f6543; --brand-deep:#123a27; --brand-soft:#e8f0ea;
  --gold:#a8822f; --gold-soft:#f5eeda;
  --ok:#1f6543; --ok-soft:#e8f0ea;
  --warn:#8a5a10; --warn-soft:#fbf0d9;
  --stop:#93321f; --stop-soft:#fae9e4;
  --shadow:0 1px 2px rgba(18,37,25,.05),0 2px 8px rgba(18,37,25,.06);
  --radius:14px;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#10170f; --surface:#171f16; --surface-2:#1d271c;
    --ink:#eef1e9; --ink-2:#c2cabe; --muted:#8e998d;
    --line:#2a352a; --line-strong:#3a463a;
    --brand:#6fb489; --brand-deep:#8fcaa4; --brand-soft:#1c2a20;
    --gold:#d9b869; --gold-soft:#2a2418;
    --ok:#6fb489; --ok-soft:#1c2a20;
    --warn:#d9b869; --warn-soft:#2a2418;
    --stop:#e79680; --stop-soft:#2e1d18;
    --shadow:0 1px 2px rgba(0,0,0,.3),0 2px 10px rgba(0,0,0,.25);
  }
}
:root[data-theme="dark"]{
  --ground:#10170f; --surface:#171f16; --surface-2:#1d271c;
  --ink:#eef1e9; --ink-2:#c2cabe; --muted:#8e998d;
  --line:#2a352a; --line-strong:#3a463a;
  --brand:#6fb489; --brand-deep:#8fcaa4; --brand-soft:#1c2a20;
  --gold:#d9b869; --gold-soft:#2a2418;
  --ok:#6fb489; --ok-soft:#1c2a20;
  --warn:#d9b869; --warn-soft:#2a2418;
  --stop:#e79680; --stop-soft:#2e1d18;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 2px 10px rgba(0,0,0,.25);
}

html{direction:rtl;}
*{box-sizing:border-box;}
body{
  background:var(--ground); color:var(--ink);
  font-family:"Cairo","Segoe UI",Tahoma,sans-serif;
  font-size:16px; line-height:1.75; margin:0;
}
h1,h2,h3{font-family:"Readex Pro","Cairo",sans-serif; text-wrap:balance; margin:0;}

.wrap{max-width:820px; margin:0 auto; padding-inline:20px; padding-block:0 72px;}

/* ── الرأس ── */
.top{
  position:sticky; top:0; z-index:20;
  background:color-mix(in srgb,var(--ground) 92%,transparent);
  backdrop-filter:blur(8px);
  border-bottom:1px solid var(--line);
}
.top-in{
  max-width:820px; margin:0 auto; padding:14px 20px;
  display:flex; align-items:center; gap:14px; flex-wrap:wrap;
}
.mark{
  width:40px; height:40px; flex:none; border-radius:11px;
  background:linear-gradient(145deg,var(--brand),var(--brand-deep));
  color:var(--gold-soft); display:grid; place-items:center;
  font-family:"Readex Pro",sans-serif; font-weight:700; font-size:20px;
}
.top h1{font-size:1rem; font-weight:600; line-height:1.3;}
.top p{margin:0; font-size:.78rem; color:var(--muted);}
.prog{margin-inline-start:auto; display:flex; align-items:center; gap:10px; font-size:.8rem;}
.bar{width:88px; height:6px; border-radius:99px; background:var(--surface-2); overflow:hidden;}
.bar i{display:block; height:100%; width:0; background:var(--brand); transition:width .35s ease;}
.prog b{font-variant-numeric:tabular-nums; font-weight:600; color:var(--ink-2);}

/* ── الافتتاحية ── */
.lede{padding-block:36px 8px;}
.lede h2{font-size:1.65rem; font-weight:700; letter-spacing:-.01em;}
.lede .sub{color:var(--ink-2); margin-top:10px; max-width:60ch;}

.facts{display:flex; flex-wrap:wrap; gap:8px; margin-top:20px;}
.fact{
  background:var(--surface); border:1px solid var(--line); border-radius:99px;
  padding:5px 13px; font-size:.8rem; color:var(--ink-2);
}
.fact b{color:var(--brand); font-weight:600; font-variant-numeric:tabular-nums;}

.need{
  margin-top:26px; background:var(--surface); border:1px solid var(--line);
  border-radius:var(--radius); padding:18px 20px; box-shadow:var(--shadow);
}
.need h3{font-size:.82rem; font-weight:600; color:var(--muted);
  letter-spacing:.07em; margin-bottom:12px;}
.need ul{margin:0; padding-inline-start:20px; display:grid; gap:7px; font-size:.92rem;}

/* ── الخطوات ── */
.steps{margin-top:44px; display:grid; gap:18px;}
.step{
  background:var(--surface); border:1px solid var(--line);
  border-radius:var(--radius); box-shadow:var(--shadow);
  display:grid; grid-template-columns:56px 1fr; overflow:hidden;
}
.rail{
  background:var(--surface-2); border-inline-end:1px solid var(--line);
  display:flex; flex-direction:column; align-items:center; padding-block:18px; gap:10px;
}
.num{
  width:30px; height:30px; border-radius:50%; flex:none;
  display:grid; place-items:center;
  font-family:"Readex Pro",sans-serif; font-weight:600; font-size:.88rem;
  background:var(--surface); color:var(--ink-2);
  border:1px solid var(--line-strong); font-variant-numeric:tabular-nums;
}
.step.done .num{background:var(--brand); border-color:var(--brand); color:#fff;}
.step.done .rail{background:var(--brand-soft);}
.body{padding:18px 20px 22px;}
.head{display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;}
.head h3{font-size:1.1rem; font-weight:600;}
.time{
  font-size:.72rem; color:var(--muted); background:var(--surface-2);
  border-radius:99px; padding:2px 9px; white-space:nowrap;
}
.body p{margin:12px 0 0; color:var(--ink-2); font-size:.95rem;}
.body ol{margin:12px 0 0; padding-inline-start:20px; display:grid; gap:8px; font-size:.95rem; color:var(--ink-2);}
.body ol b, .body p b{color:var(--ink); font-weight:600;}

kbd{
  font-family:"Cairo",sans-serif; font-size:.85em; font-weight:600;
  background:var(--surface-2); border:1px solid var(--line-strong);
  border-radius:6px; padding:1px 7px; color:var(--ink); white-space:nowrap;
}
code{
  font-family:"IBM Plex Mono",monospace; font-size:.86em; direction:ltr;
  background:var(--surface-2); border-radius:5px; padding:1px 6px;
  unicode-bidi:embed; display:inline-block;
}

.copy{
  margin-top:16px; display:inline-flex; align-items:center; gap:9px;
  background:var(--brand); color:#fff; border:0; border-radius:10px;
  padding:11px 18px; font-family:"Cairo",sans-serif; font-size:.92rem;
  font-weight:600; cursor:pointer; transition:background .18s;
}
.copy:hover{background:var(--brand-deep);}
:root[data-theme="dark"] .copy, :root:not([data-theme="light"]) .copy{color:#0e1a12;}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]) .copy{color:#fff;}}
.copy:focus-visible{outline:2px solid var(--gold); outline-offset:3px;}
.copy .sz{font-size:.76rem; opacity:.75; font-variant-numeric:tabular-nums;}

/* ── لوحات الحالة ── */
.note{
  margin-top:16px; border-radius:11px; padding:13px 16px;
  font-size:.9rem; border:1px solid;
}
.note b{display:block; margin-bottom:3px; font-weight:600;}
.note.ok{background:var(--ok-soft); border-color:var(--ok); color:var(--ink);}
.note.warn{background:var(--warn-soft); border-color:var(--warn); color:var(--ink);}
.note.stop{background:var(--stop-soft); border-color:var(--stop); color:var(--ink);}

/* ── الجداول ── */
.tw{margin-top:16px; overflow-x:auto; border:1px solid var(--line); border-radius:11px;}
table{border-collapse:collapse; width:100%; font-size:.88rem; min-width:340px;}
th,td{text-align:right; padding:10px 14px; border-bottom:1px solid var(--line);}
th{background:var(--surface-2); font-weight:600; font-size:.8rem; color:var(--ink-2); white-space:nowrap;}
tr:last-child td{border-bottom:0;}
td code{font-size:.82em;}

/* ── الإنجاز ── */
.mark-done{
  margin-top:18px; padding-top:16px; border-top:1px dashed var(--line-strong);
  display:flex; align-items:center; gap:10px;
}
.mark-done label{display:flex; align-items:center; gap:9px; cursor:pointer;
  font-size:.9rem; color:var(--ink-2); user-select:none;}
.mark-done input{width:19px; height:19px; accent-color:var(--brand); cursor:pointer; margin:0;}

/* ── الخاتمة ── */
.finish{
  margin-top:34px; background:linear-gradient(150deg,var(--brand-deep),var(--brand));
  border-radius:var(--radius); padding:30px 26px; color:#f2f7f3;
}
.finish h2{font-size:1.3rem; color:#fff; font-weight:700;}
.finish p{color:#d5e6db; margin:12px 0 0; font-size:.95rem;}
.finish .chips{display:flex; gap:8px; flex-wrap:wrap; margin-top:18px;}
.finish .chips span{
  background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18);
  border-radius:99px; padding:5px 13px; font-size:.82rem;
}

.trouble{margin-top:34px;}
.trouble h2{font-size:1.15rem; font-weight:600;}

footer{
  margin-top:40px; padding-top:20px; border-top:1px solid var(--line);
  font-size:.8rem; color:var(--muted);
}

@media (max-width:560px){
  .step{grid-template-columns:1fr;}
  .rail{flex-direction:row; justify-content:flex-start; padding:10px 16px;
    border-inline-end:0; border-bottom:1px solid var(--line);}
  .lede h2{font-size:1.4rem;}
  .prog{margin-inline-start:0;}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;}}
</style>

<header class="top">
  <div class="top-in">
    <span class="mark">ن</span>
    <div>
      <h1>تنصيب بوابة مشتريات الناضج</h1>
      <p>ثلاث خطوات — بلا مفاتيح وبلا طرفية</p>
    </div>
    <div class="prog">
      <span class="bar"><i id="bar"></i></span>
      <b><span id="count">0</span>‏/3</b>
    </div>
  </div>
</header>

<div class="wrap">

  <section class="lede">
    <h2>ثلاث خطوات، ولا مفتاح واحد</h2>
    <p class="sub">
      أعدت تصميم المسار ليزيل كل ما يتطلب مفاتيح أو أدوات: لا أسرار في
      GitHub، ولا رمز وصول، ولا Edge Function، ولا طرفية. نقرة واحدة منك
      لتفعيل الاستضافة، ثم لصقتان داخل حسابك على Supabase. هذه الصفحة
      تحفظ تقدّمك، فأغلقها وعُد إليها متى شئت.
    </p>

    <div class="facts">
      <span class="fact"><b>27</b> موقعًا</span>
      <span class="fact"><b>21</b> فرعًا و<b>6</b> مواقع مركزية</span>
      <span class="fact"><b>5</b> مراحل اعتماد</span>
      <span class="fact"><b>7</b> أدوار وظيفية</span>
      <span class="fact">التكلفة <b>صفر</b></span>
      <span class="fact">الاستضافة <b>GitHub Pages</b></span>
    </div>

    <div class="need">
      <h3>قبل أن تبدأ</h3>
      <ul>
        <li>حسابك في <b>Supabase</b> ومشروع <code>alnadeg-procurement</code> مفتوح أمامك.</li>
        <li>مستودعك على GitHub: <code>oolong2006-ship-it/codex</code> — لا تحتاج حسابًا جديدًا.</li>
        <li>نحو <b>١٢ دقيقة</b> دون مقاطعة.</li>
      </ul>
    </div>
  </section>

  <div class="steps">

    <!-- 1 -->
    <section class="step" data-step="1">
      <div class="rail"><span class="num">١</span></div>
      <div class="body">
        <div class="head"><h3>فعّل الاستضافة</h3><span class="time">نقرة واحدة</span></div>
        <p>
          هذه الخطوة الوحيدة التي لا أستطيع تنفيذها عنك: إنشاء موقع
          GitHub Pages أول مرة محصور بمالك المستودع — قيد من GitHub نفسه.
          كل ما عداها جاهز ومختبَر.
        </p>
        <ol>
          <li>افتح <kbd>Settings</kbd> ← <kbd>Pages</kbd> في مستودعك.</li>
          <li>تحت <b>Source</b> اختر <b>GitHub Actions</b>.</li>
          <li>لا حفظ ولا إعداد آخر — هذا كل شيء.</li>
        </ol>

        <div class="note ok">
          <b>ثم أخبرني «تم»</b>
          وأشغّل النشر بنفسي وأرسل لك رابط بوابتك. لن تحتاج فعل شيء آخر هنا.
        </div>
        <div class="note warn">
          <b>إن فشل النشر برسالة «Branch is not allowed to deploy»</b>
          افتح <kbd>Settings</kbd> ← <kbd>Environments</kbd> ← <kbd>github-pages</kbd>
          ← <b>Deployment branches</b>، وأضف الفرع
          <code>claude/alnadeg-procurement-portal-6urp3o</code>.
        </div>

        <div class="mark-done"><label><input type="checkbox" id="s1"> فعّلت الاستضافة</label></div>
      </div>
    </section>

    <!-- 2 -->
    <section class="step" data-step="2">
      <div class="rail"><span class="num">٢</span></div>
      <div class="body">
        <div class="head"><h3>جهّز قاعدة البيانات</h3><span class="time">٦ دقائق</span></div>
        <p>
          في Supabase ← <kbd>SQL Editor</kbd> ← <kbd>New query</kbd>. الصق كل ملف
          واضغط <kbd>Run</kbd>. لا يحتوي أي منها أمر حذف، ويمكن تشغيلها أكثر من مرة.
        </p>

        <p><b>أ · افحص قاعدتك</b> — قراءة فقط، ينتهي بحكم ✅ أو ❌:</p>
        <button class="copy" data-file="preflight">نسخ ملف الفحص <span class="sz"></span></button>
        <div class="note warn">
          <b>إن ظهر ❌</b>
          شغّل ملف الإصلاح ثم أعد الفحص. يحافظ على كل بياناتك.
        </div>
        <button class="copy" data-file="fix">نسخ ملف الإصلاح <span class="sz"></span></button>

        <p style="margin-top:18px"><b>ب · نصّب النظام</b> — ينتهي بجدول من ١٢ بندًا يجب أن تكون كلها ✅:</p>
        <button class="copy" data-file="database">نسخ ملف قاعدة البيانات <span class="sz"></span></button>

        <div class="note stop">
          <b>إن ظهر أي ❌ في الجدول</b>
          توقّف وأرسل لي صورته. البند الفاشل يحدد السبب بدقة.
        </div>

        <div class="mark-done"><label><input type="checkbox" id="s2"> البنود الـ12 كلها سليمة</label></div>
      </div>
    </section>

    <!-- 3 -->
    <section class="step" data-step="3">
      <div class="rail"><span class="num">٣</span></div>
      <div class="body">
        <div class="head"><h3>أنشئ حسابك وادخل</h3><span class="time">٤ دقائق</span></div>

        <p><b>أ · أنشئ الحساب من لوحة Supabase</b></p>
        <ol>
          <li><kbd>Authentication</kbd> ← <kbd>Users</kbd> ← <kbd>Add user</kbd>
            ← <kbd>Create new user</kbd></li>
          <li>البريد: <code>966559847714@phone.alnadeg.local</code></li>
          <li>كلمة المرور: اخترها أنت — ١٢ حرفًا فأكثر بحروف كبيرة وصغيرة ورقم ورمز</li>
          <li><b>فعّل <span dir="ltr">Auto Confirm User</span></b> ← مهم، وإلا تعذّر الدخول</li>
        </ol>

        <div class="note stop">
          <b>كلمة المرور لك وحدك</b>
          اكتبها في لوحة Supabase فقط. لا ترسلها لي ولا لأحد.
        </div>

        <p style="margin-top:18px"><b>ب · رقّ الحساب إلى مدير نظام</b> — في SQL Editor:</p>
        <button class="copy" data-file="admin">نسخ ملف الترقية <span class="sz"></span></button>
        <div class="note ok">
          <b>النتيجة المتوقعة</b>
          سطر يقول: <span dir="ltr">✅ جاهز لتسجيل الدخول</span>. إن قال
          «فعّل Auto Confirm» فارجع للوحة المستخدمين وأكّد الحساب.
        </div>

        <p style="margin-top:18px"><b>ج · افتح بوابتك</b></p>
        <p>
          عند أول فتح ستظهر <b>شاشة ربط</b>. الصق فيها القيمتين من
          Supabase ← <kbd>Project Settings</kbd> ← <kbd>API</kbd>:
          <b>Project URL</b> ومفتاح <b>anon public</b>. البوابة تتحقق من
          المفتاح قبل قبوله، وترفض المفتاح السرّي إن أخطأت.
        </p>
        <p>ثم سجّل دخولك برقم جوالك وكلمة المرور التي اخترتها.</p>

        <div class="mark-done"><label><input type="checkbox" id="s3"> دخلت البوابة</label></div>
      </div>
    </section>
  </div>

  <section class="finish">
    <h2>وبعد؟</h2>
    <p>
      افتح <code>https://oolong2006-ship-it.github.io/codex/</code> وسجّل دخولك
      برقم جوالك <b>0559847714</b> وكلمة المرور التي اخترتها. يجب أن ترى لوحة
      المتابعة والمواقع الـ27 وبوابة الأدمن كاملة.
    </p>
    <div class="chips">
      <span>إدارة المستخدمين ← إضافة مستخدم</span>
      <span>كلمة مرور مؤقتة تظهر مرة واحدة</span>
      <span>طلب شراء جديد ← أرفق الفاتورة ← أرسل</span>
      <span>Edge Function تُنشر لاحقًا لإنشاء بقية المستخدمين</span>
    </div>
  </section>

  <section class="trouble">
    <h2>إن تعثّرت</h2>
    <p style="color:var(--ink-2);font-size:.93rem;margin-top:10px">
      أرسل لي صورة الشاشة أو نص الخطأ. هذه أكثر الأعطال شيوعًا:
    </p>
    <div class="tw"><table>
      <tr><th>ما تراه</th><th>السبب الغالب</th></tr>
      <tr><td>سير العمل يفشل فورًا برسالة «سر غير مضبوط»</td><td>راجع أسماء الأسرار في الخطوة ١ — حرف واحد يكفي لتخطئها</td></tr>
      <tr><td>الفحص يتوقف بتعارض أنواع</td><td>شغّل ملف الإصلاح في الخطوة ٢</td></tr>
      <tr><td>❌ في جدول البنود الـ12</td><td>أرسل الملخص؛ البند الفاشل يحدد السبب</td></tr>
      <tr><td>«Branch is not allowed to deploy»</td><td>أضف الفرع في <kbd>Settings</kbd> ← <kbd>Environments</kbd> ← <kbd>github-pages</kbd></td></tr>
      <tr><td>الموقع يفتح لكن «تعذر الاتصال بالخادم»</td><td>أعد تشغيل «تهيئة قاعدة البيانات» لضبط <code>ALLOWED_ORIGINS</code></td></tr>
      <tr><td>خطأ اتصال بقاعدة البيانات</td><td><code>[YOUR-PASSWORD]</code> لم يُستبدل في <code>SUPABASE_DB_URL</code></td></tr>
      <tr><td>«رابط التفعيل غير صحيح»</td><td>الرمز نُسخ ناقصًا أو مضت ٢٤ ساعة — أعد الخطوة ٥</td></tr>
      <tr><td>«رقم الجوال أو كلمة المرور غير صحيحة»</td><td>جرّب الصيغة المحلية <code>0559847714</code></td></tr>
    </table></div>
  </section>

  <section class="trouble">
    <h2>الطريقة اليدوية — إن تعذّر استخدام Actions</h2>
    <p style="color:var(--ink-2);font-size:.93rem;margin-top:10px">
      يمكنك تنفيذ كل شيء بنفسك عبر Supabase ← <kbd>SQL Editor</kbd>: الصق كل
      ملف واضغط <kbd>Run</kbd> بالترتيب. النتيجة مطابقة تمامًا لما تفعله سيور العمل.
    </p>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px">
      <button class="copy" data-file="preflight">١ · ملف الفحص <span class="sz"></span></button>
      <button class="copy" data-file="database">٢ · قاعدة البيانات <span class="sz"></span></button>
    </div>
    <p style="color:var(--ink-2);font-size:.93rem;margin-top:14px">
      أما الخدمة فتُنشر من Supabase ← <kbd>Edge Functions</kbd> ←
      <kbd>Deploy a new function</kbd> ← <kbd>Via editor</kbd>، بالاسم
      <code>procurement-portal</code>، مع إضافة السر <code>ALLOWED_ORIGINS</code>
      بقيمة <code>https://oolong2006-ship-it.github.io</code>.
    </p>
    <button class="copy" data-file="edge">٣ · ملف الخدمة <span class="sz"></span></button>
  </section>

  <footer>
    ملفات التنصيب المضمّنة هنا مطابقة تمامًا لما في المستودع على الفرع
    <code>claude/alnadeg-procurement-portal-6urp3o</code>، ومُولَّدة من الكود المصدري نفسه.
  </footer>
</div>

${embed("preflight", files.preflight)}
${embed("fix", files.fix)}
${embed("database", files.database)}
${embed("edge", files.edge)}
${embed("activation", files.activation)}
${embed("admin", files.admin)}

<script>
(function(){
  var KEY="alnadeg-install-progress-v3";

  function load(){
    try{ return JSON.parse(localStorage.getItem(KEY)||"{}"); }catch(e){ return {}; }
  }
  function save(s){ try{ localStorage.setItem(KEY,JSON.stringify(s)); }catch(e){} }

  var state=load();

  function paint(){
    var n=0;
    for(var i=1;i<=3;i++){
      var box=document.getElementById("s"+i);
      var step=document.querySelector('.step[data-step="'+i+'"]');
      var on=!!state["s"+i];
      if(box) box.checked=on;
      if(step) step.classList.toggle("done",on);
      if(on) n++;
    }
    document.getElementById("count").textContent=String(n);
    document.getElementById("bar").style.width=(n/3*100)+"%";
  }

  for(var i=1;i<=3;i++){
    (function(k){
      var box=document.getElementById("s"+k);
      if(!box) return;
      box.addEventListener("change",function(){
        state["s"+k]=box.checked; save(state); paint();
      });
    })(i);
  }
  paint();

  // أزرار النسخ — تعرض حجم كل ملف وتؤكد النسخ
  function size(t){
    var kb=new Blob([t]).size/1024;
    return kb<1000 ? Math.round(kb)+" كيلوبايت" : (kb/1024).toFixed(1)+" ميجابايت";
  }

  Array.prototype.forEach.call(document.querySelectorAll(".copy"),function(btn){
    var el=document.getElementById("file-"+btn.dataset.file);
    if(!el) return;
    var text=el.textContent;
    var szEl=btn.querySelector(".sz");
    if(szEl) szEl.textContent="· "+size(text);
    var label=btn.childNodes[0].nodeValue;

    btn.addEventListener("click",function(){
      function done(ok){
        btn.childNodes[0].nodeValue = ok ? "تم النسخ ✓ " : "تعذر النسخ — حدّد يدويًا ";
        setTimeout(function(){ btn.childNodes[0].nodeValue=label; },2200);
      }
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(function(){done(true);},function(){done(false);});
      } else {
        try{
          var ta=document.createElement("textarea");
          ta.value=text; ta.setAttribute("readonly","");
          ta.style.position="fixed"; ta.style.opacity="0";
          document.body.appendChild(ta); ta.select();
          var ok=document.execCommand("copy");
          document.body.removeChild(ta); done(ok);
        }catch(e){ done(false); }
      }
    });
  });
})();
</script>`;

writeFileSync("deploy/guide.html", html);
console.log(`✅ تم بناء deploy/guide.html (${(Buffer.byteLength(html)/1024).toFixed(0)} كيلوبايت)`);
