"""TTS generation, blind listening page and MOS / A-B aggregation.

The listening folder handed to raters contains only randomly named audio files
and the page; which engine produced which file lives in `tts/key.json`, which
is never copied into the listening folder.
"""

from __future__ import annotations

import itertools
import json
import random
import secrets
from collections import defaultdict
from importlib import resources
from pathlib import Path
from typing import Any

import yaml

from .config import LabConfig
from .metrics import mean_ci
from .providers import build

GENDERS = ("male", "female")


def load_sentences(path: Path) -> list[dict[str, str]]:
    sentences = yaml.safe_load(path.read_text(encoding="utf-8"))
    ids = [s["id"] for s in sentences]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate sentence ids")
    return sentences


def generate(
    config: LabConfig,
    sentences: list[dict[str, str]],
    genders: tuple[str, ...] = GENDERS,
    provider_ids: list[str] | None = None,
) -> Path:
    """Synthesizes every sentence with every TTS provider into output/tts/<provider>/."""
    out = config.output_dir / "tts"
    for spec in config.of_kind("tts"):
        if provider_ids and spec.id not in provider_ids:
            continue
        adapter = build(spec)
        target = out / spec.id
        target.mkdir(parents=True, exist_ok=True)
        for sentence in sentences:
            for gender in genders:
                audio = adapter.synthesize(sentence["text"], gender)
                (target / f"{sentence['id']}_{gender}.wav").write_bytes(audio)
    return out


def build_listening_page(
    config: LabConfig, sentences: list[dict[str, str]], seed: int | None = None
) -> Path:
    """Creates output/listening/ (shareable) and output/tts/key.json (kept private)."""
    tts_dir = config.output_dir / "tts"
    listen_dir = config.output_dir / "listening"
    audio_dir = listen_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    rng = random.Random(seed)
    texts = {s["id"]: s["text"] for s in sentences}

    providers = sorted(p.name for p in tts_dir.iterdir() if p.is_dir()) if tts_dir.exists() else []
    if not providers:
        raise ValueError("no generated TTS audio found; run `tts` first")

    items: list[dict[str, str]] = []
    key_items: dict[str, dict[str, str]] = {}
    by_sentence: dict[tuple[str, str], dict[str, str]] = defaultdict(dict)
    for provider in providers:
        for wav in sorted((tts_dir / provider).glob("*.wav")):
            sentence_id, gender = wav.stem.rsplit("_", 1)
            if sentence_id not in texts:
                continue
            item_id = secrets.token_hex(6)
            (audio_dir / f"{item_id}.wav").write_bytes(wav.read_bytes())
            items.append(
                {"id": item_id, "audio": f"audio/{item_id}.wav", "text": texts[sentence_id]}
            )
            key_items[item_id] = {"provider": provider, "sentence": sentence_id, "gender": gender}
            by_sentence[(sentence_id, gender)][provider] = item_id

    pairs: list[dict[str, str]] = []
    key_pairs: dict[str, dict[str, str]] = {}
    for (sentence_id, gender), produced in sorted(by_sentence.items()):
        for p1, p2 in itertools.combinations(sorted(produced), 2):
            a, b = (p1, p2) if rng.random() < 0.5 else (p2, p1)
            pair_id = secrets.token_hex(6)
            pairs.append(
                {
                    "id": pair_id,
                    "text": texts[sentence_id],
                    "a": f"audio/{produced[a]}.wav",
                    "b": f"audio/{produced[b]}.wav",
                }
            )
            key_pairs[pair_id] = {"a": a, "b": b, "sentence": sentence_id, "gender": gender}

    rng.shuffle(items)
    rng.shuffle(pairs)
    template = resources.files("majlis_voice_lab").joinpath("listening.html").read_text("utf-8")
    payload = json.dumps({"items": items, "pairs": pairs}, ensure_ascii=False)
    (listen_dir / "index.html").write_text(
        template.replace("/*__DATA__*/null", payload), encoding="utf-8"
    )
    (tts_dir / "key.json").write_text(
        json.dumps({"items": key_items, "pairs": key_pairs}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return listen_dir


def aggregate(key: dict[str, Any], rating_files: list[dict[str, Any]]) -> dict[str, Any]:
    """MOS, dialect-correctness rate and A/B preference per provider."""
    mos: dict[str, list[float]] = defaultdict(list)
    mos_by_gender: dict[str, list[float]] = defaultdict(list)
    dialect_ok: dict[str, list[bool]] = defaultdict(list)
    raters: dict[str, set[str]] = defaultdict(set)
    wins: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    comparisons: dict[str, int] = defaultdict(int)

    for sheet in rating_files:
        rater = str(sheet.get("rater") or "anonymous")
        for r in sheet.get("ratings", []):
            meta = key["items"].get(r.get("item"))
            if not meta:
                continue
            provider = meta["provider"]
            if r.get("mos") is not None:
                score = float(r["mos"])
                if not 1 <= score <= 5:
                    continue
                mos[provider].append(score)
                mos_by_gender[f"{provider}:{meta['gender']}"].append(score)
                raters[provider].add(rater)
            if r.get("dialect_ok") is not None:
                dialect_ok[provider].append(bool(r["dialect_ok"]))
        for c in sheet.get("ab", []):
            meta = key["pairs"].get(c.get("pair"))
            if not meta or c.get("choice") not in ("a", "b", "tie"):
                continue
            a, b = meta["a"], meta["b"]
            for p in (a, b):
                comparisons[p] += 1
            if c["choice"] == "tie":
                wins[a][b] += 0.5
                wins[b][a] += 0.5
            else:
                winner, loser = (a, b) if c["choice"] == "a" else (b, a)
                wins[winner][loser] += 1

    providers: dict[str, Any] = {}
    for provider in sorted(set(mos) | set(dialect_ok) | set(comparisons)):
        mean, half = mean_ci(mos[provider])
        ok = dialect_ok[provider]
        won = sum(wins[provider].values())
        providers[provider] = {
            "mos": mean,
            "mos_ci95": half,
            "ratings": len(mos[provider]),
            "raters": len(raters[provider]),
            "mos_by_gender": {
                g: mean_ci(mos_by_gender[f"{provider}:{g}"])[0]
                for g in GENDERS
                if mos_by_gender[f"{provider}:{g}"]
            },
            "dialect_correct": (sum(ok) / len(ok)) if ok else None,
            "ab_win_rate": (won / comparisons[provider]) if comparisons[provider] else None,
        }
    return {"providers": providers}


def aggregate_dir(config: LabConfig, ratings_dir: Path) -> dict[str, Any]:
    key = json.loads((config.output_dir / "tts" / "key.json").read_text(encoding="utf-8"))
    sheets = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(ratings_dir.glob("*.json"))]
    result = aggregate(key, sheets)
    result["rating_files"] = len(sheets)
    path = config.output_dir / "tts_results.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result
