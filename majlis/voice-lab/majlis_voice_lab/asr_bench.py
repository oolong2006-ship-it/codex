"""Runs every configured ASR provider on every dialect and scores it per dialect."""

from __future__ import annotations

import json
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any

from . import DIALECTS
from .config import LabConfig
from .datasets import load_dialect
from .metrics import Counts, bootstrap_ci, corpus_cer, corpus_wer, utterance_counts
from .providers import build


def score(rows: list[dict[str, Any]]) -> dict[str, Any]:
    counts = [Counts(**r["counts"]) for r in rows]
    if not counts:
        return {"samples": 0}
    lo, hi = bootstrap_ci(counts)
    audio_s = sum(r["audio_seconds"] or 0 for r in rows)
    proc_s = sum(r["seconds"] for r in rows)
    return {
        "samples": len(counts),
        "wer": corpus_wer(counts),
        "wer_ci95": [lo, hi],
        "cer": corpus_cer(counts),
        "rtf": proc_s / audio_s if audio_s else None,
    }


def run(config: LabConfig, provider_ids: list[str] | None = None) -> dict[str, Any]:
    from .audio import wav_duration_seconds

    specs = [s for s in config.of_kind("asr") if not provider_ids or s.id in provider_ids]
    results: dict[str, Any] = {"generated_at": time.time(), "providers": {}}
    for spec in specs:
        adapter = build(spec)
        per_dialect: dict[str, Any] = {}
        for dialect in DIALECTS:
            rows = []
            for sample in load_dialect(config.datasets_dir, dialect):
                started = time.perf_counter()
                out = adapter.transcribe(sample.audio)
                elapsed = time.perf_counter() - started
                rows.append(
                    {
                        "id": sample.id,
                        "reference": sample.reference,
                        "hypothesis": out.text,
                        "confidence": out.confidence,
                        "seconds": elapsed,
                        "audio_seconds": wav_duration_seconds(sample.audio),
                        "counts": asdict(utterance_counts(sample.reference, out.text)),
                    }
                )
            per_dialect[dialect] = {"summary": score(rows), "utterances": rows}
        results["providers"][spec.id] = {
            "adapter": spec.adapter,
            "location": spec.location,
            "license": spec.license,
            "dialects": per_dialect,
        }
    return results


def write(results: dict[str, Any], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "asr_results.json"
    path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    return path
