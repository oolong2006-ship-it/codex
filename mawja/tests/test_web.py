"""Browser tests for the Arabic offline demo page (web/index.html, web/methodology.html).

Driven by Playwright for Node (tests/web_driver.js) with the pre-installed Chromium; the
page is served by a local http.server and every non-localhost request is blocked.
"""
import functools
import http.server
import json
import os
import shutil
import subprocess
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
DRIVER = Path(__file__).with_name("web_driver.js")
PAGE_FILES = ("index.html", "app.js", "style.css", "methodology.html")


def _node_env():
    """Environment in which `require('playwright')` resolves, or None."""
    node = shutil.which("node")
    if not node:
        return None
    candidates = [os.environ.get("NODE_PATH", ""), "/opt/node-tools/node_modules"]
    try:
        candidates.append(subprocess.run(["npm", "root", "-g"], capture_output=True,
                                         text=True, timeout=20).stdout.strip())
    except (OSError, subprocess.SubprocessError):
        pass
    for path in candidates:
        env = dict(os.environ, NODE_PATH=path)
        ok = subprocess.run([node, "-e", "require.resolve('playwright')"], env=env,
                            capture_output=True).returncode == 0
        if ok:
            return env
    return None


NODE_ENV = _node_env()
pytestmark = pytest.mark.skipif(NODE_ENV is None, reason="Node Playwright not installed")


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@pytest.fixture(scope="module")
def serve():
    servers = []

    def _serve(directory: Path) -> str:
        handler = functools.partial(_QuietHandler, directory=str(directory))
        httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        servers.append(httpd)
        return f"http://127.0.0.1:{httpd.server_address[1]}"

    yield _serve
    for s in servers:
        s.shutdown()


def drive(url, actions=(), evals=None, timeout=120, **extra):
    cfg = {"url": url, "actions": list(actions), "evals": evals or {}, **extra}
    res = subprocess.run(["node", str(DRIVER), json.dumps(cfg)], env=NODE_ENV,
                         capture_output=True, text=True, timeout=timeout)
    assert res.returncode == 0, res.stderr
    return json.loads(res.stdout.strip().splitlines()[-1])


READY = {"waitFor": "document.body.dataset.state === 'ready'", "timeout": 60000}
ERROR = {"waitFor": "document.body.dataset.state === 'error'", "timeout": 30000}

# Number of distinct colours in a canvas: a blank / single-fill canvas has 1-2.
CANVAS_COLOURS = """(id) => {
  const c = document.getElementById(id);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4 * 7) seen.add((d[i] << 16) | (d[i+1] << 8) | d[i+2]);
  return seen.size;
}"""


def _colours(canvas_id):
    return f"({CANVAS_COLOURS})('{canvas_id}')"


@pytest.fixture(scope="module")
def site(serve):
    return serve(WEB)


# --------------------------------------------------------------------------- fixtures


def _mini_replay(controller, label_ar, demand_hash, seed=1):
    lanes = [[[0, 0], [0, 1000]], [[-100, 500], [100, 500]]]
    tls = [{"id": "j1", "name_ar": "تقاطع العليا مع شارع تجريبي", "x": 0, "y": 500}]
    frames = []
    for i in range(1, 41):
        t = 3 * i
        frames.append({"t": t, "v": [[0, (t * 7) % 1000, i % 3], [3, 480, 2]],
                       "s": {"j1": "GYR"[i % 3]},
                       "k": {"avg_wait_s": float(i), "max_queue_m": 7.5 * i, "throughput": 2 * i}})
    return {"meta": {"controller": controller, "label_ar": label_ar, "seed": seed,
                     "demand_hash": demand_hash, "duration": 120, "scale": 1.0,
                     "frame_step_s": 3},
            "network": {"lanes": lanes}, "tls": tls, "frames": frames}


