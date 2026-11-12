from pathlib import Path

import pytest

from sim import rules
from sim.controllers.base import StaticProgram
from sim.demand import build_routes
from sim.network import build_network, signal_ids
from sim.rules import ALL_RED, MAX_GREEN, MIN_GREEN, YELLOW, check_rules
from sim.runner import run

CFG = Path(__file__).resolve().parents[1] / "sim" / "config"
G = "rrGGrr"     # 6-link toy states: green for the corridor
X = "GGrrGG"     # green for the cross street
YG = "rryyrr"
YX = "yyrryy"
R = "rrrrrr"


@pytest.fixture(scope="module")
def net_xml(tmp_path_factory):
    return build_network(CFG / "corridor.yaml", tmp_path_factory.mktemp("net"))


def _cycle_log(tid="J", t0=0, g1=40, g2=30, cycles=3):
    """A rule-abiding 6-phase log: G, y, all-red, G, y, all-red (with states)."""
    log, t = [], t0
    for _ in range(cycles):
        for idx, (state, dur) in enumerate([(G, g1), (YG, YELLOW), (R, ALL_RED),
                                            (X, g2), (YX, YELLOW), (R, ALL_RED)]):
            log.append((t, tid, idx, state))
            t += dur
    log.append((t, tid, 0, G))
    return log


def test_constants():
    assert (MIN_GREEN, MAX_GREEN, YELLOW, ALL_RED) == (10, 90, 3, 2)


def test_clean_log_has_no_violations(net_xml):
    assert check_rules(_cycle_log(), net_xml) == []


def test_rules_flag_short_green(net_xml):
    log = _cycle_log(g2=30)
    # shorten the cross-street green of the second cycle to 8 s: shift later entries back
    start = [e for e in log if e[2] == 3][1][0]
    log = [e if e[0] <= start else (e[0] - 22,) + tuple(e[1:]) for e in log]
    msgs = check_rules(log, net_xml)
    assert len(msgs) == 1
    assert "J" in msgs[0] and str(start) in msgs[0] and "8" in msgs[0]


def test_rules_flag_long_green(net_xml):
    msgs = check_rules(_cycle_log(g1=95, cycles=2), net_xml)  # first segment too: max applies
    assert len(msgs) == 2 and all("95" in m for m in msgs)


def test_rules_flag_skipped_yellow_and_out_of_order(net_xml):
    log = [(0, "J", 0, G), (40, "J", 3, X), (70, "J", 4, YX), (73, "J", 5, R), (75, "J", 0, G),
           (100, "J", 1, YG)]
    msgs = check_rules(log, net_xml)
    assert any("yellow" in m and "40" in m for m in msgs)
    assert any("order" in m and "40" in m for m in msgs)


def test_rules_flag_wrong_yellow_and_all_red(net_xml):
    log = [(0, "J", 0, G), (40, "J", 1, YG), (44, "J", 2, R), (45, "J", 3, X), (75, "J", 4, YX),
           (78, "J", 5, R), (80, "J", 0, G), (120, "J", 1, YG)]
    msgs = check_rules(log, net_xml)
    assert len(msgs) == 2
    assert any("yellow" in m and "4" in m for m in msgs)
    assert any("all-red" in m and "1" in m for m in msgs)


def test_first_partial_phase_is_exempt(net_xml):
    # an offset start mid-green (only 5 s left) is not a short green
    log = _cycle_log(t0=0)
    log = [(0, "J", 0, G)] + [(t - 35, *rest) for t, *rest in log[1:]]
    assert check_rules(log, net_xml) == []


def test_plain_log_reads_states_from_net(net_xml, tmp_path):
    # 3-tuples resolve phase states via the program in net_xml: netconvert's default
    # program has 4 s yellow and no all-red, which the checker must reject.
    routes = build_routes(net_xml, CFG / "demand_evening.yaml", 1, 1.0, tmp_path)
    r = run(net_xml, routes, StaticProgram(), seed=1, duration=300)
    plain = [tuple(e[:3]) for e in r.phase_log]
    msgs = check_rules(plain, net_xml)
    assert msgs and any("yellow" in m for m in msgs)
    assert any(tid in " ".join(msgs) for tid in signal_ids(net_xml))


def test_phase_kind():
    assert rules.phase_kind("rrGgrr") == "green"
    assert rules.phase_kind("rryyrr") == "yellow"
    assert rules.phase_kind("rrrrrr") == "all_red"
