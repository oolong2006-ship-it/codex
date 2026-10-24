"""Builds REPORT.md from the JSON results. Numbers are reported as measured; the
thresholds come from THRESHOLDS and are never adjusted to make a provider pass."""

from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Any

from . import DIALECTS, THRESHOLDS
from .datasets import stats
from .textnorm import RULES

DIALECT_NAMES = {
    "najdi": "النجدية",
    "hijazi": "الحجازية",
    "southern": "الجنوبية",
    "eastern": "الشرقية/الخليجية",
    "northern": "الشمالية",
    "msa_simple": "الفصحى المبسطة",
}
MIN_UTTERANCES = 200  # below this a per-dialect WER is too noisy to decide on
MIN_RATERS = 10

PASS, FAIL, UNSURE, NONE = "✅", "❌", "⚠️", "—"


def _load(path: Path) -> dict[str, Any] | None:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _pct(x: float | None) -> str:
    return NONE if x is None or (isinstance(x, float) and math.isnan(x)) else f"{100 * x:.1f}٪"


def _num(x: float | None, digits: int = 2) -> str:
    return NONE if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.{digits}f}"


def _non_commercial(license_name: str) -> bool:
    lowered = license_name.lower()
    return (
        "nc" in lowered.replace("-", " ").split()
        or "non-commercial" in lowered
        or "cc-by-nc" in lowered
    )


def wer_verdict(summary: dict[str, Any]) -> str:
    if not summary.get("samples"):
        return NONE
    wer, (_lo, hi) = summary["wer"], summary["wer_ci95"]
    if wer >= THRESHOLDS["wer_max"]:
        return FAIL
    if hi >= THRESHOLDS["wer_max"] or summary["samples"] < MIN_UTTERANCES:
        return UNSURE
    return PASS


def _uses_mock(*results: dict[str, Any] | None) -> bool:
    for r in results:
        if not r:
            continue
        for p in (r.get("providers") or {}).values():
            if p.get("adapter") == "mock":
                return True
        for name in r.get("pipelines") or {}:
            if "mock" in name:
                return True
    return False


def _asr_section(asr: dict[str, Any] | None) -> tuple[list[str], str]:
    lines = ["## 2. تفريغ الكلام (ASR) — WER لكل لهجة", ""]
    if not asr or not asr.get("providers"):
        return lines + ["لم يُشغَّل قياس ASR بعد.", ""], "لا توجد نتائج ASR بعد."
    header = "| المزود | الترخيص | " + " | ".join(DIALECT_NAMES[d] for d in DIALECTS) + " |"
    lines += [header, "|" + "---|" * (len(DIALECTS) + 2)]
    cer_lines = [
        "",
        "**CER و سرعة المعالجة (RTF)**",
        "",
        "| المزود | " + " | ".join(DIALECT_NAMES[d] for d in DIALECTS) + " | RTF |",
        "|" + "---|" * (len(DIALECTS) + 2),
    ]
    ranking: list[tuple[float, str]] = []
    gaps: list[str] = []
    for pid, p in asr["providers"].items():
        cells, cer_cells, wers, rtfs, all_pass = [], [], [], [], True
        for d in DIALECTS:
            s = p["dialects"].get(d, {}).get("summary", {})
            verdict = wer_verdict(s)
            all_pass &= verdict == PASS
            if s.get("samples"):
                lo, hi = s["wer_ci95"]
                cells.append(f"{verdict} {_pct(s['wer'])} ({_pct(lo)}–{_pct(hi)}) n={s['samples']}")
                cer_cells.append(_pct(s["cer"]))
                wers.append(s["wer"])
                if s.get("rtf") is not None:
                    rtfs.append(s["rtf"])
                if verdict != PASS:
                    gaps.append(f"{pid} / {DIALECT_NAMES[d]}: {_pct(s['wer'])}")
            else:
                cells.append(NONE)
                cer_cells.append(NONE)
                gaps.append(f"{pid} / {DIALECT_NAMES[d]}: لا بيانات")
        lic = p.get("license", "unverified") + (
            " 🚫" if _non_commercial(p.get("license", "")) else ""
        )
        lines.append(f"| {pid} | {lic} | " + " | ".join(cells) + " |")
        cer_lines.append(
            f"| {pid} | "
            + " | ".join(cer_cells)
            + f" | {_num(sum(rtfs) / len(rtfs) if rtfs else None)} |"
        )
        if all_pass and not _non_commercial(p.get("license", "")):
            ranking.append((sum(wers) / len(wers), pid))
    lines += cer_lines + [""]
    if ranking:
        best = min(ranking)
        rec = f"ASR: **{best[1]}** يحقق WER < {_pct(THRESHOLDS['wer_max'])} في كل اللهجات (متوسط {_pct(best[0])})."
    else:
        rec = (
            f"ASR: **لا يوجد مزود يحقق المعيار (WER < {_pct(THRESHOLDS['wer_max'])}) في كل اللهجات.** "
            "الفجوات الفعلية: " + "؛ ".join(gaps[:12])
        )
    return lines, rec


