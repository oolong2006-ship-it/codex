"""SQLite tracker: remembers every job seen so each one is sent only once,
and tracks what you did with it (applied, interview, ...)."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .models import Job

STATUSES = {
    "new": "جديدة",
    "notified": "أُرسلت لك",
    "applied": "قدّمت",
    "interview": "مقابلة",
    "offer": "عرض وظيفي",
    "rejected": "مرفوض",
    "skipped": "تجاهلتها",
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
  key TEXT PRIMARY KEY,
  title TEXT, company TEXT, location TEXT, url TEXT, source TEXT, via TEXT,
  posted TEXT, description TEXT,
  rule_score INTEGER, ai_score INTEGER, ai_summary TEXT, ai_gaps TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  first_seen TEXT, updated TEXT, extra TEXT
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: str | Path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path))
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)

    def known_keys(self) -> set[str]:
        return {r[0] for r in self.db.execute("SELECT key FROM jobs")}

    def add(self, job: Job) -> None:
        self.db.execute(
            """INSERT OR IGNORE INTO jobs (key,title,company,location,url,source,via,posted,
               description,rule_score,ai_score,ai_summary,ai_gaps,status,first_seen,updated,extra)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'new', ?, ?, ?)""",
            (job.key, job.title, job.company, job.location, job.url, job.source, job.via,
             job.posted, job.description, job.rule_score, job.ai_score, job.ai_summary,
             job.ai_gaps, _now(), _now(), json.dumps(job.extra, ensure_ascii=False)))
        self.db.commit()

    def set_status(self, key: str, status: str) -> bool:
        if status not in STATUSES:
            raise ValueError(f"حالة غير معروفة: {status}. المتاح: {', '.join(STATUSES)}")
        cur = self.db.execute("UPDATE jobs SET status=?, updated=? WHERE key=?", (status, _now(), key))
        self.db.commit()
        return cur.rowcount > 0

    def get(self, key: str) -> Job | None:
        row = self.db.execute("SELECT * FROM jobs WHERE key=?", (key,)).fetchone()
        return _row_to_job(row) if row else None

    def rows(self, status: str | None = None, limit: int = 200) -> list[sqlite3.Row]:
        q = "SELECT * FROM jobs"
        args: tuple = ()
        if status:
            q += " WHERE status=?"
            args = (status,)
        q += " ORDER BY COALESCE(ai_score, rule_score) DESC, first_seen DESC LIMIT ?"
        return list(self.db.execute(q, args + (limit,)))


def _row_to_job(row: sqlite3.Row) -> Job:
    return Job(title=row["title"], company=row["company"], location=row["location"],
               url=row["url"], description=row["description"] or "", source=row["source"],
               posted=row["posted"] or "", via=row["via"] or "", rule_score=row["rule_score"] or 0,
               ai_score=row["ai_score"], ai_summary=row["ai_summary"] or "",
               ai_gaps=row["ai_gaps"] or "", extra=json.loads(row["extra"] or "{}"))
