"""Loads the personal search profile.

The profile holds personal data (CV text, targets), so it is never committed:
it is read from the JOBHUNTER_PROFILE_JSON env var (a CI secret) or from a
local file that is git-ignored.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Profile:
    name: str
    queries: list[str]
    locations: list[str]
    title_keywords: list[str]
    skill_keywords: list[str]
    exclude_keywords: list[str] = field(default_factory=list)
    preferred_locations: list[str] = field(default_factory=list)
    cv_text: str = ""
    min_rule_score: int = 35
    min_notify_score: int = 60
    max_ai_jobs: int = 25
    greenhouse_boards: list[str] = field(default_factory=list)
    lever_companies: list[str] = field(default_factory=list)
    country_code: str = "sa"
    language: str = "ar"


def load_profile(path: str | None = None) -> Profile:
    raw = os.environ.get("JOBHUNTER_PROFILE_JSON")
    if raw:
        data = json.loads(raw)
    else:
        p = Path(path or os.environ.get("JOBHUNTER_PROFILE", "profile.json"))
        if not p.exists():
            raise SystemExit(
                f"لم يُعثر على ملف الملف المهني: {p}. انسخ profile.example.json إلى profile.json وعدّله."
            )
        data = json.loads(p.read_text(encoding="utf-8"))
    known = Profile.__dataclass_fields__.keys()
    return Profile(**{k: v for k, v in data.items() if k in known})
