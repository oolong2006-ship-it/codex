"""Arabic text normalization used *only* for scoring ASR output.

WER on Arabic is very sensitive to orthographic choices that carry no meaning
difference in dialectal speech (hamza forms, taa marbuta vs haa, diacritics).
Both reference and hypothesis go through the same function so the metric
reflects recognition errors, not spelling conventions. The rules are fixed and
documented in REPORT.md so numbers stay comparable across runs.
"""

from __future__ import annotations

import re
import unicodedata

_DIACRITICS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭ]")
_TATWEEL = "ـ"
_ALEF_VARIANTS = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا"})
_LETTER_VARIANTS = str.maketrans({"ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي"})
_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
_PUNCT = re.compile(r"[^\w\s]|_", re.UNICODE)
_SPACES = re.compile(r"\s+")

RULES = (
    "إزالة التشكيل والتطويل",
    "توحيد الألف (أ إ آ ٱ → ا)",
    "ى → ي، ة → ه، ؤ → و، ئ → ي",
    "الأرقام العربية-الهندية → 0-9",
    "حذف علامات الترقيم",
    "تحويل الحروف اللاتينية إلى حروف صغيرة (للجمل المختلطة)",
    "دمج المسافات المتكررة",
)


def normalize_for_scoring(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = _DIACRITICS.sub("", text).replace(_TATWEEL, "")
    text = text.translate(_ALEF_VARIANTS).translate(_LETTER_VARIANTS).translate(_DIGITS)
    text = _PUNCT.sub(" ", text).lower()
    return _SPACES.sub(" ", text).strip()
