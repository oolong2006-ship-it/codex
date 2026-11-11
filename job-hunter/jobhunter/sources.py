"""Job sources. Each fetcher returns a list[Job] and never raises on a bad feed:
one failing source must not stop the daily run.

Only sources that allow programmatic access are used:
- Google Jobs through SerpAPI (aggregates LinkedIn, Bayt, Indeed, GulfTalent,
  company sites...) - needs SERPAPI_KEY.
- Jooble's public API - needs JOOBLE_KEY.
- Greenhouse and Lever public job-board APIs - no key, per-company.
"""

from __future__ import annotations

import html
import os
import re
import sys

from .http import HttpError, request_json
from .models import Job
from .profile import Profile


def _strip_html(text: str) -> str:
    text = html.unescape(text or "")
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _warn(msg: str) -> None:
    print(f"[warn] {msg}", file=sys.stderr)


# --- Google Jobs via SerpAPI -------------------------------------------------

def parse_serpapi(payload: dict) -> list[Job]:
    jobs = []
    for r in payload.get("jobs_results", []):
        options = r.get("apply_options") or []
        url = options[0]["link"] if options else r.get("share_link", "")
        ext = r.get("detected_extensions") or {}
        jobs.append(Job(
            title=r.get("title", ""),
            company=r.get("company_name", ""),
            location=r.get("location", ""),
            url=url,
            description=r.get("description", ""),
            source="google_jobs",
            posted=ext.get("posted_at", ""),
            via=r.get("via", ""),
            extra={"apply_options": [o.get("link") for o in options[:3]]},
        ))
    return jobs


def fetch_serpapi(profile: Profile, pages: int = 1) -> list[Job]:
    key = os.environ.get("SERPAPI_KEY")
    if not key:
        return []
    out: list[Job] = []
    for query in profile.queries:
        for location in profile.locations:
            params = {"engine": "google_jobs", "q": query, "location": location,
                      "gl": profile.country_code, "hl": "en", "api_key": key}
            for _ in range(pages):
                try:
                    payload = request_json("https://serpapi.com/search.json", params=params)
                except HttpError as exc:
                    _warn(f"google_jobs '{query}': {exc}")
                    break
                out.extend(parse_serpapi(payload))
                token = (payload.get("serpapi_pagination") or {}).get("next_page_token")
                if not token:
                    break
                params["next_page_token"] = token
    return out


# --- Jooble ------------------------------------------------------------------

def parse_jooble(payload: dict) -> list[Job]:
    return [Job(
        title=_strip_html(r.get("title", "")),
        company=r.get("company", ""),
        location=r.get("location", ""),
        url=r.get("link", ""),
        description=_strip_html(r.get("snippet", "")),
        source="jooble",
        posted=(r.get("updated") or "")[:10],
        via=r.get("source", ""),
    ) for r in payload.get("jobs", [])]


def fetch_jooble(profile: Profile) -> list[Job]:
    key = os.environ.get("JOOBLE_KEY")
    if not key:
        return []
    out: list[Job] = []
    for query in profile.queries:
        for location in profile.locations:
            try:
                payload = request_json(f"https://jooble.org/api/{key}",
                                       body={"keywords": query, "location": location})
            except HttpError as exc:
                _warn(f"jooble '{query}': {exc}")
                continue
            out.extend(parse_jooble(payload))
    return out


# --- Greenhouse / Lever company boards ---------------------------------------

def parse_greenhouse(payload: dict, board: str) -> list[Job]:
    return [Job(
        title=r.get("title", ""),
        company=board,
        location=(r.get("location") or {}).get("name", ""),
        url=r.get("absolute_url", ""),
        description=_strip_html(r.get("content", "")),
        source="greenhouse",
        posted=(r.get("updated_at") or "")[:10],
    ) for r in payload.get("jobs", [])]


def parse_lever(payload: list, company: str) -> list[Job]:
    return [Job(
        title=r.get("text", ""),
        company=company,
        location=(r.get("categories") or {}).get("location", ""),
        url=r.get("hostedUrl", ""),
        description=r.get("descriptionPlain", ""),
        source="lever",
    ) for r in payload]


def fetch_boards(profile: Profile) -> list[Job]:
    out: list[Job] = []
    for board in profile.greenhouse_boards:
        try:
            out.extend(parse_greenhouse(request_json(
                f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs",
                params={"content": "true"}), board))
        except HttpError as exc:
            _warn(f"greenhouse {board}: {exc}")
    for company in profile.lever_companies:
        try:
            out.extend(parse_lever(request_json(
                f"https://api.lever.co/v0/postings/{company}", params={"mode": "json"}), company))
        except HttpError as exc:
            _warn(f"lever {company}: {exc}")
    return out


FETCHERS = {"google_jobs": fetch_serpapi, "jooble": fetch_jooble, "boards": fetch_boards}


def fetch_all(profile: Profile, names: list[str] | None = None) -> list[Job]:
    jobs: list[Job] = []
    for name, fn in FETCHERS.items():
        if names and name not in names:
            continue
        found = fn(profile)
        print(f"[source] {name}: {len(found)}", file=sys.stderr)
        jobs.extend(found)
    return jobs
