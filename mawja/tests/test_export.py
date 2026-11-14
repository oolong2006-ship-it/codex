import json
from pathlib import Path

import pytest
import yaml

from sim import cli, export
from sim.demand import demand_hash
from sim.kpi import KPI_KEYS
from sim.network import build_network, signal_ids

ROOT = Path(__file__).resolve().parents[1]
CFG = ROOT / "sim" / "config"
DATA = ROOT / "web" / "data"
MAX_REPLAY_BYTES = 25 * 1024 * 1024


def _is_half_metre(v):
    return abs(v * 2 - round(v * 2)) < 1e-9


@pytest.fixture(scope="module")
def short_replay(tmp_path_factory):
    out = tmp_path_factory.mktemp("out")
    path = export.export_replay("fixed", seed=1, out_dir=out, duration=120,
                                work_dir=tmp_path_factory.mktemp("work"))
    return path, json.loads(path.read_text(encoding="utf-8"))


def test_replay_schema(short_replay):
    path, rep = short_replay
    assert path.name == "replay_fixed.json"
    assert set(rep) == {"meta", "network", "tls", "frames"}
    meta = rep["meta"]
    assert meta["controller"] == "fixed"
    assert meta["label_ar"] == "توقيت ثابت منسّق (موجة خضراء)"
    assert meta["seed"] == 1
    assert meta["duration"] == 120
    assert meta["demand_hash"] == demand_hash(CFG / "demand_evening.yaml", 1.0)
    assert meta["frame_step_s"] == 1  # a short run fits the budget at 1 Hz

    lanes = rep["network"]["lanes"]
    assert len(lanes) > 50
    for poly in lanes:
        assert len(poly) >= 2
        assert all(len(p) == 2 and _is_half_metre(p[0]) and _is_half_metre(p[1])
                   for p in poly)

    corridor = yaml.safe_load((CFG / "corridor.yaml").read_text(encoding="utf-8"))
    names = {i["id"]: i["name_ar"] for i in corridor["intersections"]}
    assert [t["id"] for t in rep["tls"]] == list(names)  # south -> north
    for t in rep["tls"]:
        assert set(t) == {"id", "name_ar", "x", "y"}
        assert t["name_ar"] == names[t["id"]]

    frames = rep["frames"]
    assert [f["t"] for f in frames] == list(range(1, 121))  # 1 frame / s
    assert sum(len(f["v"]) for f in frames) > 0
    for f in frames:
        assert set(f) == {"t", "v", "s", "k"}
        assert set(f["s"]) == set(names)
        assert set(f["s"].values()) <= {"G", "Y", "R"}
        assert set(f["k"]) == {"delay_veh_h", "avg_wait_s", "max_queue_m", "throughput"}
        for x, y, b in f["v"]:
            assert _is_half_metre(x) and _is_half_metre(y)
            assert b in (0, 1, 2)
    # The Olaya signal really changes (G -> Y -> R) during two minutes of a 60 s cycle.
    seen = {f["s"][tid] for f in frames for tid in names}
    assert seen == {"G", "Y", "R"}
    # throughput in k is cumulative
    tp = [f["k"]["throughput"] for f in frames]
    assert tp == sorted(tp) and tp[-1] > 0


def test_waiting_bucket():
    assert export.waiting_bucket(0.0) == 0
    assert export.waiting_bucket(9.9) == 0
    assert export.waiting_bucket(10.0) == 1
    assert export.waiting_bucket(60.0) == 1
    assert export.waiting_bucket(60.1) == 2


def test_olaya_signal_char():
    assert export.signal_char("G") == "G"
    assert export.signal_char("g") == "G"
    assert export.signal_char("y") == "Y"
    assert export.signal_char("r") == "R"
    assert export.signal_char("s") == "R"


def test_olaya_link_index_is_through_movement(tmp_path):
    net = build_network(CFG / "corridor.yaml", tmp_path)
    idx = export.olaya_link_index(net)
    assert set(idx) == set(signal_ids(net))
    assert all(isinstance(i, int) and i >= 0 for i in idx.values())