def _tts_section(tts: dict[str, Any] | None) -> tuple[list[str], str]:
    lines = ["## 3. توليد الصوت (TTS) — MOS والاستماع الأعمى", ""]
    if not tts or not tts.get("providers"):
        return lines + ["لم تُجمع تقييمات المستمعين بعد.", ""], "لا توجد تقييمات TTS بعد."
    lines += [
        "| المزود | MOS (±95٪) | التقييمات / المقيّمون | صحة اللهجة | الفوز في A/B | الحكم |",
        "|---|---|---|---|---|---|",
    ]
    ranking: list[tuple[float, str]] = []
    gaps: list[str] = []
    for pid, p in tts["providers"].items():
        mos_ok = (
            p["mos"] is not None and not math.isnan(p["mos"]) and p["mos"] >= THRESHOLDS["mos_min"]
        )
        dia_ok = (
            p["dialect_correct"] is not None
            and p["dialect_correct"] >= THRESHOLDS["dialect_correct_min"]
        )
        enough = p["raters"] >= MIN_RATERS
        verdict = PASS if mos_ok and dia_ok and enough else (UNSURE if mos_ok and dia_ok else FAIL)
        lines.append(
            f"| {pid} | {_num(p['mos'])} ± {_num(p['mos_ci95'])} | {p['ratings']} / {p['raters']} | "
            f"{_pct(p['dialect_correct'])} | {_pct(p['ab_win_rate'])} | {verdict} |"
        )
        if verdict == PASS:
            ranking.append((p["mos"], pid))
        else:
            gaps.append(
                f"{pid}: MOS {_num(p['mos'])}، صحة اللهجة {_pct(p['dialect_correct'])}، مقيّمون {p['raters']}"
            )
    lines.append("")
    if ranking:
        best = max(ranking)
        rec = f"TTS: **{best[1]}** (MOS {_num(best[0])})."
    else:
        rec = (
            f"TTS: **لا يوجد محرك يحقق MOS ≥ {THRESHOLDS['mos_min']} وصحة لهجة ≥ "
            f"{_pct(THRESHOLDS['dialect_correct_min'])} بعدد مقيّمين كافٍ ({MIN_RATERS}+).** "
            + "؛ ".join(gaps)
        )
    return lines, rec


def _latency_section(lat: dict[str, Any] | None) -> tuple[list[str], str]:
    lines = ["## 4. زمن الرد الكامل (end-to-end)", ""]
    if not lat or not lat.get("pipelines"):
        return lines + ["لم يُشغَّل قياس الزمن بعد.", ""], "لا توجد قياسات زمن بعد."
    lines += [
        "| المسار (ASR → LLM → TTS) | الإجمالي p50 | الإجمالي p90 | ASR p90 | LLM أول جملة p90 | TTS أول صوت p90 | الحكم |",
        "|---|---|---|---|---|---|---|",
    ]
    ranking: list[tuple[float, str]] = []
    for name, s in lat["pipelines"].items():
        p90 = s["total_ms"]["p90"]
        ok = p90 < THRESHOLDS["latency_p90_ms_max"]
        lines.append(
            f"| {name} | {_num(s['total_ms']['p50'], 0)}ms | {_num(p90, 0)}ms | {_num(s['asr_ms']['p90'], 0)}ms | "
            f"{_num(s['llm_first_clause_ms']['p90'], 0)}ms | {_num(s['tts_first_audio_ms']['p90'], 0)}ms | {PASS if ok else FAIL} |"
        )
        ranking.append((p90, name))
    lines.append("")
    best = min(ranking)
    if best[0] < THRESHOLDS["latency_p90_ms_max"]:
        rec = f"الزمن: أسرع مسار **{best[1]}** بـ p90 = {_num(best[0], 0)}ms."
    else:
        rec = f"الزمن: **لا يوجد مسار تحت {THRESHOLDS['latency_p90_ms_max']:.0f}ms (p90).** أفضلها {best[1]} بـ {_num(best[0], 0)}ms."
    return lines, rec


