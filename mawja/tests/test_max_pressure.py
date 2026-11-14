from pathlib import Path

import libsumo
import pytest

from sim.controllers.base import Controller
from sim.controllers.fixed import FixedWebster
from sim.controllers.max_pressure import MaxPressure, pressure
from sim.demand import build_routes
from sim.network import build_network, signal_ids
from sim.rules import MAX_GREEN, MIN_GREEN, check_rules, phase_kind
from sim.runner import run

ROOT = Path(__file__).resolve().parents[1]
CFG = ROOT / "sim" / "config"
TOY = Path(__file__).resolve().parent / "fixtures" / "toy_corridor.yaml"


@pytest.fixture(scope="module")
def net_xml(tmp_path_factory):
    return build_network(CFG / "corridor.yaml", tmp_path_factory.mktemp("net"))


@pytest.fixture(scope="module")
def routes(net_xml, tmp_path_factory):
    return build_routes(net_xml, CFG / "demand_evening.yaml", 1, 1.0,
                        tmp_path_factory.mktemp("rou"))


@pytest.fixture(scope="module")
def toy_net(tmp_path_factory):
    return build_network(TOY, tmp_path_factory.mktemp("toy"))


def test_labels():
    c = MaxPressure()
    assert isinstance(c, Controller)
    assert (c.name, c.label_ar) == ("max_pressure", "خوارزمية الضغط الأقصى")
    assert c.decision_interval == 5


def _park(conn, vid, edges, lane, pos):
    """Insert a vehicle at standstill on ``edges[0]`` lane ``lane`` and keep it there."""
    conn.route.add(f"r_{vid}", edges)
    conn.vehicle.add(vid, f"r_{vid}", depart="now", departLane=str(lane),
                     departPos=str(pos), departSpeed="0")
    conn.vehicle.setLaneChangeMode(vid, 0)
    conn.vehicle.setSpeed(vid, 0)


def test_pressure_counts_halting(toy_net):
    assert signal_ids(toy_net) == ["toy_a", "toy_b"]
    conn = libsumo
    try:
        conn.close()
    except Exception:
        pass
    conn.start(["sumo", "-n", str(toy_net), "--no-step-log", "true", "--no-warnings", "true"])
    try:
        nb_in = ["olaya_south_end__toy_a", "toy_a__toy_b"]
        # incoming at toy_a, Olaya approach: 3 on lane 0, 1 on lane 1
        for k, pos in enumerate([200, 190, 180]):
            _park(conn, f"s0_{k}", nb_in, 0, pos)
        _park(conn, "s1_0", nb_in, 1, 200)
        # cross street at toy_a (west approach): 2 halting
        for k, pos in enumerate([150, 140]):
            _park(conn, f"w_{k}", ["xw_toy_a_in", "xe_toy_a_out"], 0, pos)
        # between the junctions: outgoing for toy_a, incoming for toy_b (2 halting)
        for k, pos in enumerate([300, 290]):
            _park(conn, f"m_{k}", ["toy_a__toy_b", "toy_b__olaya_north_end"], k, pos)
        conn.simulationStep()
        conn.simulationStep()
        assert conn.vehicle.getIDCount() == 8
        assert conn.edge.getLastStepHaltingNumber("toy_a__toy_b") == 2

        tl = conn.trafficlight
        olaya = tl.getRedYellowGreenState("toy_a")          # netconvert phase 0: Olaya green
        assert phase_kind(olaya) == "green"
        logic = next(lg for lg in tl.getAllProgramLogics("toy_a")
                     if lg.programID == tl.getProgram("toy_a"))
        cross = next(ph.state for ph in logic.phases
                     if phase_kind(ph.state) == "green" and ph.state != olaya)
        # toy_a Olaya: in 3 + 1 = 4, out (toy_a__toy_b) 2 -> 2
        assert pressure(conn, "toy_a", olaya) == pytest.approx(2.0)
        # toy_a cross: in 2 (west approach), out 2 (lefts/rights also feed toy_a__toy_b) -> 0
        assert pressure(conn, "toy_a", cross) == pytest.approx(0.0)
        # toy_b (same link layout): Olaya in 2, out 0 -> 2 ; cross: nothing -> 0
        assert pressure(conn, "toy_b", tl.getRedYellowGreenState("toy_b")) == pytest.approx(2.0)
        assert pressure(conn, "toy_b", cross) == pytest.approx(0.0)
        # an int phase is an index into the tls's running program
        k_cross = next(i for i, ph in enumerate(logic.phases) if ph.state == cross)
        assert pressure(conn, "toy_a", 0) == pytest.approx(2.0)
        assert pressure(conn, "toy_a", k_cross) == pytest.approx(0.0)
    finally:
        conn.close()


def test_max_pressure_obeys_rules(net_xml, routes):
    r = run(net_xml, routes, MaxPressure(), seed=1, duration=3600)
    assert check_rules(r.phase_log, net_xml, end_t=r.diagnostics["duration_s"]) == []
    assert r.kpis["teleports"] == 0
    assert r.kpis["throughput"] > 0
    # it really adapts: green durations vary and lie within [MIN_GREEN, MAX_GREEN]
    tid = signal_ids(net_xml)[1]
    seq = [(t, e.state) for e in r.phase_log if e[1] == tid for t in [e[0]]]
    greens = [seq[k + 1][0] - t for k, (t, s) in enumerate(seq[1:-1], start=1)
              if phase_kind(s) == "green"]
    assert greens and min(greens) >= MIN_GREEN and max(greens) <= MAX_GREEN
    assert len(set(greens)) > 3


def test_max_pressure_beats_fixed_on_wait(net_xml, routes):
    mp = run(net_xml, routes, MaxPressure(), seed=1)
    fx = run(net_xml, routes, FixedWebster(CFG / "demand_evening.yaml"), seed=1)
    assert check_rules(mp.phase_log, net_xml, end_t=mp.diagnostics["duration_s"]) == []
    assert mp.kpis["teleports"] == 0
    assert mp.kpis["avg_wait_s"] < fx.kpis["avg_wait_s"], (mp.kpis, fx.kpis)
