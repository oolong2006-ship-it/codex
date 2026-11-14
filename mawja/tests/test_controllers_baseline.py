from pathlib import Path

import pytest
import yaml

from sim.controllers.actuated import Actuated
from sim.controllers.base import Controller
from sim.controllers.fixed import (FixedWebster, approach_flows, green_splits,
                                   progression_offsets, webster_cycle)
from sim.demand import build_routes
from sim.network import build_network, signal_ids
from sim.rules import ALL_RED, MAX_GREEN, MIN_GREEN, YELLOW, check_rules
from sim.runner import run

CFG = Path(__file__).resolve().parents[1] / "sim" / "config"
DEMAND = CFG / "demand_evening.yaml"


@pytest.fixture(scope="module")
def net_xml(tmp_path_factory):
    return build_network(CFG / "corridor.yaml", tmp_path_factory.mktemp("net"))


@pytest.fixture(scope="module")
def routes(net_xml, tmp_path_factory):
    return build_routes(net_xml, DEMAND, 1, 1.0, tmp_path_factory.mktemp("rou"))


def test_labels():
    f, a = FixedWebster(DEMAND), Actuated()
    assert isinstance(f, Controller) and isinstance(a, Controller)
    assert (f.name, f.label_ar) == ("fixed", "توقيت ثابت منسّق (موجة خضراء)")
    assert (a.name, a.label_ar) == ("actuated", "تحكم متكيف تقليدي")


def test_webster_cycle_clamped():
    # C0 = (1.5 L + 5) / (1 - Y), L = 2 phases x (3 + 2) s = 10 s
    assert webster_cycle([0.40, 0.35], 10) == pytest.approx(80.0)    # 20 / 0.25
    assert webster_cycle([0.30, 0.20], 10) == pytest.approx(60.0)    # 40 -> clamp 60
    assert webster_cycle([0.45, 0.45], 10) == pytest.approx(150.0)   # 200 -> clamp 150
    assert webster_cycle([0.70, 0.40], 10) == pytest.approx(150.0)   # Y >= 1 -> 150


def test_green_splits_proportional_to_flow_ratios():
    g = green_splits(90, [0.4, 0.2], 10)
    assert sum(g) == 80                       # C - L
    assert g[0] == pytest.approx(2 * g[1], abs=1)
    assert all(MIN_GREEN <= x <= MAX_GREEN for x in g)
    g = green_splits(60, [0.5, 0.01], 10)
    assert g == [40, 10]                      # min green protects the minor phase
    g = green_splits(150, [0.6, 0.1], 10)
    assert max(g) <= MAX_GREEN and sum(g) <= 140


def test_fixed_offsets_follow_progression():
    # offset_i = d_i / v mod C with v = 50 km/h = 13.89 m/s
    assert progression_offsets([0, 600, 1250, 1900], 90, 50.0) == [0, 43, 0, 47]
    #   600/13.889 = 43.2 ; 1250/13.889 = 90.0 -> 0 ; 1900/13.889 = 136.8 -> 46.8


def test_approach_flows_follow_turning_model(net_xml):
    ids = signal_ids(net_xml)
    demand = yaml.safe_load(DEMAND.read_text(encoding="utf-8"))
    f = approach_flows(ids, demand)
    nb = demand["olaya_veh_per_hour"]["northbound"]
    assert f[f"olaya_south_end__{ids[0]}"] == pytest.approx(nb)
    t = demand["default_turns"]
    minor = demand["cross_veh_per_hour"][demand["intersections"][ids[0]]["cross_class"]]
    expected = nb * (1 - t["left"] - t["right"]) + minor * (t["left"] + t["right"])
    assert f[f"{ids[0]}__{ids[1]}"] == pytest.approx(expected)
    assert f[f"xw_{ids[0]}_in"] == pytest.approx(minor)


def test_fixed_plan_and_green_wave_in_simulation(net_xml, routes):
    ctl = FixedWebster(DEMAND)
    r = run(net_xml, routes, ctl, seed=1, duration=600)
    plan = ctl.plan
    ids = signal_ids(net_xml)
    cycle = plan["cycle_s"]
    assert 60 <= cycle <= 150
    for tid in ids:
        p = plan["junctions"][tid]
        assert sum(p["greens_s"]) + len(p["greens_s"]) * (YELLOW + ALL_RED) == cycle
    # Olaya green (phase 0) onsets keep the progression offsets at every junction
    onsets = {tid: [t for t, j, ph in r.phase_log if j == tid and ph == 0 and t > 0]
              for tid in ids}
    # (SUMO switches one step after the nominal time at every junction alike, so compare
    # onsets relative to each other rather than absolutely.)
    shift = {(onsets[tid][0] - plan["junctions"][tid]["offset_s"]) % cycle for tid in ids}
    assert len(shift) == 1 and shift <= {0, 1}
    offs = [plan["junctions"][tid]["offset_s"] for tid in ids]
    assert offs == progression_offsets(plan["distances_m"], cycle, 50.0)
    assert check_rules(r.phase_log, net_xml, end_t=r.diagnostics["duration_s"]) == []


@pytest.mark.parametrize("ctl", [lambda: FixedWebster(DEMAND), Actuated])
def test_baselines_obey_rules(net_xml, routes, ctl):
    r = run(net_xml, routes, ctl(), seed=1, duration=3600)
    assert check_rules(r.phase_log, net_xml, end_t=r.diagnostics["duration_s"]) == []
    assert r.kpis["teleports"] == 0
    assert r.kpis["throughput"] > 0
