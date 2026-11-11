"""Fast, free, keyword-based pre-filter. Runs on every job; only the jobs that
pass it are sent to the (paid) AI ranking step."""

from __future__ import annotations

from .models import Job, normalize
from .profile import Profile


def _hits(text: str, words: list[str]) -> list[str]:
    padded = f" {text} "
    return [w for w in words if f" {normalize(w)} " in padded]


def rule_score(job: Job, profile: Profile) -> int:
    title = normalize(job.title)
    body = normalize(f"{job.title} {job.description}")
    if _hits(title, profile.exclude_keywords):
        return 0
    score = 0
    title_hits = _hits(title, profile.title_keywords)
    if title_hits:
        score += 45 + min(15, 5 * (len(title_hits) - 1))
    skills = _hits(body, profile.skill_keywords)
    score += min(30, 4 * len(skills))
    location = normalize(job.location)
    if any(normalize(p) in location for p in profile.preferred_locations):
        score += 10
    return min(100, score)


def dedupe(jobs: list[Job]) -> list[Job]:
    """Same posting on several boards: keep the copy with the longest description."""
    best: dict[str, Job] = {}
    for job in jobs:
        if not job.title or not job.url:
            continue
        cur = best.get(job.key)
        if cur is None or len(job.description) > len(cur.description):
            best[job.key] = job
    return list(best.values())


def prefilter(jobs: list[Job], profile: Profile) -> list[Job]:
    kept = []
    for job in dedupe(jobs):
        job.rule_score = rule_score(job, profile)
        if job.rule_score >= profile.min_rule_score:
            kept.append(job)
    return sorted(kept, key=lambda j: j.rule_score, reverse=True)
