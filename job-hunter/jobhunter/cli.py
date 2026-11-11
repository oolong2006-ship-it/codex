"""Command line entry point: python -m jobhunter <command>."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from . import ai, notify, report, scoring, sources
from .models import Job
from .profile import load_profile
from .store import STATUSES, Store

DATA_DIR = Path(os.environ.get("JOBHUNTER_DATA", "data"))


def _store() -> Store:
    return Store(DATA_DIR / "jobhunter.db")


def cmd_run(args) -> int:
    profile = load_profile(args.profile)
    store = _store()
    if args.fixture:
        raw = [Job(**j) for j in json.loads(Path(args.fixture).read_text(encoding="utf-8"))]
    else:
        raw = sources.fetch_all(profile, args.sources)
    known = store.known_keys()
    fresh = [j for j in scoring.prefilter(raw, profile) if j.key not in known]
    print(f"[run] fetched={len(raw)} new_matching={len(fresh)}", file=sys.stderr)

    if fresh and not args.no_ai and ai.available() and profile.cv_text:
        ai.rank(fresh, profile)
    for job in fresh:
        store.add(job)

    picks = sorted((j for j in fresh if j.score >= profile.min_notify_score),
                   key=lambda j: j.score, reverse=True)
    messages = notify.build_messages(picks, len(fresh))
    if args.no_notify:
        if not args.quiet:
            print("\n\n".join(messages))
    elif notify.send_telegram(messages):
        for job in picks:
            store.set_status(job.key, "notified")
    _write_report(store)
    return 0


def _write_report(store: Store) -> Path:
    out = DATA_DIR / "report.html"
    out.write_text(report.render(store.rows()), encoding="utf-8")
    return out


def cmd_list(args) -> int:
    for r in _store().rows(args.status, args.limit):
        score = r["ai_score"] if r["ai_score"] is not None else r["rule_score"]
        print(f"{r['key']}  {score:>3}%  [{STATUSES.get(r['status'], r['status'])}]  "
              f"{r['title']} — {r['company']} ({r['location']})")
    return 0


def cmd_set(args) -> int:
    if not _store().set_status(args.key, args.status):
        print(f"لا توجد وظيفة بالرمز {args.key}", file=sys.stderr)
        return 1
    print(f"تم: {args.key} ← {STATUSES[args.status]}")
    return 0


def cmd_pack(args) -> int:
    profile = load_profile(args.profile)
    job = _store().get(args.key)
    if not job:
        print(f"لا توجد وظيفة بالرمز {args.key}", file=sys.stderr)
        return 1
    if not ai.available():
        print("يحتاج هذا الأمر مفتاح ANTHROPIC_API_KEY.", file=sys.stderr)
        return 1
    pack = ai.application_pack(job, profile)
    if pack is None:
        print("تعذّر تجهيز الملف، حاول مرة أخرى.", file=sys.stderr)
        return 1
    out = DATA_DIR / "packs" / f"{args.key}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    bullets = "\n".join(f"- {b}" for b in pack.top_bullets)
    out.write_text(
        f"# ملف تقديم: {job.title} — {job.company}\n\n{job.url}\n\n"
        f"## العنوان المهني\n{pack.cv_headline}\n\n## الملخص المهني\n{pack.cv_summary}\n\n"
        f"## أبرز الإنجازات لهذه الوظيفة\n{bullets}\n\n"
        f"## كلمات مفتاحية (ATS)\n{', '.join(pack.ats_keywords)}\n\n"
        f"## خطاب التقديم (عربي)\n{pack.cover_letter_ar}\n\n"
        f"## Cover letter (English)\n{pack.cover_letter_en}\n\n"
        f"## فجوات انتبه لها\n" + "\n".join(f"- {g}" for g in pack.gaps) +
        "\n\n## أسئلة مقابلة متوقعة\n" + "\n".join(f"- {t}" for t in pack.interview_tips) + "\n",
        encoding="utf-8")
    print(f"تم حفظ ملف التقديم: {out}")
    return 0


def cmd_report(args) -> int:
    print(f"تم إنشاء التقرير: {_write_report(_store())}")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="jobhunter", description="باحث الوظائف الشخصي")
    p.add_argument("--profile", help="مسار ملف profile.json")
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("run", help="ابحث وقيّم وأرسل الوظائف الجديدة")
    r.add_argument("--sources", nargs="*", choices=list(sources.FETCHERS))
    r.add_argument("--fixture", help="ملف JSON بوظائف تجريبية بدل البحث الحقيقي")
    r.add_argument("--no-ai", action="store_true")
    r.add_argument("--no-notify", action="store_true", help="اطبع النتائج بدل إرسالها")
    r.add_argument("--quiet", action="store_true", help="لا تطبع تفاصيل الوظائف (للتشغيل في CI)")
    r.set_defaults(fn=cmd_run)

    ls = sub.add_parser("list", help="اعرض الوظائف المحفوظة")
    ls.add_argument("--status", choices=list(STATUSES))
    ls.add_argument("--limit", type=int, default=50)
    ls.set_defaults(fn=cmd_list)

    st = sub.add_parser("set", help="غيّر حالة وظيفة")
    st.add_argument("key")
    st.add_argument("status", choices=list(STATUSES))
    st.set_defaults(fn=cmd_set)

    pk = sub.add_parser("pack", help="جهّز سيرة مخصصة وخطاب تقديم لوظيفة")
    pk.add_argument("key")
    pk.set_defaults(fn=cmd_pack)

    rp = sub.add_parser("report", help="أنشئ تقرير HTML")
    rp.set_defaults(fn=cmd_report)

    args = p.parse_args(argv)
    return args.fn(args)
