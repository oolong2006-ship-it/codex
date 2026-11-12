"""Signal-timing rules every controller must obey, and a checker for a run's phase log.

Rules: fixed cyclic phase order (no skipping), green 10-90 s, every green is followed by
a 3 s yellow and a 2 s all-red before the next green.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable, Sequence

from sumolib.net import readNet

MIN_GREEN = 10
MAX_GREEN = 90
YELLOW = 3
ALL_RED = 2

_NEXT_KIND = {"green": "yellow", "yellow": "all_red", "all_red": "green"}


def phase_kind(state: str) -> str:
    """'yellow' if any signal shows yellow, else 'green' if any shows green, else 'all_red'."""
    if any(c in "yY" for c in state):
        return "yellow"
    if any(c in "Gg" for c in state):
        return "green"
    return "all_red"


def _net_states(net_xml: Path) -> dict[str, list[str]]:
    """Phase states of the (first) program of each traffic light stored in net_xml."""
    net = readNet(str(net_xml), withPrograms=True)
    out: dict[str, list[str]] = {}
    for tls in net.getTrafficLights():
        programs = list(tls.getPrograms().values())
        if programs:
            out[tls.getID()] = [p.state for p in programs[0].getPhases()]
    return out


def _state_of(entry: Sequence, net_states: dict[str, list[str]] | None) -> str:
    state = getattr(entry, "state", None)
    if state is None and len(entry) > 3:
        state = entry[3]
    if state is None:
        state = net_states[entry[1]][entry[2]]
    return state


def check_rules(phase_log: Iterable[Sequence], net_xml: Path) -> list[str]:
    """Return rule violations (empty list = OK); each message names the tls and the time.

    ``phase_log`` entries are (t, tls_id, phase_index) as logged by ``sim.runner.run``
    (which attaches the installed phase state as ``entry.state``), or explicit
    (t, tls_id, phase_index, state) tuples. Entries without a state are resolved against
    the program stored in ``net_xml``. The first logged phase of each tls may be partial
    (signal offsets) and the last one is still running, so neither is checked for minimum
    or exact duration; the first one is still checked against MAX_GREEN.
    """
    log = list(phase_log)
    net_states = None
    if any(getattr(e, "state", None) is None and len(e) <= 3 for e in log):
        net_states = _net_states(Path(net_xml))
    by_tls: dict[str, list[tuple[int, int, str]]] = {}
    for e in log:
        by_tls.setdefault(e[1], []).append((int(e[0]), int(e[2]), _state_of(e, net_states)))

    msgs: list[str] = []
    for tid, seq in by_tls.items():
        seq.sort(key=lambda x: x[0])
        n_phases = max(idx for _, idx, _ in seq) + 1
        for k, (t, idx, state) in enumerate(seq):
            kind = phase_kind(state)
            if k + 1 < len(seq):
                t2, idx2, state2 = seq[k + 1]
                dur = t2 - t
                first = k == 0
                if kind == "green" and dur > MAX_GREEN:
                    msgs.append(f"{tid} t={t}: green lasted {dur} s > max {MAX_GREEN} s")
                if not first:
                    if kind == "green" and dur < MIN_GREEN:
                        msgs.append(f"{tid} t={t}: green lasted {dur} s < min {MIN_GREEN} s")
                    if kind == "yellow" and dur != YELLOW:
                        msgs.append(f"{tid} t={t}: yellow lasted {dur} s, must be {YELLOW} s")
                    if kind == "all_red" and dur != ALL_RED:
                        msgs.append(f"{tid} t={t}: all-red lasted {dur} s, must be {ALL_RED} s")
                kind2 = phase_kind(state2)
                if kind2 != _NEXT_KIND[kind]:
                    missing = _NEXT_KIND[kind].replace("_", "-")
                    msgs.append(f"{tid} t={t2}: {kind.replace('_', '-')} -> "
                                f"{kind2.replace('_', '-')} without {missing}")
                if idx2 != (idx + 1) % n_phases:
                    msgs.append(f"{tid} t={t2}: phase order broken ({idx} -> {idx2}), "
                                f"phases must cycle without skipping")
    return msgs
