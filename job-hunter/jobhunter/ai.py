"""Claude-powered ranking and application packs.

Optional: without ANTHROPIC_API_KEY the pipeline falls back to keyword scores.
The prompts forbid inventing experience - the tailored material may only
re-phrase and re-order what is in the CV.
"""

from __future__ import annotations

import os
import sys

from pydantic import BaseModel, Field

from .models import Job
from .profile import Profile

MODEL = "claude-opus-5-5"
# Server-side fallback: if the model declines a request, the API retries it on
# a fallback model inside the same call.
BETAS = ["server-side-fallback-2026-07-01"]

RANK_SYSTEM = """أنت مستشار توظيف خبير في سوق العمل السعودي.
تقيّم مدى ملاءمة وظيفة لمرشح بناءً على سيرته الذاتية فقط.
- كن صارماً وواقعياً: المستوى الوظيفي، القطاع، المدينة، والمتطلبات الإلزامية.
- لا تفترض خبرات غير مذكورة في السيرة.
- اكتب الملخص والفجوات بالعربية وباختصار (جملة أو جملتان)."""

PACK_SYSTEM = """أنت كاتب سير ذاتية محترف في السوق السعودي.
مهمتك تجهيز ملف تقديم لوظيفة محددة من سيرة المرشح.
قاعدة صارمة: لا تخترع أي خبرة أو رقم أو شهادة أو مهارة غير موجودة في السيرة.
مسموح فقط: إعادة الصياغة، إعادة الترتيب، إبراز الأنسب، واستخدام مصطلحات الإعلان
حين تصف خبرة موجودة فعلاً. إذا طلبت الوظيفة شيئاً غير موجود، اذكره في "gaps" فقط."""


class Rating(BaseModel):
    score: int = Field(description="0-100 fit score")
    summary: str = Field(description="Why it fits, Arabic, one or two sentences")
    gaps: str = Field(description="Main gaps or risks, Arabic, short; empty if none")


class ApplicationPack(BaseModel):
    cover_letter_ar: str
    cover_letter_en: str
    cv_headline: str = Field(description="Tailored professional headline")
    cv_summary: str = Field(description="Tailored 3-4 line professional summary, in the job ad's language")
    top_bullets: list[str] = Field(description="5-7 existing achievements re-phrased for this job")
    ats_keywords: list[str] = Field(description="Keywords from the ad that the CV genuinely supports")
    gaps: list[str] = Field(description="Requirements in the ad that the CV does not show")
    interview_tips: list[str] = Field(description="3 likely interview questions with angle to answer")


def available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def _client():
    import anthropic
    return anthropic.Anthropic()


def _job_text(job: Job, limit: int = 6000) -> str:
    return (f"المسمى: {job.title}\nالجهة: {job.company}\nالموقع: {job.location}\n"
            f"المصدر: {job.via or job.source}\n\nالوصف:\n{job.description[:limit]}")


def _system(prompt: str, profile: Profile) -> list[dict]:
    # The CV is identical across calls, so cache it.
    return [{"type": "text", "text": prompt},
            {"type": "text", "text": f"سيرة المرشح:\n{profile.cv_text}",
             "cache_control": {"type": "ephemeral"}}]


def _parse(client, *, system, content, output_format, effort, max_tokens):
    resp = client.beta.messages.parse(
        model=MODEL, max_tokens=max_tokens, betas=BETAS, fallbacks="default",
        system=system, output_config={"effort": effort},
        messages=[{"role": "user", "content": content}],
        output_format=output_format,
    )
    if resp.stop_reason == "refusal" or resp.parsed_output is None:
        return None
    return resp.parsed_output


def rank(jobs: list[Job], profile: Profile) -> None:
    """Adds ai_score/ai_summary/ai_gaps in place to the top jobs."""
    import anthropic
    client = _client()
    system = _system(RANK_SYSTEM, profile)
    for job in jobs[: profile.max_ai_jobs]:
        try:
            rating = _parse(client, system=system, content=_job_text(job),
                            output_format=Rating, effort="low", max_tokens=4000)
        except anthropic.RateLimitError:
            print("[warn] ai: rate limited, keeping keyword scores for the rest", file=sys.stderr)
            return
        except anthropic.APIError as exc:
            print(f"[warn] ai rank failed: {type(exc).__name__}", file=sys.stderr)
            continue
        if rating:
            job.ai_score = max(0, min(100, rating.score))
            job.ai_summary, job.ai_gaps = rating.summary, rating.gaps


def application_pack(job: Job, profile: Profile) -> ApplicationPack | None:
    return _parse(_client(), system=_system(PACK_SYSTEM, profile),
                  content=_job_text(job, limit=12000) + "\n\nجهّز ملف التقديم.",
                  output_format=ApplicationPack, effort="medium", max_tokens=16000)
