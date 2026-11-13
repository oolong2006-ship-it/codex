# موجة (Mawja)

**موجة** محاكاة حاسوبية (على برنامج SUMO) لإشارات المرور في شارع العليا بالرياض، تقارن بين
التوقيت الثابت المنسّق (الموجة الخضراء) وتحكم متكيف تعتمد قراراته على أطوال الطوابير.
**هذه محاكاة وليست نتائج ميدانية:** أحجام الطلب المروري «تقديرية» وليست عدّادات حقيقية،
وهندسة الشارع والتقاطعات «تقريبية» (إحداثيات مبسّطة وليست مأخوذة من مسح ميداني). النتائج
تُظهر اتجاهاً مقارناً بين الأساليب ولا تصلح للتنفيذ على الطريق دون دراسة ميدانية.

## المتطلبات

- Python 3.10 أو أحدث (جُرّب على 3.13) مع `pip`
- اتصال بالإنترنت مرة واحدة فقط أثناء التثبيت (لتنزيل SUMO وحزم Python)؛ بعد ذلك تعمل
  الصفحة والمحاكاة دون إنترنت
- متصفح حديث لعرض الصفحة

## التثبيت

كل الأوامر تُنفَّذ من داخل مجلد `mawja/`:

    cd mawja
    python -m venv .venv
    source .venv/bin/activate        # على ويندوز: .venv\Scripts\activate
    pip install -e .

## أسرع طريق: فتح الصفحة بالبيانات الجاهزة

نتائج المحاكاة محفوظة في `web/data/`، لذا لا حاجة لتشغيل أي محاكاة. الصفحة تحتاج خادماً
محلياً بسيطاً (لا تعمل بالنقر المزدوج على الملف لأن المتصفح يمنع قراءة ملفات JSON من `file://`):

    cd web
    python -m http.server 8000

ثم افتح في المتصفح: <http://localhost:8000/index.html> (صفحة المنهجية: `methodology.html`).

## إعادة توليد النتائج

من مجلد `mawja/` (مع تفعيل البيئة الافتراضية):

    # مقارنة كل الأساليب على ثلاثة مستويات طلب (0.8 و1.0 و1.2) -> web/data/results.json
    python -m sim.cli compare --seed 1 --scales 0.8 1.0 1.2 --out web/data/

    # تسجيل تشغيلة واحدة لعرضها في الصفحة -> web/data/replay_<controller>.json
    python -m sim.cli export --controller fixed --seed 1 --out web/data/
    python -m sim.cli export --controller max_pressure --seed 1 --out web/data/

المدة التقريبية: أمر `compare` الكامل (ساعتان محاكاتان لكل أسلوب ولكل مستوى طلب) يستغرق
عدة دقائق إلى عشرات الدقائق حسب الجهاز، وكل أمر `export` أقل من ذلك بكثير. لتجربة سريعة
أضف `--duration 600` (عشر دقائق محاكاة) وغيّر `--out` إلى مجلد مؤقت كي لا تستبدل البيانات
المحفوظة. نفس قيمة `--seed` تعطي نفس النتائج. يرفض الأمران أي تشغيلة تخالف قواعد الإشارة
(أخضر أدنى 10 ث، أقصى 90 ث، أصفر 3 ث، أحمر كامل 2 ث) ويخرجان برمز خطأ.

## تشغيل الاختبارات

    python -m pytest -q

اختبارات الصفحة تحتاج Node.js مع Playwright؛ إن لم يتوفرا تُتخطّى تلقائياً.

## ملاحظات

تعريف الممر في `sim/config/corridor.yaml` (الهندسة تقريبية؛ يمكن ضبط `osm_file:` للبناء من
بيانات OpenStreetMap الحقيقية، وعندها تُعرض الإشارة © OpenStreetMap contributors (ODbL)).

## وكيل التعلم المعزز (اختياري، وليس «موجة» في العرض الحالي)

الأوامر بالإنجليزية كما هي:

    pip install -e '.[rl]'
    # stage 1: halting reward, ~1 M decisions (about 25 min on 4 cores)
    python -m sim.rl.train --reward halting --steps 1000000 --log-dir build/rl_stage1 \
        --out build/rl_stage1/final_policy.zip
    # stage 2: waiting-time reward, warm start, 80 min wall clock
    python -m sim.rl.train --reward wait --max-wall-min 80 --checkpoint-steps 500000 \
        --init-from build/rl_stage1/final_policy.zip --log-dir build/rl \
        --out build/rl/final_policy.zip

اختيار أفضل نقطة حفظ (checkpoint): قيّم كل ملف `ckpt_*.zip` على البذرتين 2 و3 بمستوى طلب 1.0
واختر الأقل في متوسط الانتظار:

    python - <<'EOF'
    from pathlib import Path
    from sim.rl.train import evaluate
    best = None
    for ck in sorted(Path("build/rl").glob("ckpt_*.zip")):
        w = sum(evaluate(ck, seed=s, scale=1.0)["avg_wait_s"] for s in (2, 3)) / 2
        print(ck.name, round(w, 2))
        if best is None or w < best[0]:
            best = (w, ck)
    print("best:", best[1])
    EOF
    cp build/rl/ckpt_<best>.zip models/rl_policy.zip
    python -m sim.cli compare --seed 1 --controllers fixed actuated max_pressure rl \
        --out build/compare_rl

سياسة PPO واحدة (sb3-contrib MaskablePPO) مشتركة بين التقاطعات الستة؛ قرارها فقط «تمديد» أو
«انتقال» كل 5 ثوانٍ بعد أن يبلغ الأخضر 10 ثوانٍ، وبنفس برنامج الإشارة الخاص بخوارزمية الضغط
الأقصى. التدريب يستخدم البذور 10-59 ومستويات طلب 0.8-1.2؛ البذرة 1 محجوزة للمقارنة، والبذرتان
2-3 لاختيار نقطة الحفظ. الملف `models/rl_policy.zip` (165 kB) هو السياسة المحفوظة؛ التدريب غير
قابل لإعادة الإنتاج بدقة (ترتيب الحلقات المتوازية).

لم تجتز السياسة بوابة القرار في المهمة 8 (أفضل من الضغط الأقصى عند مستوى طلب 1.0 لكنها أسوأ
بكثير عند 0.8 و1.2)، لذلك يبقى `web/data/manifest.json` على `max_pressure`.
