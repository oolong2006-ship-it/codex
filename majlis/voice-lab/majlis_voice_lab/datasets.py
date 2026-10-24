"""Dataset layout validation.

Expected layout per dialect:

    datasets/<dialect>/manifest.csv   columns: id,audio,reference
    datasets/<dialect>/audio/<file>   audio files referenced by the manifest
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from . import DIALECTS

REQUIRED_COLUMNS = ("id", "audio", "reference")


@dataclass(frozen=True)
class Sample:
    id: str
    audio: Path
    reference: str


def load_manifest(dialect_dir: Path) -> list[Sample]:
    manifest = dialect_dir / "manifest.csv"
    with manifest.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        missing = [c for c in REQUIRED_COLUMNS if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"{manifest}: missing columns {missing}")
        samples = []
        for row in reader:
            reference = (row["reference"] or "").strip()
            if not reference:
                raise ValueError(f"{manifest}: empty reference for id={row['id']}")
            samples.append(Sample(row["id"], dialect_dir / "audio" / row["audio"], reference))
    return samples


def validate(root: Path) -> dict[str, list[str]]:
    """Returns problems per dialect; an empty list means the dialect is ready."""
    report: dict[str, list[str]] = {}
    for dialect in DIALECTS:
        problems: list[str] = []
        d = root / dialect
        if not (d / "manifest.csv").exists():
            problems.append("manifest.csv not found")
        else:
            try:
                for s in load_manifest(d):
                    if not s.audio.exists():
                        problems.append(f"missing audio: {s.audio.name}")
            except ValueError as e:
                problems.append(str(e))
        report[dialect] = problems
    return report
