from pathlib import Path

from majlis_voice_lab.datasets import load_manifest, validate


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def test_valid_dialect_has_no_problems(tmp_path: Path) -> None:
    write(tmp_path / "najdi/manifest.csv", "id,audio,reference\n1,a.wav,وش رايك بالطلب\n")
    write(tmp_path / "najdi/audio/a.wav", "")
    report = validate(tmp_path)
    assert report["najdi"] == []
    assert report["hijazi"] == ["manifest.csv not found"]


def test_reports_missing_audio(tmp_path: Path) -> None:
    write(tmp_path / "eastern/manifest.csv", "id,audio,reference\n1,x.wav,شنو تبي\n")
    assert validate(tmp_path)["eastern"] == ["missing audio: x.wav"]


def test_rejects_empty_reference(tmp_path: Path) -> None:
    write(tmp_path / "southern/manifest.csv", "id,audio,reference\n1,x.wav,\n")
    try:
        load_manifest(tmp_path / "southern")
    except ValueError as e:
        assert "empty reference" in str(e)
    else:
        raise AssertionError("expected ValueError")
