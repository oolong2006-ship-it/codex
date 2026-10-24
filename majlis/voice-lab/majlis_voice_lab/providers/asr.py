"""ASR adapters. Heavy model libraries are imported lazily, only when used."""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from ._http import auth_headers, post_multipart


@dataclass(frozen=True)
class Transcription:
    text: str
    confidence: float | None = None


class AsrAdapter(Protocol):
    def transcribe(self, audio: Path) -> Transcription: ...


class MockAsr:
    """Returns the content of `<audio>.mock.txt` if present. For pipeline tests only."""

    def __init__(self, options: dict[str, Any]):
        self.delay = float(options.get("delay_ms", 0)) / 1000

    def transcribe(self, audio: Path) -> Transcription:
        if self.delay:
            time.sleep(self.delay)
        sidecar = audio.with_name(audio.name + ".mock.txt")
        text = sidecar.read_text(encoding="utf-8").strip() if sidecar.exists() else ""
        return Transcription(text, 1.0 if text else 0.0)


class FasterWhisperAsr:
    """Local faster-whisper (CTranslate2). options: model, device, compute_type, beam_size."""

    def __init__(self, options: dict[str, Any]):
        from faster_whisper import WhisperModel  # type: ignore[import-not-found]

        self.model = WhisperModel(
            options.get("model", "large-v3"),
            device=options.get("device", "auto"),
            compute_type=options.get("compute_type", "default"),
        )
        self.beam_size = int(options.get("beam_size", 5))
        self.initial_prompt = options.get("initial_prompt")

    def transcribe(self, audio: Path) -> Transcription:
        segments, _info = self.model.transcribe(
            str(audio), language="ar", beam_size=self.beam_size, initial_prompt=self.initial_prompt
        )
        segments = list(segments)
        text = " ".join(s.text.strip() for s in segments)
        conf = sum(math.exp(s.avg_logprob) for s in segments) / len(segments) if segments else None
        return Transcription(text, conf)


class TransformersAsr:
    """Any Hugging Face ASR checkpoint stored locally. options: model, device, generate_kwargs."""

    def __init__(self, options: dict[str, Any]):
        from transformers import pipeline  # type: ignore[import-not-found]

        self.pipe = pipeline(
            "automatic-speech-recognition",
            model=options["model"],
            device=options.get("device", -1),
        )
        self.generate_kwargs = options.get("generate_kwargs") or {}

    def transcribe(self, audio: Path) -> Transcription:
        kwargs = {"generate_kwargs": self.generate_kwargs} if self.generate_kwargs else {}
        out = self.pipe(str(audio), **kwargs)
        return Transcription(str(out["text"]).strip())


class OpenAiCompatibleAsr:
    """Self-hosted server exposing /v1/audio/transcriptions (e.g. vLLM, faster-whisper-server)."""

    def __init__(self, options: dict[str, Any]):
        self.url = options["base_url"].rstrip("/") + "/v1/audio/transcriptions"
        self.model = options.get("model", "")
        self.timeout = float(options.get("timeout_s", 60))
        self.headers = auth_headers(options)

    def transcribe(self, audio: Path) -> Transcription:
        body = post_multipart(
            self.url,
            {"model": self.model, "language": "ar", "response_format": "json"},
            "file",
            audio.name,
            audio.read_bytes(),
            self.headers,
            self.timeout,
        )
        return Transcription(str(body.get("text", "")).strip())


ADAPTERS = {
    "mock": MockAsr,
    "faster-whisper": FasterWhisperAsr,
    "transformers": TransformersAsr,
    "openai-compatible": OpenAiCompatibleAsr,
}
