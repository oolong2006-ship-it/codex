"""Conventional actuated control: SUMO's gap-based ``actuated`` programs.

Each junction keeps netconvert's phase structure; greens extend while induction loops
(created by SUMO for the actuated program) see arrivals, between MIN_GREEN and MAX_GREEN;
yellow and all-red are fixed. No coordination between junctions.
"""
from __future__ import annotations

from typing import Any

from libsumo import constants as tc

from sim.controllers.program import all_red_of, base_green_states, yellow_of
from sim.rules import ALL_RED, MAX_GREEN, MIN_GREEN, YELLOW


class Actuated:
    name = "actuated"
    label_ar = "تحكم متكيف تقليدي"

    def setup(self, conn: Any, tls_ids: list[str]) -> None:
        tl = conn.trafficlight
        for tid in tls_ids:
            phases = []
            for st in base_green_states(conn, tid):
                phases += [tl.Phase(MIN_GREEN, st, MIN_GREEN, MAX_GREEN),
                           tl.Phase(YELLOW, yellow_of(st), YELLOW, YELLOW),
                           tl.Phase(ALL_RED, all_red_of(st), ALL_RED, ALL_RED)]
            tl.setProgramLogic(tid, tl.Logic("actuated", tc.TRAFFICLIGHT_TYPE_ACTUATED, 0,
                                             phases))
            tl.setProgram(tid, "actuated")
            tl.setPhase(tid, 0)

    def step(self, conn: Any, t: int) -> None:
        pass
