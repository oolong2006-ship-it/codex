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
      <p>خمس خطوات في المتصفح — بلا أوامر</p>
    </div>
    <div class="prog">
      <span class="bar"><i id="bar"></i></span>
      <b><span id="count">0</span>‏/5</b>
    </div>
  </div>
</header>

<div class="wrap">

  <section class="lede">
    <h2>كل ما تحتاجه: متصفح، ونسخ ولصق</h2>
    <p class="sub">
      لن تكتب أمرًا واحدًا ولن تثبّت أي برنامج. في كل خطوة تضغط زر النسخ هنا،
      وتلصق في الصفحة المذكورة، وتضغط زر التشغيل. هذه الصفحة تحفظ تقدّمك،
      فيمكنك إغلاقها والعودة إليها.
    </p>

    <div class="facts">
      <span class="fact"><b>27</b> موقعًا</span>
      <span class="fact"><b>21</b> فرعًا و<b>6</b> مواقع مركزية</span>
      <span class="fact"><b>5</b> مراحل اعتماد</span>
      <span class="fact"><b>7</b> أدوار وظيفية</span>
      <span class="fact">التكلفة <b>صفر</b></span>
    </div>

    <div class="need">
      <h3>قبل أن تبدأ</h3>
      <ul>
        <li>حسابك في <b>Supabase</b> ومشروع <code>alnadeg-procurement</code> مفتوح أمامك.</li>
        <li>حساب مجاني في <b>Vercel</b> — يمكن إنشاؤه بحساب GitHub في دقيقة.</li>
        <li>نحو <b>٣٠ دقيقة</b> دون مقاطعة.</li>
      </ul>
    </div>
  </section>

  <div class="steps">

    <!-- 1 -->
    <section class="step" data-step="1">
      <div class="rail"><span class="num">١</span></div>
      <div class="body">
        <div class="head"><h3>الفحص</h3><span class="time">٣ دقائق</span></div>
        <p>
          قاعدتك تحتوي جداول قائمة. هذا الملف <b>يقرأ فقط ولا يغيّر شيئًا</b>،
          ويخبرك إن كانت جاهزة للترقية المباشرة.
        </p>
        <ol>
          <li>في Supabase افتح <kbd>SQL Editor</kbd> ثم <kbd>New query</kbd>.</li>
          <li>اضغط زر النسخ أدناه، والصق في المحرر.</li>
          <li>اضغط <kbd>Run</kbd> واقرأ <b>السطر الأول</b> من النتيجة.</li>
        </ol>
        <button class="copy" data-file="preflight">نسخ ملف الفحص <span class="sz"></span></button>

        <div class="note ok">
          <b>إن ظهر ✅ نعم</b>
          انتقل مباشرة إلى الخطوة الثانية.
        </div>
        <div class="note warn">
          <b>إن ظهر ❌ لا</b>
          قاعدتك تستخدم أنواعًا مخصصة قديمة. انسخ ملف الإصلاح أدناه وشغّله
          بنفس الطريقة، ثم أعد تشغيل ملف الفحص. الإصلاح يحافظ على كل بياناتك.
        </div>
        <button class="copy" data-file="fix">نسخ ملف الإصلاح <span class="sz"></span></button>

        <div class="note stop">
          <b>إن بقي ❌ بعد الإصلاح</b>
          توقّف وأرسل لي صورة النتيجة. لا تشغّل الخطوة الثانية.
        </div>

        <div class="mark-done"><label><input type="checkbox" id="s1"> أنجزت هذه الخطوة</label></div>
      </div>
    </section>

    <!-- 2 -->
    <section class="step" data-step="2">
      <div class="rail"><span class="num">٢</span></div>
      <div class="body">
        <div class="head"><h3>قاعدة البيانات</h3><span class="time">٥ دقائق</span></div>
        <p>
          ينشئ الجداول والصلاحيات ويضيف المواقع الـ27. لا يحتوي أمر حذف واحد،
          ويمكن تشغيله أكثر من مرة دون ضرر.
        </p>
        <ol>
          <li><kbd>SQL Editor</kbd> ← <kbd>New query</kbd>.</li>
          <li>الصق الملف واضغط <kbd>Run</kbd>، وانتظر نحو ٣٠ ثانية.</li>
          <li>ستظهر في النهاية <b>قائمة من ١٢ بندًا</b>.</li>
        </ol>
        <button class="copy" data-file="database">نسخ ملف قاعدة البيانات <span class="sz"></span></button>

        <div class="note ok">
          <b>المطلوب</b>
          أن تكون البنود الاثنا عشر كلها ✅ سليم.
        </div>
        <div class="note stop">
          <b>إن ظهر أي ❌</b>
          أرسل لي صورة الجدول — البند الفاشل يحدد السبب بدقة.
        </div>

        <div class="mark-done"><label><input type="checkbox" id="s2"> أنجزت هذه الخطوة</label></div>
      </div>
    </section>

    <!-- 3 -->
    <section class="step" data-step="3">
      <div class="rail"><span class="num">٣</span></div>
      <div class="body">
        <div class="head"><h3>نشر الواجهة</h3><span class="time">١٠ دقائق</span></div>
        <p>أولًا انسخ مفتاحين من Supabase: <kbd>Project Settings</kbd> ← <kbd>API</kbd></p>

        <div class="tw"><table>
          <tr><th>في صفحة Supabase</th><th>ستضعه في Vercel باسم</th></tr>
          <tr><td>Project URL</td><td><code>NEXT_PUBLIC_SUPABASE_URL</code></td></tr>
          <tr><td>مفتاح <code>anon</code> <code>public</code></td><td><code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code></td></tr>
        </table></div>

        <div class="note stop">
          <b>لا تنسخ مفتاح <code>service_role</code></b>
          مفتاح <code>anon</code> هو المطلوب، وهو آمن للنشر العلني لأن سياسات
          الحماية داخل قاعدة البيانات هي التي تحرس البيانات.
        </div>

        <p>ثم في <b>vercel.com</b>: سجّل بحساب GitHub ← <kbd>Add New</kbd> ← <kbd>Project</kbd>
          ← اختر مستودع <code>oolong2006-ship-it/codex</code> ← <kbd>Import</kbd>.</p>

        <div class="tw"><table>
          <tr><th>الحقل</th><th>القيمة</th></tr>
          <tr><td>Root Directory</td><td><code>alnadeg-procurement</code></td></tr>
          <tr><td>Branch</td><td><code>claude/alnadeg-procurement-portal-6urp3o</code></td></tr>
          <tr><td>Environment Variables</td><td>المفتاحان أعلاه</td></tr>
        </table></div>

        <div class="note warn">
          <b>أكثر خطأ شائع</b>
          نسيان تغيير <code>Root Directory</code>. اضغط <kbd>Edit</kbd> بجانبه
          واكتب <code>alnadeg-procurement</code>، وإلا ستظهر صفحة بيضاء.
        </div>

        <p>اضغط <kbd>Deploy</kbd>، وبعد دقيقتين ستحصل على رابط مثل
          <code>https://codex-xxxx.vercel.app</code> — <b>احفظه، ستحتاجه مرتين.</b></p>

        <div class="mark-done"><label><input type="checkbox" id="s3"> أنجزت هذه الخطوة</label></div>
      </div>
    </section>

    <!-- 4 -->
    <section class="step" data-step="4">
      <div class="rail"><span class="num">٤</span></div>
      <div class="body">
        <div class="head"><h3>الواجهة البرمجية</h3><span class="time">٥ دقائق</span></div>
        <p>
          هذه الخدمة تتولى التفعيل وإنشاء المستخدمين وروابط المرفقات المؤقتة.
        </p>
        <ol>
          <li>في Supabase: <kbd>Edge Functions</kbd> ← <kbd>Deploy a new function</kbd> ← <kbd>Via editor</kbd>.</li>
          <li>الاسم بالضبط: <code>procurement-portal</code></li>
          <li>امسح الكود الافتراضي والصق الملف، ثم <kbd>Deploy</kbd>.</li>
        </ol>
        <button class="copy" data-file="edge">نسخ ملف الواجهة البرمجية <span class="sz"></span></button>

        <p>ثم اضبط النطاق المسموح: <kbd>Edge Functions</kbd> ← <kbd>Secrets</kbd> ← أضف:</p>
        <div class="tw"><table>
          <tr><th>الاسم</th><th>القيمة</th></tr>
          <tr><td><code>ALLOWED_ORIGINS</code></td><td>رابط Vercel من الخطوة ٣ — بلا <code>/</code> في آخره</td></tr>
        </table></div>

        <div class="note warn">
          <b>إن لم تجد خيار «Via editor»</b>
          هذه الخطوة وحدها ستحتاج طرفية. أرسل لي صورة الشاشة وسأعطيك البديل.
        </div>

        <div class="mark-done"><label><input type="checkbox" id="s4"> أنجزت هذه الخطوة</label></div>
      </div>
    </section>

    <!-- 5 -->
    <section class="step" data-step="5">
      <div class="rail"><span class="num">٥</span></div>
      <div class="body">
        <div class="head"><h3>تفعيل حسابك</h3><span class="time">دقيقتان</span></div>
        <ol>
          <li>انسخ الملف أدناه والصقه في <kbd>SQL Editor</kbd>.</li>
          <li><b>غيّر السطر الأول</b>: ضع رابط Vercel مكان
            <code>https://ضع-رابطك-هنا.vercel.app</code></li>
          <li><kbd>Run</kbd> ← انسخ قيمة <b>«الرابط الكامل»</b> وافتحها في المتصفح.</li>
          <li>اختر كلمة مرورك: ١٢ حرفًا على الأقل، بحروف كبيرة وصغيرة ورقم ورمز.</li>
        </ol>
        <button class="copy" data-file="activation">نسخ ملف التفعيل <span class="sz"></span></button>

        <div class="note stop">
          <b>كلمة المرور لك وحدك</b>
          اكتبها داخل صفحة التفعيل فقط. لا ترسلها لي ولا لأحد، ولا تكتبها في
          أي ملف. الرابط صالح ٢٤ ساعة ويُستخدم مرة واحدة — وتشغيل الملف مجددًا
          يُصدر رابطًا جديدًا ويُبطل السابق.
        </div>

        <div class="mark-done"><label><input type="checkbox" id="s5"> أنجزت هذه الخطوة</label></div>
      </div>
    </section>
  </div>

  <section class="finish">
    <h2>وبعد؟</h2>
    <p>
      سجّل دخولك برقم جوالك <b>0559847714</b> وكلمة المرور التي اخترتها.
      يجب أن ترى لوحة المتابعة والمواقع الـ27 وبوابة الأدمن كاملة.
    </p>
    <div class="chips">
      <span>إدارة المستخدمين ← إضافة مستخدم</span>
      <span>كلمة مرور مؤقتة تظهر مرة واحدة</span>
      <span>طلب شراء جديد ← أرفق الفاتورة ← أرسل</span>
    </div>
  </section>

  <section class="trouble">
    <h2>إن تعثّرت</h2>
    <p style="color:var(--ink-2);font-size:.93rem;margin-top:10px">
      أرسل لي صورة الشاشة أو نص الخطأ. هذه أكثر الأعطال شيوعًا:
    </p>
    <div class="tw"><table>
      <tr><th>ما تراه</th><th>السبب الغالب</th></tr>
      <tr><td>❌ في فحص الخطوة ١</td><td>أعمدة قديمة بنوع مخصص — شغّل ملف الإصلاح</td></tr>
      <tr><td>❌ في جدول الخطوة ٢</td><td>أرسل الجدول؛ البند الفاشل يحدد السبب</td></tr>
      <tr><td>صفحة بيضاء بعد Vercel</td><td><code>Root Directory</code> لم يُضبط</td></tr>
      <tr><td>«تعذر الاتصال بالخادم»</td><td><code>ALLOWED_ORIGINS</code> لا يطابق رابط Vercel</td></tr>
      <tr><td>«رابط التفعيل غير صحيح»</td><td>الرمز نُسخ ناقصًا أو مضت ٢٤ ساعة — أعد الخطوة ٥</td></tr>
      <tr><td>«رقم الجوال أو كلمة المرور غير صحيحة»</td><td>جرّب الصيغة المحلية <code>0559847714</code></td></tr>
    </table></div>
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

<script>
(function(){
  var KEY="alnadeg-install-progress";

  function load(){
    try{ return JSON.parse(localStorage.getItem(KEY)||"{}"); }catch(e){ return {}; }
  }
  function save(s){ try{ localStorage.setItem(KEY,JSON.stringify(s)); }catch(e){} }

  var state=load();

  function paint(){
    var n=0;
    for(var i=1;i<=5;i++){
      var box=document.getElementById("s"+i);
      var step=document.querySelector('.step[data-step="'+i+'"]');
      var on=!!state["s"+i];
      if(box) box.checked=on;
      if(step) step.classList.toggle("done",on);
      if(on) n++;
    }
    document.getElementById("count").textContent=String(n);
    document.getElementById("bar").style.width=(n/5*100)+"%";
  }

  for(var i=1;i<=5;i++){
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
