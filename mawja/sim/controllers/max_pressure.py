"""Max-pressure (back-pressure) control: the guaranteed adaptive fallback for Mawja.

Each junction keeps the same cyclic phase structure as the baselines (netconvert's
greens, Olaya first, each followed by YELLOW 3 s and ALL_RED 2 s), so the comparison is
fair and the signal rules hold by construction. The controller only decides "extend the
current green" or "advance to the next phase (through yellow and all-red)":

* during yellow / all-red: nothing (SUMO runs their fixed durations);
* green shorter than MIN_GREEN: extend;
* green reached MAX_GREEN: advance;
* otherwise, every ``decision_interval`` seconds after MIN_GREEN: advance if the next
  phase's pressure exceeds the current phase's pressure by more than ``threshold``.

Pressure of a phase (lane-level max-pressure): halting vehicles on the distinct incoming
lanes that have a green link in the phase, minus halting vehicles on the distinct
outgoing lanes those green links feed. Downstream queues (spillback) thus lower the
pressure of the movements that would feed them.
"""
from __future__ import annotations

from typing import Any

from sim.controllers.program import all_red_of, base_green_states, yellow_of
from sim.rules import ALL_RED, MAX_GREEN, MIN_GREEN, YELLOW

# Greens are ended by the controller (at MAX_GREEN at the latest), never by SUMO's timer.
_HOLD_S = 10 * 24 * 3600


def movement_lanes(conn: Any, tls_id: str, state: str) -> tuple[set[str], set[str]]:
    """(incoming lanes, outgoing lanes) of the links that are green (G/g) in ``state``."""
    ins: set[str] = set()
    outs: set[str] = set()
    for i, links in enumerate(conn.trafficlight.getControlledLinks(tls_id)):
        if i < len(state) and state[i] in "Gg":
            for lk in links:
                ins.add(lk[0])
                outs.add(lk[1])
    return ins, outs


def pressure(conn: Any, tls_id: str, phase: int | str) -> float:
    """Sum of incoming halting minus outgoing halting for the movements green in ``phase``.

    ``phase`` is a signal state string or an index into the tls's running program.
    """
    if isinstance(phase, str):
        state = phase
    else:
        tl = conn.trafficlight
        prog = tl.getProgram(tls_id)
        logic = next(lg for lg in tl.getAllProgramLogics(tls_id) if lg.programID == prog)
        state = logic.phases[int(phase)].state
    ins, outs = movement_lanes(conn, tls_id, state)
    halt = conn.lane.getLastStepHaltingNumber
    return float(sum(halt(l) for l in ins) - sum(halt(l) for l in outs))


class MaxPressure:
    """Lane-level max-pressure control within a fixed cyclic phase order."""

    name = "max_pressure"
    label_ar = "خوارزمية الضغط الأقصى"

    def __init__(self, decision_interval: int = 5, threshold: float = 0.0):
        if decision_interval < 1:
            raise ValueError("decision_interval must be >= 1 s")
        self.decision_interval = int(decision_interval)
        self.threshold = float(threshold)
        self._greens: dict[str, list[str]] = {}
        self._phase: dict[str, int] = {}
        self._start: dict[str, int] = {}
        self._ending: set[str] = set()

    def setup(self, conn: Any, tls_ids: list[str]) -> None:
        tl = conn.trafficlight
        self._greens, self._phase, self._start = {}, {}, {}
        self._ending = set()
        for tid in tls_ids:
            greens = base_green_states(conn, tid)
            phases = []
            for st in greens:
                phases += [tl.Phase(_HOLD_S, st), tl.Phase(YELLOW, yellow_of(st)),
                           tl.Phase(ALL_RED, all_red_of(st))]
            tl.setProgramLogic(tid, tl.Logic("max_pressure", 0, 0, phases))
            tl.setProgram(tid, "max_pressure")
            tl.setPhase(tid, 0)
            self._greens[tid] = greens
            self._phase[tid] = 0
            self._start[tid] = 0

    def step(self, conn: Any, t: int) -> None:
        tl = conn.trafficlight
        for tid, greens in self._greens.items():
            idx = tl.getPhase(tid)
            if idx != self._phase[tid]:          # a phase change took effect this step
                self._phase[tid] = idx
                self._start[tid] = t
            if idx % 3 != 0:                     # yellow / all-red: fixed, do nothing
                self._ending.discard(tid)
                continue
            if tid in self._ending:              # end of this green already requested
                continue
            # A switch requested now takes effect in the next simulation step, so the
            # green's length (as measured by the rule checker) would be t + 1 - start.
            green_s = t + 1 - self._start[tid]
            if green_s >= MAX_GREEN:
                self._end_green(tl, tid)
                continue
            if green_s < MIN_GREEN or (green_s - MIN_GREEN) % self.decision_interval:
                continue
            g = idx // 3
            cur = pressure(conn, tid, greens[g])
            nxt = pressure(conn, tid, greens[(g + 1) % len(greens)])
            if nxt - cur > self.threshold:
                self._end_green(tl, tid)

    def _end_green(self, tl: Any, tid: str) -> None:
        """Let SUMO move to this green's yellow (then all-red, next green) next step,
        exactly like a timed phase ends."""
        tl.setPhaseDuration(tid, 0)
        self._ending.add(tid)
