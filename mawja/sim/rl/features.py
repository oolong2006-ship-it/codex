"""Observation and reward features shared by the training env and the RL controller.

Kept free of gymnasium / torch imports so both sides compute exactly the same numbers.

Per traffic light (agent), south -> north:

* ``OBS_LANES`` (12): halting vehicles on each incoming lane / the lane's capacity
  (length / 7.5 m), clipped to [0, 1]; lanes in controlled-link order, zero-padded;
* ``N_PHASES`` (4): one-hot of the green being served (or just ended, during its
  yellow / all-red), zero-padded;
* 1: seconds in the current green / MAX_GREEN (0 during yellow / all-red);
* 2: total halting on the incoming lanes of the south and the north neighbour / their
  total capacity (0 where there is no neighbour).

Reward of an agent (``reward="wait"``, used for the trained policy): minus the summed
accumulated waiting time (SUMO ``getAccumulatedWaitingTime``, s) of the vehicles on its
incoming lanes, times ``WAIT_REWARD_SCALE``. Summed over agents and seconds this is the
numerator of the ``avg_wait_s`` KPI (pooled vehicle-second mean of accumulated waiting),
restricted to vehicles queued at a signal, so the agent optimises what is reported.
Vehicles that are due but could not enter the network (``pending_insertion``: the entry
lane is full) are added with their departure delay to the agent whose approach they
would enter -- without this, starving an approach until it backs up to the network edge
hides the waiting of everyone behind it (a run without it reached 48 s avg wait on seed
2 by leaving 1709 vehicles outside the network).

Alternatives kept for reference (Task 8 report has the runs):

* ``reward="pressure"`` -- the brief's ``-sum_phase MaxPressure.pressure(conn, tls,
  phase)``. Its sum over phases counts outgoing lanes fed by several phases more than
  once, so it *rises* when downstream links back up; a first 0.5 M-step run learned
  exactly that (returns at demand >= 1.05 went from about -3400 to +3200, held-out-seed
  avg wait 161 s vs 84 s for max-pressure).
* ``reward="halting"`` -- minus halting vehicles on the incoming lanes (total delay
  rate). Learns, but treats a vehicle that waited 5 s like one that waited 150 s, while
  the KPI weights long waits more (1.46 M steps: 127 s vs 84 s on validation seed 2).
"""
from __future__ import annotations

from typing import Any

import numpy as np

from sim.controllers.max_pressure import MaxPressure, pressure
from sim.kpi import QUEUE_M_PER_HALTING_VEHICLE
from sim.rules import MAX_GREEN

OBS_LANES = 12
N_PHASES = 4
OBS_DIM = OBS_LANES + N_PHASES + 1 + 2
REWARD_SCALE = 0.02          # halting / pressure rewards
WAIT_REWARD_SCALE = 1e-3     # wait reward: per vehicle-second of accumulated waiting
REWARDS = ("wait", "halting", "pressure")


class Features:
    """Built once per simulation (after the signal program is installed)."""

    def __init__(self, conn: Any, tls_ids: list[str]):
        self.tls_ids = list(tls_ids)
        self.in_lanes: dict[str, list[str]] = {}
        self.cap: dict[str, np.ndarray] = {}
        self.agent_of_edge: dict[str, int] = {}
        for tid in self.tls_ids:
            lanes: list[str] = []
            for links in conn.trafficlight.getControlledLinks(tid):
                for lk in links:
                    if lk[0] not in lanes:
                        lanes.append(lk[0])
            if len(lanes) > OBS_LANES:
                raise ValueError(f"{tid}: {len(lanes)} incoming lanes > {OBS_LANES}")
            self.in_lanes[tid] = lanes
            for l in lanes:
                self.agent_of_edge[conn.lane.getEdgeID(l)] = len(self.in_lanes) - 1
            self.cap[tid] = np.array(
                [max(conn.lane.getLength(l) / QUEUE_M_PER_HALTING_VEHICLE, 1.0) for l in lanes])

    @property
    def n_agents(self) -> int:
        return len(self.tls_ids)

    def observe(self, conn: Any, signals: MaxPressure, t: int) -> np.ndarray:
        halt = conn.lane.getLastStepHaltingNumber
        n = self.n_agents
        obs = np.zeros((n, OBS_DIM), dtype=np.float32)
        occ = np.zeros(n)
        for k, tid in enumerate(self.tls_ids):
            h = np.array([halt(l) for l in self.in_lanes[tid]], dtype=float)
            obs[k, :len(h)] = np.clip(h / self.cap[tid], 0.0, 1.0)
            occ[k] = min(h.sum() / self.cap[tid].sum(), 1.0)
            obs[k, OBS_LANES + min(signals.green_index(tid), N_PHASES - 1)] = 1.0
            g = signals.green_seconds(tid, t)
            obs[k, OBS_LANES + N_PHASES] = 0.0 if g is None else min(g / MAX_GREEN, 1.0)
        base = OBS_LANES + N_PHASES + 1
        obs[1:, base] = occ[:-1]        # south neighbour
        obs[:-1, base + 1] = occ[1:]    # north neighbour
        return obs

    def rewards(self, conn: Any, signals: MaxPressure, kind: str = "wait") -> np.ndarray:
        """Per-agent reward for the current second (see module docstring)."""
        if kind == "wait":
            return self.wait_rewards(conn)
        if kind == "pressure":
            return self.pressure_rewards(conn, signals)
        if kind != "halting":
            raise ValueError(f"unknown reward {kind!r}; choose from {REWARDS}")
        halt = conn.lane.getLastStepHaltingNumber
        out = np.array([-float(sum(halt(l) for l in self.in_lanes[tid]))
                        for tid in self.tls_ids])
        return out * REWARD_SCALE

    def pressure_rewards(self, conn: Any, signals: MaxPressure) -> np.ndarray:
        """The brief's reward, -(sum over phases of max-pressure); reference only."""
        out = np.zeros(self.n_agents)
        for k, tid in enumerate(self.tls_ids):
            out[k] = -sum(pressure(conn, tid, st) for st in signals._greens[tid])
        return out * REWARD_SCALE

    def wait_rewards(self, conn: Any) -> np.ndarray:
        """-(accumulated waiting of vehicles on the incoming lanes) * WAIT_REWARD_SCALE."""
        ids = conn.lane.getLastStepVehicleIDs
        wait = conn.vehicle.getAccumulatedWaitingTime
        out = np.array([-sum(wait(v) for l in self.in_lanes[tid] for v in ids(l))
                        for tid in self.tls_ids], dtype=float)
        for vid in conn.simulation.getPendingVehicles():
            k = self.agent_of_edge.get(conn.vehicle.getRoute(vid)[0])
            if k is not None:
                out[k] -= max(conn.vehicle.getDepartDelay(vid), 0.0)
        return out * WAIT_REWARD_SCALE
