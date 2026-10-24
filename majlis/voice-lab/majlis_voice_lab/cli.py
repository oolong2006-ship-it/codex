"""Command line entry point: python -m majlis_voice_lab <command>."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import asr_bench, latency, tts_bench
from .config import load_config
from .datasets import import_samples, stats, validate
from .report import build_report

LAB_DIR = Path(__file__).resolve().parent.parent


def _ids(value: str | None) -> list[str] | None:
    return [v.strip() for v in value.split(",") if v.strip()] if value else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="majlis_voice_lab")
    parser.add_argument("--config", type=Path, default=None)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("validate", help="check dataset layout for every dialect")
    sub.add_parser("stats", help="samples, speakers and minutes per dialect")

    imp = sub.add_parser("import", help="add audio + references to a dialect dataset")
    imp.add_argument("--dialect", required=True)
    imp.add_argument(
        "--refs", type=Path, required=True, help="CSV: audio,reference[,id,speaker,gender]"
    )
    imp.add_argument("--audio-dir", type=Path, required=True)

    asr = sub.add_parser("asr", help="run ASR providers and score WER/CER per dialect")
    asr.add_argument("--providers")

    tts = sub.add_parser("tts", help="synthesize the test sentences with every TTS provider")
    tts.add_argument("--providers")
    tts.add_argument("--genders", default="male,female")
    tts.add_argument("--sentences", type=Path, default=LAB_DIR / "sentences.yaml")

    page = sub.add_parser("listening-page", help="build the blind A/B listening page")
    page.add_argument("--sentences", type=Path, default=LAB_DIR / "sentences.yaml")

    mos = sub.add_parser("mos", help="aggregate rater sheets into MOS / A-B results")
    mos.add_argument("--ratings", type=Path, required=True, help="folder of ratings-*.json")

    lat = sub.add_parser("latency", help="measure end-to-end response latency")
    lat.add_argument("--asr")
    lat.add_argument("--llm")
    lat.add_argument("--tts")
    lat.add_argument("--max-turns", type=int, default=50)

    rep = sub.add_parser("report", help="write REPORT.md from the latest results")
    rep.add_argument("--out", type=Path, default=LAB_DIR / "REPORT.md")

    args = parser.parse_args(argv)
    config_path = args.config or next(
        p for p in (LAB_DIR / "lab.yaml", LAB_DIR / "lab.example.yaml") if p.exists()
    )
    config = load_config(config_path)

    if args.command == "validate":
        report = validate(config.datasets_dir)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if all(not p for p in report.values()) else 1
    if args.command == "stats":
        print(json.dumps(stats(config.datasets_dir), ensure_ascii=False, indent=2))
    elif args.command == "import":
        count = import_samples(config.datasets_dir, args.dialect, args.refs, args.audio_dir)
        print(f"imported {count} samples into {args.dialect}")
    elif args.command == "asr":
        print(asr_bench.write(asr_bench.run(config, _ids(args.providers)), config.output_dir))
    elif args.command == "tts":
        sentences = tts_bench.load_sentences(args.sentences)
        genders = tuple(_ids(args.genders) or tts_bench.GENDERS)
        print(tts_bench.generate(config, sentences, genders, _ids(args.providers)))
    elif args.command == "listening-page":
        print(tts_bench.build_listening_page(config, tts_bench.load_sentences(args.sentences)))
    elif args.command == "mos":
        result = tts_bench.aggregate_dir(config, args.ratings)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "latency":
        results = latency.run(
            config, _ids(args.asr), _ids(args.llm), _ids(args.tts), args.max_turns
        )
        print(latency.write(results, config.output_dir))
    elif args.command == "report":
        args.out.write_text(build_report(config.output_dir, config.datasets_dir), encoding="utf-8")
        print(args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
