from pathlib import Path

import pytest

from sim.controllers.base import Controller, StaticProgram
from sim.demand import build_routes
from sim.network import build_network, signal_ids
from sim.runner import RunResult, run

CFG = Path(__file__).resolve().parents[1] / "sim" / "config"
KEYS = {"avg_wait_s", "max_queue_m", "throughput", "unfinished", "teleports",
        "fuel_l", "co2_kg", "cost_sar", "pending_insertion"}


@pytest.fixture(scope="module")
def net_xml(tmp_path_factory):
    return build_network(CFG / "corridor.yaml", tmp_path_factory.mktemp("net"))


@pytest.fixture(scope="module")
def routes(net_xml, tmp_path_factory):
    return build_routes(net_xml, CFG / "demand_evening.yaml", 1, 1.0,
                        tmp_path_factory.mktemp("rou"))


@pytest.fixture(scope="module")
def routes_x2(net_xml, tmp_path_factory):
    return build_routes(net_xml, CFG / "demand_evening.yaml", 1, 2.0,
                        tmp_path_factory.mktemp("rou2"))


def test_static_program_is_a_controller():
    c = StaticProgram()
    assert isinstance(c, Controller)
    assert c.name == "static"
    assert c.label_ar == "البرنامج الافتراضي"


def test_run_deterministic(net_xml, routes):
    a = run(net_xml, routes, StaticProgram(), seed=7, duration=600)
    b = run(net_xml, routes, StaticProgram(), seed=7, duration=600)
    assert isinstance(a, RunResult)
    assert set(a.kpis) == KEYS
    assert a.kpis == b.kpis
    assert a.phase_log == b.phase_log
    assert a.kpis["throughput"] > 0
    assert a.kpis["pending_insertion"] >= 0
    assert a.frames is None


def test_teleports_disabled(net_xml, routes_x2):
    r = run(net_xml, routes_x2, StaticProgram(), seed=1, duration=900)
    assert r.kpis["teleports"] == 0
    # demand x2 must actually congest the corridor, otherwise the test is vacuous
    assert r.kpis["max_queue_m"] > 100
    # at double demand entries back up: vehicles due to depart cannot enter
    assert r.kpis["pending_insertion"] > 0


def test_unfinished_reported(net_xml, routes):
    r = run(net_xml, routes, StaticProgram(), seed=1, duration=60)
    assert r.kpis["unfinished"] > 0
    # vehicles still in the network are counted in the waiting average (per-second metric)
    assert r.kpis["avg_wait_s"] >= 0


def test_record_frames_and_phase_log(net_xml, routes):
    r = run(net_xml, routes, StaticProgram(), seed=1, record=True, duration=30)
    assert r.frames is not None and len(r.frames) == 30
    f = r.frames[-1]
    assert f["t"] == 30
    assert set(f["tls"]) == set(signal_ids(net_xml))
    assert f["vehicles"] and {"id", "x", "y", "wait"} <= set(f["vehicles"][0])
    # every tls has its initial phase logged at t=0
    assert {tid for t, tid, _ in r.phase_log if t == 0} == set(signal_ids(net_xml))


def test_controller_hooks_called(net_xml, routes):
    calls = {"setup": None, "steps": []}

    class Spy:
        name, label_ar = "spy", "تجربة"

        def setup(self, conn, tls_ids):
            calls["setup"] = list(tls_ids)

        def step(self, conn, t):
            calls["steps"].append(t)

    run(net_xml, routes, Spy(), seed=1, duration=5)
    assert calls["setup"] == signal_ids(net_xml)
    assert calls["steps"] == [1, 2, 3, 4, 5]


def test_accumulated_wait_not_capped_at_sumo_default_memory(net_xml, routes_x2):
    # SUMO's default --waiting-time-memory is 100 s, which would silently cap waits.
    r = run(net_xml, routes_x2, StaticProgram(), seed=1, record=True, duration=900)
    assert max(v["wait"] for v in r.frames[-1]["vehicles"]) > 100.0
