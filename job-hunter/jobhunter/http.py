"""Tiny stdlib HTTP helper with retries (keeps the tool dependency-light)."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request

USER_AGENT = "job-hunter/1.0 (personal job search tool)"


class HttpError(RuntimeError):
    pass


def request_json(url: str, *, params: dict | None = None, body: dict | None = None,
                 timeout: int = 30, retries: int = 3):
    if params:
        url = f"{url}{'&' if '?' in url else '?'}{urllib.parse.urlencode(params)}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    last: Exception | None = None
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code < 500 and exc.code != 429:
                break  # client error: retrying will not help
        except (urllib.error.URLError, TimeoutError) as exc:
            last = exc
        time.sleep(2 ** attempt)
    # Never echo the URL: it can carry an API key in its query string.
    raise HttpError(f"request failed: {type(last).__name__}: {getattr(last, 'code', '')}")
