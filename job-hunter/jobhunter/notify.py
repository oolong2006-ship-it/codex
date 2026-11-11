"""Telegram digest."""

from __future__ import annotations

import html
import os
import sys

from .http import HttpError, request_json
from .models import Job

TELEGRAM_LIMIT = 4000  # API max is 4096; keep a margin


def _badge(score: int) -> str:
    return "🟢" if score >= 80 else "🟡" if score >= 65 else "⚪"


def format_job(job: Job) -> str:
    e = html.escape
    lines = [f"{_badge(job.score)} <b>{e(job.title)}</b> — {job.score}%",
             f"🏢 {e(job.company or '-')} · 📍 {e(job.location or '-')}"]
    meta = " · ".join(x for x in (job.via, job.posted) if x)
    if meta:
        lines.append(f"🔎 {e(meta)}")
    if job.ai_summary:
        lines.append(f"✅ {e(job.ai_summary)}")
    if job.ai_gaps:
        lines.append(f"⚠️ {e(job.ai_gaps)}")
    lines.append(f'<a href="{e(job.url, quote=True)}">رابط التقديم</a> · <code>{job.key}</code>')
    return "\n".join(lines)


def build_messages(jobs: list[Job], total_new: int) -> list[str]:
    header = (f"📋 <b>وظائف جديدة تناسبك اليوم: {len(jobs)}</b>\n"
              f"(من أصل {total_new} وظيفة جديدة تمت مراجعتها)\n")
    if not jobs:
        return [header + "\nلا توجد وظائف مطابقة جديدة اليوم."]
    messages, cur = [], header
    for job in jobs:
        block = "\n" + format_job(job) + "\n"
        if len(cur) + len(block) > TELEGRAM_LIMIT:
            messages.append(cur)
            cur = ""
        cur += block
    messages.append(cur)
    return messages


def send_telegram(messages: list[str]) -> bool:
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        print("[warn] Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)", file=sys.stderr)
        return False
    ok = True
    for text in messages:
        try:
            request_json(f"https://api.telegram.org/bot{token}/sendMessage", body={
                "chat_id": chat, "text": text, "parse_mode": "HTML",
                "disable_web_page_preview": True})
        except HttpError as exc:
            print(f"[warn] telegram: {exc}", file=sys.stderr)
            ok = False
    return ok