def _make_site(tmp: Path, fixed_hash="aaaa", mawja_hash="aaaa", manifest="max_pressure",
               write_mawja=True) -> Path:
    for name in PAGE_FILES:
        shutil.copy(WEB / name, tmp / name)
    data = tmp / "data"
    data.mkdir()
    results = json.loads((WEB / "data" / "results.json").read_text(encoding="utf-8"))
    results["meta"]["demand_hash"] = fixed_hash
    results["meta"]["demand_hash_by_scale"]["1.0"] = fixed_hash
    (data / "results.json").write_text(json.dumps(results), encoding="utf-8")
    (data / "manifest.json").write_text(json.dumps({"mawja": manifest}), encoding="utf-8")
    (data / "replay_fixed.json").write_text(json.dumps(
        _mini_replay("fixed", "توقيت ثابت منسّق (موجة خضراء)", fixed_hash)), encoding="utf-8")
    if write_mawja:
        (data / f"replay_{manifest}.json").write_text(json.dumps(
            _mini_replay(manifest, "خوارزمية الضغط الأقصى", mawja_hash)), encoding="utf-8")
    return tmp


# --------------------------------------------------------------------------- tests


def test_page_loads_offline(site):
    out = drive(site + "/index.html", [READY, {"wait": 300}],
                {"fixed": _colours("canvas-fixed"), "mawja": _colours("canvas-mawja"),
                 "error_hidden": "document.getElementById('error').hidden"})
    assert out["blocked"] == []
    assert out["console_errors"] == [] and out["page_errors"] == []
    assert out["evals"]["error_hidden"] is True
    assert out["evals"]["fixed"] > 20, "fixed-time canvas did not render"
    assert out["evals"]["mawja"] > 20, "Mawja canvas did not render"


def test_rtl_and_arabic(site):
    out = drive(site + "/index.html", [READY], {
        "dir": "document.documentElement.getAttribute('dir')",
        "lang": "document.documentElement.getAttribute('lang')",
        "h1": "document.querySelector('h1').textContent",
        "body": "document.body.innerText",
    })
    ev = out["evals"]
    assert ev["dir"] == "rtl" and ev["lang"] == "ar"
    assert "موجة — إشارات ذكية لشارع العليا" in ev["h1"]
    body = ev["body"]
    for text in ("الوضع الحالي (توقيت ثابت)", "خوارزمية الضغط الأقصى", "حجم المرور تقديري",
                 "متوسط الانتظار", "أطول طابور", "السيارات العابرة", "حتى الآن",
                 "الكلفة التقديرية بالريال", "11.4 مليار ريال", "منتدى الرياض الاقتصادي"):
        assert text in body, text
    # The Mawja panel is labelled by its real algorithm, never as a trained AI agent.
    assert "وكيل تعلم معزز" not in body
    assert "16:00" in body


def test_mismatched_meta_shows_error(serve, tmp_path):
    url = serve(_make_site(tmp_path, fixed_hash="aaaa", mawja_hash="bbbb"))
    out = drive(url + "/index.html", [ERROR], {
        "error": "document.getElementById('error').innerText",
        "visible": "!document.getElementById('error').hidden",
        "play_disabled": "document.getElementById('play').disabled",
    })
    assert out["blocked"] == []
    assert out["evals"]["visible"] is True
    assert "لا يمكن تشغيل المقارنة" in out["evals"]["error"]
    assert "حجم المرور" in out["evals"]["error"]
    assert out["evals"]["play_disabled"] is True


def test_results_mismatch_shows_error(serve, tmp_path):
    site_dir = _make_site(tmp_path)
    res_path = site_dir / "data" / "results.json"
    results = json.loads(res_path.read_text(encoding="utf-8"))
    results["meta"]["seed"] = 99
    res_path.write_text(json.dumps(results), encoding="utf-8")
    out = drive(serve(site_dir) + "/index.html", [ERROR], {
        "error": "document.getElementById('error').innerText"})
    assert "لا يمكن تشغيل المقارنة" in out["evals"]["error"]
    assert "results.json" in out["evals"]["error"]


