"""LLM adapters used by the latency benchmark (interviewer quality is tested in phase 2)."""

from __future__ import annotations

import json
import time
from collections.abc import Iterator
from typing import Any, Protocol

from ._http import auth_headers, iter_sse_data, post_json


class LlmAdapter(Protocol):
    def stream(self, messages: list[dict[str, str]]) -> Iterator[str]: ...


class MockLlm:
    def __init__(self, options: dict[str, Any]):
        self.first_token_delay = float(options.get("first_token_ms", 0)) / 1000
        self.reply = options.get("reply", "إيه، فاهم عليك. وش اللي خلاك تختار هالمطعم؟")

    def stream(self, messages: list[dict[str, str]]) -> Iterator[str]:
        if self.first_token_delay:
            time.sleep(self.first_token_delay)
        for token in self.reply.split(" "):
            yield token + " "


class OpenAiCompatibleLlm:
    """Self-hosted chat server (vLLM, TGI, llama.cpp) at /v1/chat/completions."""

    def __init__(self, options: dict[str, Any]):
        self.url = options["base_url"].rstrip("/") + "/v1/chat/completions"
        self.model = options.get("model", "")
        self.max_tokens = int(options.get("max_tokens", 120))
        self.temperature = float(options.get("temperature", 0.6))
        self.timeout = float(options.get("timeout_s", 30))
        self.headers = auth_headers(options)

    def stream(self, messages: list[dict[str, str]]) -> Iterator[str]:
        body = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
        }
        with post_json(self.url, body, self.headers, self.timeout) as resp:
            for payload in iter_sse_data(resp):
                choices = json.loads(payload).get("choices") or [{}]
                delta = (choices[0].get("delta") or {}).get("content")
                if delta:
                    yield delta


ADAPTERS = {"mock": MockLlm, "openai-compatible": OpenAiCompatibleLlm}
