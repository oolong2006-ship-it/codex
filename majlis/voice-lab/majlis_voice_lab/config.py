"""Lab configuration (lab.yaml) and the data-residency policy.

Policy (approved): only self-hosted models running inside the Kingdom, or on
the local machine, may receive participant audio. Every provider entry must
declare its location; anything else is rejected before a single file is sent.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

ALLOWED_LOCATIONS = ("local", "in-kingdom")


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class ProviderSpec:
    id: str
    kind: str  # asr | tts | llm
    adapter: str
    location: str
    license: str
    options: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class LabConfig:
    datasets_dir: Path
    output_dir: Path
    providers: tuple[ProviderSpec, ...]

    def of_kind(self, kind: str) -> list[ProviderSpec]:
        return [p for p in self.providers if p.kind == kind]

    def get(self, provider_id: str) -> ProviderSpec:
        for p in self.providers:
            if p.id == provider_id:
                return p
        raise ConfigError(f"unknown provider id: {provider_id}")


def parse_config(raw: dict[str, Any], base_dir: Path) -> LabConfig:
    specs: list[ProviderSpec] = []
    seen: set[str] = set()
    for kind in ("asr", "tts", "llm"):
        for entry in raw.get(kind) or []:
            pid = entry.get("id")
            if not pid:
                raise ConfigError(f"{kind}: every provider needs an id")
            if pid in seen:
                raise ConfigError(f"duplicate provider id: {pid}")
            seen.add(pid)
            location = entry.get("location")
            if location not in ALLOWED_LOCATIONS:
                raise ConfigError(
                    f"{pid}: location must be one of {ALLOWED_LOCATIONS} "
                    f"(got {location!r}). Only self-hosted models inside the Kingdom are allowed."
                )
            if "api_key" in entry or "api_key" in (entry.get("options") or {}):
                raise ConfigError(
                    f"{pid}: put secrets in an env var and reference it via api_key_env"
                )
            specs.append(
                ProviderSpec(
                    id=pid,
                    kind=kind,
                    adapter=entry.get("adapter") or "",
                    location=location,
                    license=entry.get("license") or "unverified",
                    options=dict(entry.get("options") or {}),
                )
            )
    return LabConfig(
        datasets_dir=(base_dir / raw.get("datasets_dir", "datasets")).resolve(),
        output_dir=(base_dir / raw.get("output_dir", "output")).resolve(),
        providers=tuple(specs),
    )


def load_config(path: Path) -> LabConfig:
    with path.open(encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    return parse_config(raw, path.parent)
