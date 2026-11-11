import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from jobhunter import notify, scoring, sources
from jobhunter.cli import main
from jobhunter.models import Job
from jobhunter.profile import Profile
from jobhunter.store import Store

FIXTURES = Path(__file__).parent / "fixtures"


def profile(**kw) -> Profile:
    base = dict(
        name="t", queries=["Procurement Manager"], locations=["Riyadh"],
        title_keywords=["procurement", "purchasing", "مشتريات", "supply chain"],
        skill_keywords=["negotiation", "odoo", "contracts", "التفاوض", "spend analysis"],
        exclude_keywords=["intern", "junior", "متدرب"],
        preferred_locations=["Riyadh", "الرياض"],
    )
    base.update(kw)
    return Profile(**base)


class ParseTests(unittest.TestCase):
    def test_serpapi(self):
        jobs = sources.parse_serpapi(json.loads((FIXTURES / "serpapi.json").read_text()))
        self.assertEqual(len(jobs), 3)
        self.assertEqual(jobs[0].company, "Almarai")
        self.assertEqual(jobs[0].url, "https://example.com/apply/1")
        self.assertEqual(jobs[0].posted, "2 days ago")

    def test_jooble_strips_html(self):
        jobs = sources.parse_jooble({"jobs": [{"title": "<b>Procurement</b> Lead", "snippet": "a&amp;b",
                                                "link": "https://x", "company": "C", "location": "Riyadh"}]})
        self.assertEqual(jobs[0].title, "Procurement Lead")
        self.assertEqual(jobs[0].description, "a&b")

    def test_greenhouse_and_lever(self):
        gh = sources.parse_greenhouse({"jobs": [{"title": "Buyer", "location": {"name": "Riyadh"},
                                                  "absolute_url": "https://gh", "content": "&lt;p&gt;x&lt;/p&gt;"}]}, "acme")
        self.assertEqual((gh[0].company, gh[0].description), ("acme", "x"))
        lv = sources.parse_lever([{"text": "Buyer", "hostedUrl": "https://lv",
                                   "categories": {"location": "Jeddah"}}], "acme")
        self.assertEqual(lv[0].location, "Jeddah")

    def test_missing_keys_skip_sources(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(sources.fetch_serpapi(profile()), [])
            self.assertEqual(sources.fetch_jooble(profile()), [])


class ScoringTests(unittest.TestCase):
    def test_title_match_scores_high_and_exclusions_zero(self):
        p = profile()
        good = Job("Procurement Manager", "A", "Riyadh, Saudi Arabia", "u",
                   "Negotiation, contracts and Odoo ERP; spend analysis")
        bad = Job("Procurement Intern", "A", "Riyadh", "u", "negotiation")
        other = Job("Software Engineer", "A", "Riyadh", "u", "python")
        self.assertGreaterEqual(scoring.rule_score(good, p), 70)
        self.assertEqual(scoring.rule_score(bad, p), 0)
        self.assertLess(scoring.rule_score(other, p), 35)

    def test_arabic_normalisation(self):
        job = Job("مدير إدارة المشتريات", "ب", "الرياض", "u", "خبرة في التفاوض")
        self.assertGreaterEqual(scoring.rule_score(job, profile(title_keywords=["المشتريات"])), 50)

    def test_dedupe_keeps_longest_description(self):
        a = Job("Procurement Manager", "Almarai", "Riyadh", "u1", "short")
        b = Job("Procurement  manager", "ALMARAI", "Riyadh", "u2", "a much longer description")
        out = scoring.dedupe([a, b])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].url, "u2")


class NotifyTests(unittest.TestCase):
    def test_escapes_and_splits(self):
        jobs = [Job(f"Head <of> Procurement {i}", "A&B", "Riyadh", "https://x?a=1&b=2", "d" * 10,
                    rule_score=80) for i in range(60)]
        msgs = notify.build_messages(jobs, 60)
        self.assertGreater(len(msgs), 1)
        self.assertTrue(all(len(m) <= 4096 for m in msgs))
        self.assertIn("Head &lt;of&gt;", msgs[0])
        self.assertIn("A&amp;B", msgs[0])

    def test_empty_digest(self):
        self.assertIn("لا توجد", notify.build_messages([], 5)[0])


class EndToEndTests(unittest.TestCase):
    def test_run_twice_only_reports_new_jobs(self):
        with tempfile.TemporaryDirectory() as tmp:
            prof = Path(tmp) / "profile.json"
            prof.write_text(json.dumps(profile().__dict__), encoding="utf-8")
            env = {"JOBHUNTER_DATA": tmp}
            with mock.patch.dict(os.environ, env, clear=True), \
                    mock.patch("jobhunter.cli.DATA_DIR", Path(tmp)):
                args = ["--profile", str(prof), "run", "--fixture", str(FIXTURES / "jobs.json"),
                        "--no-notify", "--quiet"]
                self.assertEqual(main(args), 0)
                store = Store(Path(tmp) / "jobhunter.db")
                first = len(store.rows())
                self.assertEqual(first, 2)  # engineer + intern filtered, duplicate collapsed
                self.assertEqual(main(args), 0)
                self.assertEqual(len(store.rows()), first)
                key = store.rows()[0]["key"]
                self.assertEqual(main(["set", key, "applied"]), 0)
                self.assertEqual(store.rows("applied")[0]["key"], key)
                self.assertTrue((Path(tmp) / "report.html").exists())


if __name__ == "__main__":
    unittest.main()
