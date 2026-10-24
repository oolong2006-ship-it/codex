from pathlib import Path

import pytest

from majlis_voice_lab.config import ConfigError, load_config, parse_config
from majlis_voice_lab.providers import build

LAB_DIR = Path(__file__).resolve().parent.parent


@pytest.mark.parametrize("location", ["abroad", "eu-west", None])
def test_rejects_providers_outside_the_kingdom(location) -> None:
    raw = {"asr": [{"id": "x", "adapter": "mock", "location": location}]}
    with pytest.raises(ConfigError, match="inside the Kingdom"):
        parse_config(raw, Path("."))


def test_rejects_inline_secrets() -> None:
    raw = {
        "llm": [{"id": "x", "adapter": "mock", "location": "local", "options": {"api_key": "s"}}]
    }
    with pytest.raises(ConfigError, match="api_key_env"):
        parse_config(raw, Path("."))


def test_rejects_duplicate_ids_and_unknown_adapters() -> None:
    dup = {"asr": [{"id": "x", "adapter": "mock", "location": "local"}] * 2}
    with pytest.raises(ConfigError, match="duplicate"):
        parse_config(dup, Path("."))
    cfg = parse_config({"tts": [{"id": "y", "adapter": "nope", "location": "local"}]}, Path("."))
    with pytest.raises(ConfigError, match="unknown tts adapter"):
        build(cfg.get("y"))


def test_example_config_is_valid() -> None:
    cfg = load_config(LAB_DIR / "lab.example.yaml")
    assert {p.kind for p in cfg.providers} == {"asr", "tts", "llm"}
    assert all(p.location in ("local", "in-kingdom") for p in cfg.providers)