def test_choose_frame_step():
    ts = list(range(1, 11))
    assert export.choose_frame_step([10] * 10, ts, overhead=0, budget=200) == 1
    assert export.choose_frame_step([10] * 10, ts, overhead=0, budget=60) == 2
    # step 3 keeps 3, 6, 9 and the final frame 10 (44 B > 40) -> step 4 (4, 8, 10)
    assert export.choose_frame_step([10] * 10, ts, overhead=0, budget=40) == 4


def test_frames_thinned_uniformly_when_over_budget(tmp_path):
    path = export.export_replay("fixed", seed=1, out_dir=tmp_path, duration=60,
                                work_dir=tmp_path / "w", budget_bytes=60_000)
    rep = json.loads(path.read_text(encoding="utf-8"))
    step = rep["meta"]["frame_step_s"]
    assert step > 1
    assert [f["t"] for f in rep["frames"]] == list(range(step, 61, step))
    assert path.stat().st_size <= 60_000


def test_replay_size_limit(tmp_path):
    path = export.export_replay("fixed", seed=1, out_dir=tmp_path, work_dir=tmp_path / "w")
    assert path.stat().st_size < MAX_REPLAY_BYTES
    rep = json.loads(path.read_text(encoding="utf-8"))
    step = rep["meta"]["frame_step_s"]
    assert 1 <= step <= 5  # still smooth enough to animate
    assert [f["t"] for f in rep["frames"]] == list(range(step, 7201, step))
    assert rep["frames"][-1]["t"] == 7200


def test_results_has_all_controllers(tmp_path):
    res = export.compare(seed=1, scales=[0.8, 1.0], out_dir=tmp_path, duration=120,
                         work_dir=tmp_path / "w")
    on_disk = json.loads((tmp_path / "results.json").read_text(encoding="utf-8"))
    assert on_disk == res
    meta = res["meta"]
    assert meta["seed"] == 1 and meta["estimated"] is True and meta["generated_at"]
    assert meta["demand_hash"] == demand_hash(CFG / "demand_evening.yaml", 1.0)
    assert set(res["runs"]) == {"0.8", "1.0"}
    for scale, runs in res["runs"].items():
        assert set(runs) == {"fixed", "actuated", "max_pressure"}
        for kpis in runs.values():
            assert set(kpis) == set(KPI_KEYS)  # keeps throughput and pending_insertion


def test_rule_violation_fails_loudly(tmp_path, monkeypatch):
    monkeypatch.setattr(export, "check_rules", lambda *a, **k: ["x t=5: green lasted 3 s"])
    with pytest.raises(export.RuleViolation):
        export.export_replay("fixed", seed=1, out_dir=tmp_path, duration=30,
                             work_dir=tmp_path / "w")
    assert not (tmp_path / "replay_fixed.json").exists()
    rc = cli.main(["export", "--controller", "fixed", "--seed", "1", "--duration", "30",
                   "--out", str(tmp_path)])
    assert rc != 0
    assert not (tmp_path / "replay_fixed.json").exists()


def test_cli_export_writes_manifest(tmp_path):
    rc = cli.main(["export", "--controller", "max_pressure", "--seed", "1",
                   "--duration", "30", "--out", str(tmp_path)])
    assert rc == 0
    assert (tmp_path / "replay_max_pressure.json").exists()
    assert json.loads((tmp_path / "manifest.json").read_text()) == {"mawja": "max_pressure"}
    rc = cli.main(["export", "--controller", "fixed", "--seed", "1", "--duration", "30",
                   "--out", str(tmp_path)])
    assert rc == 0  # exporting another controller leaves the Mawja choice alone
    assert json.loads((tmp_path / "manifest.json").read_text()) == {"mawja": "max_pressure"}


