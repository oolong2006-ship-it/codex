"""TTS adapters. Every adapter returns WAV bytes; streaming ones also expose chunks."""

from __future__ import annotations

import io
import shlex
import subprocess
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any, Protocol

from ..audio import tone_wav
from ._http import auth_headers, post_json


class TtsAdapter(Protocol):
    def synthesize(self, text: str, voice_gender: str) -> bytes: ...

    def stream(self, text: str, voice_gender: str) -> Iterator[bytes]: ...


class _WholeFileStream:
    """Default stream(): non-streaming engines yield the full file as one chunk."""

    def stream(self, text: str, voice_gender: str) -> Iterator[bytes]:
        yield self.synthesize(text, voice_gender)  # type: ignore[attr-defined]


class MockTts(_WholeFileStream):
    def __init__(self, options: dict[str, Any]):
        self.delay = float(options.get("delay_ms", 0)) / 1000
        self.freq = float(options.get("freq_hz", 220))

    def synthesize(self, text: str, voice_gender: str) -> bytes:
        if self.delay:
            time.sleep(self.delay)
        freq = self.freq * (1.5 if voice_gender == "female" else 1.0)
        return tone_wav(min(4.0, 0.25 * max(1, len(text.split()))), freq)


class ChatterboxTts(_WholeFileStream):
    """Local Chatterbox multilingual. options: device, voices: {male: wav, female: wav}."""

    def __init__(self, options: dict[str, Any]):
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # type: ignore[import-not-found]

        self.model = ChatterboxMultilingualTTS.from_pretrained(device=options.get("device", "cpu"))
        self.voices = options.get("voices") or {}

    def synthesize(self, text: str, voice_gender: str) -> bytes:
        import torchaudio  # type: ignore[import-not-found]

        prompt = self.voices.get(voice_gender)
        wav = self.model.generate(text, language_id="ar", audio_prompt_path=prompt)
        buf = io.BytesIO()
        torchaudio.save(buf, wav, self.model.sr, format="wav")
        return buf.getvalue()


class CommandTts(_WholeFileStream):
    """Runs any local TTS CLI. options: command (with {out} and {gender}); text goes to stdin.

    Example (Piper): command: "piper --model voices/{gender}.onnx --output_file {out}"
    """

    def __init__(self, options: dict[str, Any]):
        self.command = options["command"]
        self.timeout = float(options.get("timeout_s", 120))

    def synthesize(self, text: str, voice_gender: str) -> bytes:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "out.wav"
            cmd = self.command.format(out=shlex.quote(str(out)), gender=voice_gender)
            subprocess.run(
                shlex.split(cmd), input=text.encode("utf-8"), check=True, timeout=self.timeout
            )
            return out.read_bytes()


class OpenAiCompatibleTts:
    """Self-hosted server exposing /v1/audio/speech. options: base_url, model, voices."""

    def __init__(self, options: dict[str, Any]):
        self.url = options["base_url"].rstrip("/") + "/v1/audio/speech"
        self.model = options.get("model", "")
        self.voices = options.get("voices") or {}
        self.timeout = float(options.get("timeout_s", 60))
        self.headers = auth_headers(options)

    def stream(self, text: str, voice_gender: str) -> Iterator[bytes]:
        body = {
            "model": self.model,
            "input": text,
            "voice": self.voices.get(voice_gender, voice_gender),
            "response_format": "wav",
        }
        with post_json(self.url, body, self.headers, self.timeout) as resp:
            while chunk := resp.read(4096):
                yield chunk

    def synthesize(self, text: str, voice_gender: str) -> bytes:
        return b"".join(self.stream(text, voice_gender))


ADAPTERS = {
    "mock": MockTts,
    "chatterbox": ChatterboxTts,
    "command": CommandTts,
    "openai-compatible": OpenAiCompatibleTts,
}
