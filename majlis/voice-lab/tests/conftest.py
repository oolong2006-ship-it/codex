from pathlib import Path

import pytest

from majlis_voice_lab.audio import tone_wav
from majlis_voice_lab.config import LabConfig, parse_config


def write(path: Path, data: str | bytes) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, bytes):
        path.write_bytes(data)
    else:
        path.write_text(data, encoding="utf-8")
    return path


@pytest.fixture
def lab(tmp_path: Path) -> LabConfig:
    """A lab with mock providers and a tiny najdi dataset whose mock ASR output is known."""
    rows = [
        ("n1", "وش رايك بالطلب", "وش رايك بالطلب"),  # perfect
        ("n2", "الأكل كان زين بس التوصيل تأخر", "الاكل كان زين بس التوصيل"),  # 1 deletion
        ("n3", "دفعت خمسة وعشرين ريال", "دفعت خمسه وعشرين ريال"),  # equal after normalization
    ]
    manifest = "id,audio,reference,speaker,gender\n"
    for sid, ref, hyp in rows:
        write(tmp_path / f"datasets/najdi/audio/{sid}.wav", tone_wav(0.5))
        write(tmp_path / f"datasets/najdi/audio/{sid}.wav.mock.txt", hyp)
        manifest += f"{sid},{sid}.wav,{ref},spk{sid},male\n"
    write(tmp_path / "datasets/najdi/manifest.csv", manifest)
    mock = {"location": "local", "license": "n/a"}
    return parse_config(
        {
            "asr": [{"id": "asr-a", "adapter": "mock", **mock}],
            "tts": [
                {"id": "tts-a", "adapter": "mock", **mock},
                {"id": "tts-b", "adapter": "mock", **mock, "options": {"freq_hz": 330}},
            ],
            "llm": [{"id": "llm-a", "adapter": "mock", **mock}],
        },
        tmp_path,
    )
