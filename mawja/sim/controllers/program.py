"""Helpers to build rule-abiding signal programs from netconvert's default phase states."""
from __future__ import annotations

from typing import Any

from sim.rules import phase_kind


def yellow_of(state: str) -> str:
    """Yellow transition state: every green (G/g) signal turns yellow, the rest stays red."""
    return "".join("y" if c in "Gg" else "r" for c in state)


def all_red_of(state: str) -> str:
    return "r" * len(state)


def base_green_states(conn: Any, tid: str) -> list[str]:
    """Green phase states of the tls's current program, rotated so the phase serving the
    northbound Olaya approach (incoming edge ``<upstream>__<tid>``) comes first."""
    tl = conn.trafficlight
    prog = tl.getProgram(tid)
    logic = next(lg for lg in tl.getAllProgramLogics(tid) if lg.programID == prog)
    greens = []
    for ph in logic.phases:
        if phase_kind(ph.state) == "green" and ph.state not in greens:
            greens.append(ph.state)
    links = tl.getControlledLinks(tid)

    def serves_olaya(state: str) -> bool:
        return any(state[i] in "Gg" and lk and lk[0][0].rsplit("_", 1)[0].endswith(f"__{tid}")
                   for i, lk in enumerate(links))

    first = next((k for k, s in enumerate(greens) if serves_olaya(s)), 0)
    return greens[first:] + greens[:first]


def approach_edges(conn: Any, tid: str, state: str) -> set[str]:
    """Incoming edges that have at least one green (G/g) link in ``state``."""
    edges = set()
    for i, lk in enumerate(conn.trafficlight.getControlledLinks(tid)):
        if lk and state[i] in "Gg":
            edges.add(conn.lane.getEdgeID(lk[0][0]))
    return edges
