"""Dataset layout, validation and import.

Expected layout per dialect:

    datasets/<dialect>/manifest.csv   columns: id,audio,reference[,speaker,gender]
    datasets/<dialect>/audio/<file>   audio files referenced by the manifest
"""

from __future__ import annotations

import csv
import shutil
from dataclasses import dataclass
from pathlib import Path

from . import DIALECTS
from .audio import wav_duration_seconds

REQUIRED_COLUMNS = ("id", "audio", "reference")
OPTIONAL_COLUMNS = ("speaker", "gender")
AUDIO_EXTENSIONS = {".wav", ".flac", ".mp3", ".ogg", ".opus", ".m4a"}


@dataclass(frozen=True)
class Sample:
    id: str
    audio: Path
    reference: str
    speaker: str = ""
    gender: str = ""


def _check_dialect(dialect: str) -> None:
    if dialect not in DIALECTS:
        raise ValueError(f"unknown dialect {dialect!r}; expected one of {DIALECTS}")


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
            samples.append(
                Sample(
                    row["id"],
                    dialect_dir / "audio" / row["audio"],
                    reference,
                    (row.get("speaker") or "").strip(),
                    (row.get("gender") or "").strip(),
                )
            )
    return samples


def load_dialect(root: Path, dialect: str) -> list[Sample]:
    _check_dialect(dialect)
    d = root / dialect
    return load_manifest(d) if (d / "manifest.csv").exists() else []


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
                ids: set[str] = set()
                for s in load_manifest(d):
                    if s.id in ids:
                        problems.append(f"duplicate id: {s.id}")
                    ids.add(s.id)
                    if not s.audio.exists():
                        problems.append(f"missing audio: {s.audio.name}")
            except ValueError as e:
                problems.append(str(e))
        report[dialect] = problems
    return report


def stats(root: Path) -> dict[str, dict[str, float | int | None]]:
    """Sample count, speakers and total WAV duration per dialect."""
    out: dict[str, dict[str, float | int | None]] = {}
    for dialect in DIALECTS:
        samples = load_dialect(root, dialect)
        durations = [wav_duration_seconds(s.audio) for s in samples if s.audio.exists()]
        known = [d for d in durations if d is not None]
        out[dialect] = {
            "samples": len(samples),
            "speakers": len({s.speaker for s in samples if s.speaker}),
            "wav_minutes": round(sum(known) / 60, 2) if known else None,
        }
    return out


def import_samples(root: Path, dialect: str, refs_csv: Path, audio_dir: Path) -> int:
    """Copies audio + references into datasets/<dialect>/ and appends to its manifest.

    refs_csv columns: audio,reference[,id,speaker,gender]. All rows are checked
    before anything is copied, so a bad file leaves the dataset untouched.
    """
    _check_dialect(dialect)
    target = root / dialect
    existing = load_dialect(root, dialect)
    used_ids = {s.id for s in existing}
    used_audio = {s.audio.name for s in existing}

    with refs_csv.open(encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))

    errors: list[str] = []
    planned: list[dict[str, str]] = []
    for n, row in enumerate(rows, start=2):
        audio_name = (row.get("audio") or "").strip()
        reference = (row.get("reference") or "").strip()
        sid = (row.get("id") or "").strip() or f"{dialect}-{len(existing) + len(planned) + 1:05d}"
        src = audio_dir / audio_name
        if not audio_name or not src.is_file():
            errors.append(f"line {n}: audio file not found: {audio_name!r}")
        elif src.suffix.lower() not in AUDIO_EXTENSIONS:
            errors.append(f"line {n}: unsupported audio type {src.suffix}")
        if not reference:
            errors.append(f"line {n}: empty reference")
        if sid in used_ids:
            errors.append(f"line {n}: duplicate id {sid}")
        if audio_name in used_audio:
            errors.append(f"line {n}: duplicate audio name {audio_name}")
        used_ids.add(sid)
        used_audio.add(audio_name)
        planned.append(
            {
                "id": sid,
                "audio": audio_name,
                "reference": reference,
                "speaker": (row.get("speaker") or "").strip(),
                "gender": (row.get("gender") or "").strip(),
            }
        )
    if errors:
        raise ValueError("import aborted, nothing was copied:\n" + "\n".join(errors))

    (target / "audio").mkdir(parents=True, exist_ok=True)
    manifest = target / "manifest.csv"
    new_file = not manifest.exists()
    for row in planned:
        shutil.copy2(audio_dir / row["audio"], target / "audio" / row["audio"])
    with manifest.open("a", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=[*REQUIRED_COLUMNS, *OPTIONAL_COLUMNS])
        if new_file:
            writer.writeheader()
        writer.writerows(planned)
    return len(planned)
