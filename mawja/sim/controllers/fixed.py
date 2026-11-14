"""Fixed-time baseline: Webster-optimised timings coordinated as a green wave along Olaya.

Plan (computed once in ``setup`` from the estimated demand, never adapted at runtime):

1. Arrival flows on every approach are derived from the demand model (entry volumes and
   turning ratios of ``demand_evening.yaml``, propagated junction by junction).
2. Each junction keeps netconvert's phase structure (Olaya / cross street, permissive
   lefts); every green is followed by YELLOW 3 s + ALL_RED 2 s (lost time 5 s per phase).
3. Critical flow ratio of a phase y = max over its approaches of q / (1800 veh/h/lane x
   lanes); Webster cycle C0 = (1.5 L + 5) / (1 - Y), clamped to 60-150 s.
4. Coordination needs one common cycle: the corridor runs at the largest junction C0
   (the critical junction). Each junction splits its effective green C - L in proportion
   to its own critical ratios (bounded by MIN_GREEN / MAX_GREEN).
5. Offsets: the Olaya green starts at junction i at d_i / v mod C, d_i = distance from the
   southernmost junction, v = progression speed (50 km/h): a northbound green wave.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import yaml

from sim.controllers.program import all_red_of, approach_edges, base_green_states, yellow_of
from sim.demand import _model
from sim.rules import ALL_RED, MAX_GREEN, MIN_GREEN, YELLOW

SAT_FLOW_VPH_PER_LANE = 1800.0
LOST_TIME_PER_PHASE_S = YELLOW + ALL_RED
MIN_CYCLE_S = 60.0
MAX_CYCLE_S = 150.0


def webster_cycle(y_crit: list[float], lost_s: float) -> float:
    """Webster optimum cycle (1.5 L + 5) / (1 - Y), clamped to [60, 150] s."""
    y = sum(y_crit)
    if y >= 1.0:
        return MAX_CYCLE_S
    return min(max((1.5 * lost_s + 5.0) / (1.0 - y), MIN_CYCLE_S), MAX_CYCLE_S)


def green_splits(cycle: float, y_crit: list[float], lost_s: float) -> list[int]:
    """Integer greens summing to cycle - lost (if bounds allow), proportional to y,
    each within [MIN_GREEN, MAX_GREEN]."""
    n = len(y_crit)
    total = int(round(cycle - lost_s))
    weights = [max(y, 0.0) for y in y_crit]
    if sum(weights) == 0:
        weights = [1.0] * n
    fixed: dict[int, float] = {}
    while True:
        free = [i for i in range(n) if i not in fixed]
        rest = total - sum(fixed.values())
        wsum = sum(weights[i] for i in free) or 1.0
        g = {i: rest * weights[i] / wsum for i in free}
        bad = {i: (MIN_GREEN if v < MIN_GREEN else MAX_GREEN)
               for i, v in g.items() if v < MIN_GREEN or v > MAX_GREEN}
        if not bad or not free:
            break
        fixed.update(bad)
        if len(fixed) == n:
            break
    exact = [fixed.get(i, g.get(i, 0.0)) for i in range(n)]
    out = [int(math.floor(v)) for v in exact]
    left = min(total, n * MAX_GREEN) - sum(out)
    for i in sorted(range(n), key=lambda i: exact[i] - out[i], reverse=True):
        if left <= 0:
            break
        if out[i] < MAX_GREEN:
            out[i] += 1
            left -= 1
    return out


def progression_offsets(distances_m: list[float], cycle: float, speed_kmh: float) -> list[int]:
    """Green-wave offsets: round(d / v) mod cycle for each junction."""
    v = speed_kmh / 3.6
    return [int(round(d / v)) % int(cycle) for d in distances_m]


def approach_flows(tls_ids: list[str], demand: dict, scale: float = 1.0) -> dict[str, float]:
    """Expected arrival flow (veh/h) on every edge, from entry flows and turning ratios."""
    flows, turns, _ = _model(tls_ids, demand, scale)
    entry: dict[str, float] = {}
    for e, q in flows:
        entry[e] = entry.get(e, 0.0) + q
    q = dict(entry)
    for _ in range(len(tls_ids) + 3):  # the corridor graph is acyclic: converges exactly
        nxt = dict(entry)
        for a, b, p in turns:
            nxt[b] = nxt.get(b, 0.0) + q.get(a, 0.0) * p
        q = nxt
    return q


class FixedWebster:
    """Webster fixed-time plan with green-wave offsets (see module docstring)."""

    name = "fixed"
    label_ar = "توقيت ثابت منسّق (موجة خضراء)"

    def __init__(self, demand_yaml: Path, progression_kmh: float = 50.0, scale: float = 1.0):
        self.demand_yaml = Path(demand_yaml)
        self.progression_kmh = float(progression_kmh)
        self.scale = float(scale)
        self.plan: dict | None = None

    def _compute_plan(self, conn: Any, tls_ids: list[str]) -> dict:
        demand = yaml.safe_load(self.demand_yaml.read_text(encoding="utf-8"))
        q = approach_flows(tls_ids, demand, self.scale)
        junctions: dict[str, dict] = {}
        for tid in tls_ids:
            greens = base_green_states(conn, tid)
            ys = []
            for st in greens:
                ys.append(max(q.get(e, 0.0) / (SAT_FLOW_VPH_PER_LANE * conn.edge.getLaneNumber(e))
                              for e in approach_edges(conn, tid, st)))
            lost = LOST_TIME_PER_PHASE_S * len(greens)
            junctions[tid] = {"green_states": greens, "y": ys, "Y": sum(ys),
                              "lost_s": lost, "webster_c0_s": webster_cycle(ys, lost)}
        cycle = int(math.ceil(max(j["webster_c0_s"] for j in junctions.values())))
        pos = [conn.junction.getPosition(tid) for tid in tls_ids]
        dist = [0.0]
        for a, b in zip(pos, pos[1:]):
            dist.append(dist[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        offsets = progression_offsets(dist, cycle, self.progression_kmh)
        for tid, d, off in zip(tls_ids, dist, offsets):
            j = junctions[tid]
            j["greens_s"] = green_splits(cycle, j["y"], j["lost_s"])
            j["offset_s"] = off
            j["distance_m"] = d
        return {"cycle_s": cycle, "distances_m": dist, "junctions": junctions,
                "progression_kmh": self.progression_kmh}

    def setup(self, conn: Any, tls_ids: list[str]) -> None:
        self.plan = plan = self._compute_plan(conn, tls_ids)
        tl = conn.trafficlight
        cycle = plan["cycle_s"]
        for tid in tls_ids:
            j = plan["junctions"][tid]
            phases = []
            for st, g in zip(j["green_states"], j["greens_s"]):
                phases += [tl.Phase(g, st), tl.Phase(YELLOW, yellow_of(st)),
                           tl.Phase(ALL_RED, all_red_of(st))]
            tl.setProgramLogic(tid, tl.Logic("webster", 0, 0, phases))
            tl.setProgram(tid, "webster")
            # Start mid-cycle so that the Olaya green (phase 0) begins at t = offset mod C.
            tau = (-j["offset_s"]) % cycle
            start = 0
            for k, ph in enumerate(phases):
                if start <= tau < start + ph.duration:
                    tl.setPhase(tid, k)
                    tl.setPhaseDuration(tid, start + ph.duration - tau)
                    break
                start += ph.duration

    def step(self, conn: Any, t: int) -> None:
        pass
