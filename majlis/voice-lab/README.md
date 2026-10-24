# مختبر الصوت (voice-lab)

أداة لمقارنة مزودي ASR و TTS بالأرقام الفعلية لكل لهجة على حدة. تُبنى بالكامل في **المرحلة 1**.

## هيكل البيانات

```
datasets/<dialect>/manifest.csv     الأعمدة: id,audio,reference
datasets/<dialect>/audio/<file>     ملفات الصوت المشار إليها في الملف
```

اللهجات: `najdi`, `hijazi`, `southern`, `eastern`, `northern`, `msa_simple`.
ملفات الصوت لا تُرفع إلى git (انظر `.gitignore`)؛ يحتفظ بها الفريق في تخزين داخل المملكة.

## التشغيل

```bash
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
pytest
```
