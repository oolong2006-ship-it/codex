"""Minimal WAV helpers (stdlib only)."""

from __future__ import annotations

import io
import math
import struct
import wave
from pathlib import Path


def wav_duration_seconds(path: Path) -> float | None:
    """Duration for PCM WAV files; None for other formats or unreadable files."""
    try:
        with wave.open(str(path), "rb") as w:
            return w.getnframes() / float(w.getframerate())
    except (wave.Error, EOFError, OSError):
        return None


def tone_wav(seconds: float, freq_hz: float = 220.0, rate: int = 16000) -> bytes:
    """A quiet sine tone; used by the mock TTS so the listening page has playable audio."""
    frames = int(seconds * rate)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(
            b"".join(
                struct.pack("<h", int(3000 * math.sin(2 * math.pi * freq_hz * i / rate)))
                for i in range(frames)
            )
        )
    return buf.getvalue()