def build_report(output_dir: Path, datasets_dir: Path) -> str:
    asr = _load(output_dir / "asr_results.json")
    tts = _load(output_dir / "tts_results.json")
    lat = _load(output_dir / "latency_results.json")

    lines = [
        "# تقرير مختبر الصوت — مجلس",
        "",
        f"تاريخ التوليد: {time.strftime('%Y-%m-%d %H:%M')}",
        "",
    ]
    if _uses_mock(asr, tts, lat):
        lines += [
            "> ⚠️ **هذه النتائج من مزودات وهمية (mock) للتحقق من الأدوات فقط. ليست قياساً لأي نموذج حقيقي ولا يُبنى عليها قرار.**",
            "",
        ]
    lines += [
        "**سياسة البيانات:** نماذج مستضافة ذاتياً داخل المملكة فقط. الأداة ترفض أي مزود لا يعلن موقعه `local` أو `in-kingdom`.",
        "",
        "## 1. المعايير ومجموعات البيانات",
        "",
        "| المعيار | الحد |",
        "|---|---|",
        f"| WER لكل لهجة | < {_pct(THRESHOLDS['wer_max'])} |",
        f"| MOS | ≥ {THRESHOLDS['mos_min']} |",
        f"| صحة اللهجة | ≥ {_pct(THRESHOLDS['dialect_correct_min'])} |",
        f"| زمن الرد p90 | < {THRESHOLDS['latency_p90_ms_max']:.0f}ms |",
        "",
        "| اللهجة | عدد العينات | المتحدثون | الدقائق (WAV) | ملاحظة |",
        "|---|---|---|---|---|",
    ]
    for d, s in stats(datasets_dir).items():
        note = (
            "لا بيانات"
            if not s["samples"]
            else ("عينة صغيرة" if s["samples"] < MIN_UTTERANCES else "")
        )
        lines.append(
            f"| {DIALECT_NAMES[d]} | {s['samples']} | {s['speakers'] or NONE} | {s['wav_minutes'] or NONE} | {note} |"
        )
    lines.append("")

    recs = []
    for section in (_asr_section(asr), _tts_section(tts), _latency_section(lat)):
        lines += section[0]
        recs.append(section[1])

    lines += ["## 5. التوصية", ""] + [f"- {r}" for r in recs] + [""]
    lines += [
        "## 6. المنهجية",
        "",
        f"- {PASS} يحقق المعيار، {FAIL} لا يحققه، {UNSURE} النتيجة غير حاسمة (حد الثقة الأعلى يتجاوز المعيار، أو العينة أقل من {MIN_UTTERANCES} جملة، أو المقيّمون أقل من {MIN_RATERS})، 🚫 ترخيص غير تجاري لا يصلح للإنتاج.",
        "- WER و CER محسوبة على مستوى المجموعة (مجموع الأخطاء ÷ مجموع كلمات المرجع)، مع فترة ثقة 95٪ بإعادة المعاينة (bootstrap).",
        "- يُطبَّع المرجع والناتج بنفس القواعد قبل المقارنة:",
        *[f"  - {rule}" for rule in RULES],
        "- MOS: مقياس 1–5 من مقيّمين سعوديين في صفحة استماع أعمى بأسماء ملفات عشوائية؛ ومفتاح الربط بالمزودين خارج الصفحة.",
        "- الزمن: ASR على الجملة كاملة بعد انتهاء الكلام + LLM حتى أول جملة مكتملة + TTS حتى أول مقطع صوت. لا يشمل شبكة المتصفح (تُقاس في المرحلة 3).",
        "",
    ]
    return "\n".join(lines)