def test_matching_fixture_plays(serve, tmp_path):
    url = serve(_make_site(tmp_path))
    out = drive(url + "/index.html", [READY], {"state": "document.body.dataset.state"})
    assert out["evals"]["state"] == "ready"
    assert out["console_errors"] == [] and out["page_errors"] == []


def test_missing_manifest_replay_shows_error(serve, tmp_path):
    url = serve(_make_site(tmp_path, manifest="rl", write_mawja=False))
    out = drive(url + "/index.html", [ERROR], {
        "error": "document.getElementById('error').innerText"})
    assert "replay_rl.json" in out["evals"]["error"]
    assert "تعذّر" in out["evals"]["error"]


def test_kpis_update(site):
    kpis = ("document.querySelectorAll('[data-kpi-value]').length + '|' + "
            "[...document.querySelectorAll('[data-kpi-value]')].map(e => e.textContent).join('|')")
    out = drive(site + "/index.html", [READY], {"before": kpis, "clock": "document.getElementById('clock').textContent"})
    before = out["evals"]["before"]
    assert before.startswith("6|")
    out = drive(site + "/index.html", [READY, {"click": "[data-speed='60']"}, {"click": "#play"},
                                       {"wait": 2000}],
                {"after": kpis, "clock": "document.getElementById('clock').textContent"})
    assert out["evals"]["after"] != before
    assert out["evals"]["clock"] != "16:00:00"
    assert out["console_errors"] == [] and out["page_errors"] == []


def test_summary_is_honest_per_scale(site):
    out = drive(site + "/index.html", [READY], {
        "rows": """[...document.querySelectorAll('#scales-table tbody tr')].map(r => ({
            scale: r.dataset.scale, controller: r.dataset.controller,
            text: r.innerText, verdict: (r.querySelector('.verdict') || {}).textContent || ''}))""",
    })
    rows = out["evals"]["rows"]
    results = json.loads((WEB / "data" / "results.json").read_text(encoding="utf-8"))
    expected = {(s, c) for s, runs in results["runs"].items() for c in runs}
    assert {(r["scale"], r["controller"]) for r in rows} == expected
    by = {(r["scale"], r["controller"]): r for r in rows}
    for scale, runs in results["runs"].items():
        base = runs["fixed"]
        for ctrl, k in runs.items():
            row = by[(scale, ctrl)]
            assert f"{k['throughput']:,}" in row["text"]
            assert f"{k['pending_insertion']:,}" in row["text"]
            worse = (k["throughput"] < base["throughput"]
                     or k["pending_insertion"] > base["pending_insertion"])
            if ctrl != "fixed" and worse:
                assert "تحسّن" not in row["verdict"], (scale, ctrl, row["verdict"])
    # 1.2x: max-pressure moves fewer cars and leaves more outside -> never called an improvement
    assert "تحسّن" not in by[("1.2", "max_pressure")]["verdict"]
    assert "تحسّن" in by[("1.0", "max_pressure")]["verdict"]


def test_methodology_page(site):
    out = drive(site + "/methodology.html", [
        {"waitFor": "document.querySelectorAll('#results-table tbody tr').length > 0"}], {
        "dir": "document.documentElement.getAttribute('dir')",
        "body": "document.body.innerText",
        "rows": "document.querySelectorAll('#results-table tbody tr').length",
    })
    assert out["blocked"] == [] and out["console_errors"] == []
    ev = out["evals"]
    assert ev["dir"] == "rtl"
    assert ev["rows"] == 9
    body = ev["body"]
    for text in ("تقريبية", "OpenStreetMap", "تقديري", "1800", "700", "300", "Webster",
                 "60 ثانية", "موجة خضراء", "10 ثوانٍ", "90 ثانية", "3 ثوانٍ", "ثانيتان",
                 "خوارزمية الضغط الأقصى", "SUMO", "ليست نتائج ميدانية", "45 ريالاً",
                 "2.33", "السيارات العابرة", "سيارات لم تتمكن من دخول الشارع", "0.8", "1.2"):
        assert text in body, text
