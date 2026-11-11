"""Core data types shared by every stage of the pipeline."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field


def _norm(text: str) -> str:
    text = (text or "").lower()
    text = re.sub(r"[ً-ْـ]", "", text)  # Arabic diacritics + tatweel
    text = re.sub(r"[أإآ]", "ا", text)
    text = text.replace("ة", "ه").replace("ى", "ي")
    tokens = re.sub(r"[^\w]+", " ", text).split()
    # Drop the Arabic definite article (and its و/ب/ل/ف forms) so that
    # "المشتريات" matches "مشتريات".
    tokens = [re.sub(r"^(?:[وبفل]?ال|لل)(?=\w{2,})", "", t) for t in tokens]
    return " ".join(tokens)


@dataclass
class Job:
    title: str
    company: str
    location: str
    url: str
    description: str = ""
    source: str = ""
    posted: str = ""
    via: str = ""
    # Filled in by scoring.
    rule_score: int = 0
    ai_score: int | None = None
    ai_summary: str = ""
    ai_gaps: str = ""
    extra: dict = field(default_factory=dict)

    @property
    def key(self) -> str:
        """Stable id: the same posting syndicated on several boards collapses to one."""
        base = f"{_norm(self.title)}|{_norm(self.company)}"
        return hashlib.sha1(base.encode("utf-8")).hexdigest()[:12]

    @property
    def score(self) -> int:
        return self.ai_score if self.ai_score is not None else self.rule_score


normalize = _norm