def test_cli_rl_unavailable_is_clear_error(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(export, "_load_rl", lambda: (_ for _ in ()).throw(
        export.ControllerUnavailable("rl controller not available (sim/controllers/rl.py)")))
    rc = cli.main(["export", "--controller", "rl", "--seed", "1", "--duration", "30",
                   "--out", str(tmp_path)])
    assert rc != 0
    assert "rl" in capsys.readouterr().err


# --- committed demo data (web/data) -------------------------------------------------------

def test_committed_results():
    res = json.loads((DATA / "results.json").read_text(encoding="utf-8"))
    assert res["meta"]["estimated"] is True
    assert set(res["runs"]) == {"0.8", "1.0", "1.2"}
    for runs in res["runs"].values():
        assert {"fixed", "actuated", "max_pressure"} <= set(runs)
        for kpis in runs.values():
            assert set(KPI_KEYS) <= set(kpis)


def test_committed_replays_match_results():
    res = json.loads((DATA / "results.json").read_text(encoding="utf-8"))
    manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["mawja"] in ("max_pressure", "rl")
    for name in ("fixed", manifest["mawja"]):
        path = DATA / f"replay_{name}.json"
        assert path.stat().st_size < MAX_REPLAY_BYTES
        meta = json.loads(path.read_text(encoding="utf-8"))["meta"]
        assert meta["controller"] == name
        assert (meta["seed"], meta["demand_hash"]) == (res["meta"]["seed"],
                                                       res["meta"]["demand_hash"])
        assert meta["duration"] == res["meta"]["duration"]


def test_committed_replay_final_kpis_match_results():
    # Same seed, scale 1.0, full peak: the replay's last frame shows the final KPIs.
    res = json.loads((DATA / "results.json").read_text(encoding="utf-8"))
    manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    for name in ("fixed", manifest["mawja"]):
        rep = json.loads((DATA / f"replay_{name}.json").read_text(encoding="utf-8"))
        assert rep["meta"]["duration"] == 7200 and rep["meta"]["scale"] == 1.0
        k, kpis = rep["frames"][-1]["k"], res["runs"]["1.0"][name]
        assert k["throughput"] == kpis["throughput"]
        assert k["avg_wait_s"] == pytest.approx(kpis["avg_wait_s"], abs=0.05)
        assert k["delay_veh_h"] == pytest.approx(kpis["delay_veh_h"], abs=0.005)
        assert k["max_queue_m"] == pytest.approx(kpis["max_queue_m"], abs=0.05)


# --- Task 8 hardening ---------------------------------------------------------------------

def test_replay_keeps_final_frame_when_duration_not_multiple_of_step(tmp_path):
    path = export.export_replay("fixed", seed=1, out_dir=tmp_path, duration=61,
                                work_dir=tmp_path / "w", budget_bytes=60_000)
    rep = json.loads(path.read_text(encoding="utf-8"))
    step = rep["meta"]["frame_step_s"]
    assert step > 1 and 61 % step != 0
    ts = [f["t"] for f in rep["frames"]]
    assert ts[:-1] == list(range(step, 61, step))
    assert ts[-1] == 61 == rep["meta"]["duration"]
    assert path.stat().st_size <= 60_000


def test_replay_missing_final_frame_fails_loudly(tmp_path, monkeypatch):
    real = export.run_checked

    def drop_last(*a, **k):
        r = real(*a, **k)
        r.frames.pop()
        return r

    monkeypatch.setattr(export, "run_checked", drop_last)
    with pytest.raises(export.ReplayIncomplete):
        export.export_replay("fixed", seed=1, out_dir=tmp_path, duration=30,
                             work_dir=tmp_path / "w")
    assert not (tmp_path / "replay_fixed.json").exists()


def test_set_mawja_only_rl_or_max_pressure(tmp_path, capsys):
    for bad in ("fixed", "actuated"):
        with pytest.raises(SystemExit) as exc:
            cli.main(["export", "--controller", bad, "--seed", "1", "--duration", "30",
                      "--out", str(tmp_path), "--set-mawja"])
        assert exc.value.code != 0
        assert "--set-mawja" in capsys.readouterr().err
        assert not (tmp_path / f"replay_{bad}.json").exists()
        assert not (tmp_path / "manifest.json").exists()
    with pytest.raises(ValueError):
        export.write_manifest(tmp_path, "fixed")
    assert export.write_manifest(tmp_path, "rl") == {"mawja": "rl"}
    assert export.write_manifest(tmp_path, "max_pressure") == {"mawja": "max_pressure"}
