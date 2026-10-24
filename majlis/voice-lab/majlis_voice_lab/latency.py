"""End-to-end response latency: end of participant speech → first audio byte of the reply.

Per turn, stages are timed back to back, as the gateway will run them:
  1. ASR on the finished utterance (batch; a streaming ASR in the gateway can only be faster),
  2. LLM until the first complete clause (TTS starts on the first clause, not the full reply),
  3. TTS until the first audio chunk of that clause.
Network hops between the browser and the gateway are not included here; the
gateway measures them in phase 3.
"""

from __future__ import annotations

import itertools
import json
import time
from pathlib import Path
from typing import Any

from . import DIALECTS
from .config import LabConfig
from .datasets import load_dialect
from .metrics import percentile
from .providers import build

CLAUSE_END = ("،", ",", ".", "؟", "?", "!", "؛")
MAX_CLAUSE_TOKENS = 12

SYSTEM_PROMPT = (
    "أنت مساعد ذكي من منصة مجلس تجري مقابلة بحثية باللهجة السعودية. "
    "ردّ بجملة قصيرة: إنصات قصير ثم سؤال متابعة واحد غير موجّه."
)


def first_clause(deltas) -> tuple[str, float]:
    """Consumes LLM deltas until a clause boundary; returns (clause, seconds to it)."""
    started = time.perf_counter()
    text = ""
    for tokens, delta in enumerate(deltas, start=1):
        text += delta
        stripped = text.rstrip()
        if stripped.endswith(CLAUSE_END) or tokens >= MAX_CLAUSE_TOKENS:
            break
    return text.strip(), time.perf_counter() - started


def measure_turn(asr, llm, tts, audio: Path, voice_gender: str = "female") -> dict[str, float]:
    t0 = time.perf_counter()
    transcript = asr.transcribe(audio).text
    t_asr = time.perf_counter() - t0

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": transcript or "..."},
    ]
    t1 = time.perf_counter()
    clause, _ = first_clause(llm.stream(messages))
    t_llm = time.perf_counter() - t1

    t2 = time.perf_counter()
    next(iter(tts.stream(clause or "إيه", voice_gender)))
    t_tts = time.perf_counter() - t2

    return {
        "asr_ms": t_asr * 1000,
        "llm_first_clause_ms": t_llm * 1000,
        "tts_first_audio_ms": t_tts * 1000,
        "total_ms": (t_asr + t_llm + t_tts) * 1000,
    }


def summarize(turns: list[dict[str, float]]) -> dict[str, Any]:
    out: dict[str, Any] = {"turns": len(turns)}
    for stage in ("asr_ms", "llm_first_clause_ms", "tts_first_audio_ms", "total_ms"):
        values = [t[stage] for t in turns]
        out[stage] = {"p50": percentile(values, 50), "p90": percentile(values, 90)}
    return out


def run(
    config: LabConfig,
    asr_ids: list[str] | None = None,
    llm_ids: list[str] | None = None,
    tts_ids: list[str] | None = None,
    max_turns: int = 50,
) -> dict[str, Any]:
    def pick(kind: str, ids: list[str] | None):
        return [s for s in config.of_kind(kind) if not ids or s.id in ids]

    audio = [s.audio for d in DIALECTS for s in load_dialect(config.datasets_dir, d)][:max_turns]
    if not audio:
        raise ValueError("no dataset audio found; latency needs real utterances")

    results: dict[str, Any] = {"generated_at": time.time(), "pipelines": {}}
    built: dict[str, Any] = {}
    for a, l, t in itertools.product(
        pick("asr", asr_ids), pick("llm", llm_ids), pick("tts", tts_ids)
    ):
        adapters = [built.setdefault(s.id, build(s)) for s in (a, l, t)]
        # One warm-up turn so model loading is not counted as latency.
        measure_turn(*adapters, audio[0])
        turns = [measure_turn(*adapters, path) for path in audio]
        results["pipelines"][f"{a.id} → {l.id} → {t.id}"] = summarize(turns)
    return results


def write(results: dict[str, Any], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "latency_results.json"
    path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    return path
