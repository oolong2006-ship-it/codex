import json
from pathlib import Path

import pytest

from majlis_voice_lab import asr_bench, latency, tts_bench
from majlis_voice_lab.config import LabConfig, parse_config
from majlis_voice_lab.datasets import import_samples, load_dialect
from majlis_voice_lab.report import _non_commercial, build_report

from .conftest import write

LAB_DIR = Path(__file__).resolve().parent.parent


def test_asr_scores_each_dialect_separately(lab: LabConfig) -> None:
    results = asr_bench.run(lab)
    najdi = results["providers"]["asr-a"]["dialects"]["najdi"]["summary"]
    # 1 deleted word out of 3 + 6 + 4 reference words
    assert najdi["samples"] == 3
    assert najdi["wer"] == pytest.approx(1 / 13)
    assert results["providers"]["asr-a"]["dialects"]["hijazi"]["summary"] == {"samples": 0}


def test_listening_page_is_blind_and_mos_aggregates(lab: LabConfig) -> None:
    sentences = tts_bench.load_sentences(LAB_DIR / "sentences.yaml")[:3]
    tts_bench.generate(lab, sentences, genders=("female",))
    listen = tts_bench.build_listening_page(lab, sentences, seed=1)

    page = (listen / "index.html").read_text(encoding="utf-8")
    assert "tts-a" not in page and "tts-b" not in page
    assert not (listen / "key.json").exists()
    assert len(list((listen / "audio").glob("*.wav"))) == 6

    key = json.loads((lab.output_dir / "tts" / "key.json").read_text(encoding="utf-8"))
    item_of = {(m["provider"], m["sentence"]): i for i, m in key["items"].items()}
    pair_id, pair = next(iter(key["pairs"].items()))
    sheet = {
        "rater": "r1",
        "ratings": [
            {"item": item_of[("tts-a", "s01")], "mos": 5, "dialect_ok": True},
            {"item": item_of[("tts-a", "s02")], "mos": 4, "dialect_ok": True},
            {"item": item_of[("tts-b", "s01")], "mos": 2, "dialect_ok": False},
            {
                "item": item_of[("tts-b", "s02")],
                "mos": 9,
                "dialect_ok": False,
            },  # out of range: ignored
        ],
        "ab": [{"pair": pair_id, "choice": "a" if pair["a"] == "tts-a" else "b"}],
    }
    result = tts_bench.aggregate(key, [sheet])["providers"]
    assert result["tts-a"]["mos"] == 4.5
    assert result["tts-a"]["dialect_correct"] == 1.0
    assert result["tts-a"]["ab_win_rate"] == 1.0
    assert result["tts-b"]["ratings"] == 1
    assert result["tts-b"]["ab_win_rate"] == 0.0


def test_latency_reports_percentiles(lab: LabConfig, tmp_path: Path) -> None:
    slow = parse_config(
        {
            "asr": [
                {"id": "a", "adapter": "mock", "location": "local", "options": {"delay_ms": 5}}
            ],
            "llm": [
                {
                    "id": "l",
                    "adapter": "mock",
                    "location": "local",
                    "options": {"first_token_ms": 5},
                }
            ],
            "tts": [
                {"id": "t", "adapter": "mock", "location": "local", "options": {"delay_ms": 5}}
            ],
            "datasets_dir": str(lab.datasets_dir),
        },
        tmp_path,
    )
    results = latency.run(slow)
    pipeline = results["pipelines"]["a → l → t"]
    assert pipeline["turns"] == 3
    assert pipeline["total_ms"]["p90"] >= 15
    assert pipeline["total_ms"]["p50"] <= pipeline["total_ms"]["p90"]


def test_first_clause_stops_at_punctuation() -> None:
    clause, _ = latency.first_clause(iter(["إيه، ", "فاهم ", "عليك."]))
    assert clause == "إيه،"


def test_report_flags_mock_data_and_does_not_pass_small_samples(lab: LabConfig) -> None:
    asr_bench.write(asr_bench.run(lab), lab.output_dir)
    report = build_report(lab.output_dir, lab.datasets_dir)
    assert "مزودات وهمية" in report
    assert "لا يوجد مزود يحقق المعيار" in report  # WER 7.7% on 3 utterances is not a pass
    assert "عينة صغيرة" in report


def test_non_commercial_licenses_are_flagged() -> None:
    assert _non_commercial("CC-BY-NC-4.0")
    assert _non_commercial("Coqui Public Model License (non-commercial)")
    assert not _non_commercial("MIT")
    assert not _non_commercial("Apache-2.0")


def test_import_is_all_or_nothing(tmp_path: Path) -> None:
    src = tmp_path / "incoming"
    write(src / "a.wav", b"RIFF")
    write(src / "refs.csv", "audio,reference\na.wav,هلا والله\nmissing.wav,زين\n")
    with pytest.raises(ValueError, match="nothing was copied"):
        import_samples(tmp_path / "datasets", "najdi", src / "refs.csv", src)
    assert load_dialect(tmp_path / "datasets", "najdi") == []

    write(src / "refs.csv", "audio,reference,speaker\na.wav,هلا والله,s1\n")
    assert import_samples(tmp_path / "datasets", "najdi", src / "refs.csv", src) == 1
    [sample] = load_dialect(tmp_path / "datasets", "najdi")
    assert (sample.id, sample.reference, sample.speaker) == ("najdi-00001", "هلا والله", "s1")
    with pytest.raises(ValueError, match="duplicate audio"):
        import_samples(tmp_path / "datasets", "najdi", src / "refs.csv", src)
