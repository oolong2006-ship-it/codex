"""Adapter registry: builds an adapter instance from a ProviderSpec."""

from __future__ import annotations

from typing import Any

from ..config import ConfigError, ProviderSpec
from . import asr, llm, tts

_REGISTRIES: dict[str, dict[str, Any]] = {
    "asr": asr.ADAPTERS,
    "tts": tts.ADAPTERS,
    "llm": llm.ADAPTERS,
}


def build(spec: ProviderSpec) -> Any:
    registry = _REGISTRIES[spec.kind]
    cls = registry.get(spec.adapter)
    if cls is None:
        raise ConfigError(
            f"{spec.id}: unknown {spec.kind} adapter {spec.adapter!r}; available: {sorted(registry)}"
        )
    return cls(spec.options)
