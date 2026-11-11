"""Self-contained Arabic (RTL) HTML report of the tracker."""

from __future__ import annotations

import html
from datetime import datetime

from .store import STATUSES

CSS = """
:root{--bg:#f7f7f5;--card:#fff;--fg:#1d1d1b;--mut:#6b6b66;--line:#e4e4df;--acc:#0b6e4f}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1e1e1c;--fg:#ecece8;--mut:#a0a09a;--line:#33332f;--acc:#3fbf8f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);
font:15px/1.6 system-ui,"Segoe UI",Tahoma,sans-serif;padding:16px}
main{max-width:900px;margin:auto}h1{font-size:22px;margin:4px 0}
.sub{color:var(--mut);margin-bottom:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin:10px 0}
.top{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.t{font-weight:700}.s{font-weight:700;color:var(--acc);white-space:nowrap}
.m{color:var(--mut);font-size:13px}.g{color:#b0611a}a{color:var(--acc)}
code{font-size:12px;color:var(--mut)}
"""


def render(rows, title: str = "متتبع الوظائف") -> str:
    e = html.escape
    cards = []
    for r in rows:
        score = r["ai_score"] if r["ai_score"] is not None else r["rule_score"]
        parts = [f'<div class="top"><span class="t">{e(r["title"])}</span>'
                 f'<span class="s">{score}%</span></div>',
                 f'<div class="m">{e(r["company"] or "-")} · {e(r["location"] or "-")} · '
                 f'{e(r["via"] or r["source"] or "")} · الحالة: {STATUSES.get(r["status"], r["status"])}</div>']
        if r["ai_summary"]:
            parts.append(f"<div>{e(r['ai_summary'])}</div>")
        if r["ai_gaps"]:
            parts.append(f'<div class="g">⚠️ {e(r["ai_gaps"])}</div>')
        parts.append(f'<div><a href="{e(r["url"], quote=True)}" target="_blank" rel="noopener">'
                     f'رابط التقديم</a> · <code>{r["key"]}</code></div>')
        cards.append(f'<div class="card">{"".join(parts)}</div>')
    body = "".join(cards) or '<div class="card">لا توجد وظائف بعد.</div>'
    return (f'<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{e(title)}</title><style>{CSS}</style></head><body><main>'
            f'<h1>{e(title)}</h1><div class="sub">{len(rows)} وظيفة · '
            f'آخر تحديث {datetime.now():%Y-%m-%d %H:%M}</div>{body}</main></body></html>')
