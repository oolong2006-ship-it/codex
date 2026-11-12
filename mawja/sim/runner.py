"""Run one SUMO simulation with a controller and collect KPIs.

Uses libsumo (in-process). libsumo allows only one simulation at a time per process;
``run`` always closes it (also on error), so runs can be repeated sequentially.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import libsumo
from libsumo import constants as tc

from sim.controllers.base import Controller
from sim.kpi import KpiAccumulator
from sim.network import signal_ids

DEFAULT_DURATION_S = 7200  # demand duration (evening peak 16:00-18:00)
HALTING_SPEED_MS = 0.1     # SUMO's halting threshold

_VEH_VARS = [tc.VAR_ACCUMULATED_WAITING_TIME, tc.VAR_SPEED, tc.VAR_FUELCONSUMPTION,
             tc.VAR_CO2EMISSION]
_VEH_VARS_REC = _VEH_VARS + [tc.VAR_POSITION]


@dataclass
class RunResult:
    kpis: dict[str, float]
    frames: list[dict] | None
    phase_log: list[tuple[int, str, int]]
    # Extra data that is not a KPI (delayed vehicle-hours, duration).
    diagnostics: dict[str, float] = field(default_factory=dict)


def _sumo_cmd(net_xml: Path, routes: Path, seed: int, duration: int) -> list[str]:
    # --waiting-time-memory: SUMO's default (100 s) caps getAccumulatedWaitingTime; make it
    # cover the whole run so the waiting KPI is a true accumulated wait.
    memory = max(int(duration), DEFAULT_DURATION_S) + 1
    return ["sumo", "-n", str(net_xml), "-r", str(routes),
            "--waiting-time-memory", str(memory),
            "--seed", str(int(seed)), "--time-to-teleport", "-1", "--step-length", "1",
            "--no-warnings", "true", "--no-step-log", "true"]


def run(net_xml: Path, routes: Path, controller: Controller, seed: int,
        record: bool = False, duration: int | None = None) -> RunResult:
    """Simulate ``duration`` seconds (None = 7200) and return KPIs (see ``sim.kpi``).

    Each second: advance SUMO one step, measure, then call ``controller.step(conn, t)``.
    Phase changes are logged as (t, tls_id, phase index), including initial phases at t=0.
    """
    duration = DEFAULT_DURATION_S if duration is None else int(duration)
    tls_ids = signal_ids(Path(net_xml))
    conn = libsumo
    try:
        conn.close()  # in case a previous run in this process crashed before closing
    except Exception:
        pass
    conn.start(_sumo_cmd(Path(net_xml), Path(routes), seed, duration))
    try:
        lanes = [l for l in conn.lane.getIDList() if not l.startswith(":")]
        lane_len = {l: conn.lane.getLength(l) for l in lanes}
        for l in lanes:
            conn.lane.subscribe(l, [tc.LAST_STEP_VEHICLE_HALTING_NUMBER])
        var_ids = _VEH_VARS_REC if record else _VEH_VARS

        controller.setup(conn, list(tls_ids))
        phase = {tid: conn.trafficlight.getPhase(tid) for tid in tls_ids}
        phase_log: list[tuple[int, str, int]] = [(0, tid, p) for tid, p in phase.items()]
        frames: list[dict] | None = [] if record else None
        acc = KpiAccumulator()
        arrived = teleports = 0

        for t in range(1, duration + 1):
            conn.simulationStep()
            for vid in conn.simulation.getDepartedIDList():
                conn.vehicle.subscribe(vid, var_ids)
            arrived += conn.simulation.getArrivedNumber()
            teleports += conn.simulation.getStartingTeleportNumber()

            veh = conn.vehicle.getAllSubscriptionResults()
            waits = [v[tc.VAR_ACCUMULATED_WAITING_TIME] for v in veh.values()]
            halting = sum(1 for v in veh.values() if v[tc.VAR_SPEED] < HALTING_SPEED_MS)
            fuel = sum(v[tc.VAR_FUELCONSUMPTION] for v in veh.values())
            co2 = sum(v[tc.VAR_CO2EMISSION] for v in veh.values())
            lane_res = conn.lane.getAllSubscriptionResults()
            lane_halt = [r[tc.LAST_STEP_VEHICLE_HALTING_NUMBER] for r in lane_res.values()]
            lengths = [lane_len[l] for l in lane_res]
            acc.add_second(waits, halting, lane_halt, lengths, fuel, co2)

            if frames is not None:
                frames.append({
                    "t": t,
                    "vehicles": [{"id": vid, "x": v[tc.VAR_POSITION][0],
                                  "y": v[tc.VAR_POSITION][1],
                                  "wait": v[tc.VAR_ACCUMULATED_WAITING_TIME]}
                                 for vid, v in veh.items()],
                    "tls": {tid: conn.trafficlight.getRedYellowGreenState(tid)
                            for tid in tls_ids},
                })

            controller.step(conn, t)
            for tid in tls_ids:
                p = conn.trafficlight.getPhase(tid)
                if p != phase[tid]:
                    phase[tid] = p
                    phase_log.append((t, tid, p))

        unfinished = conn.vehicle.getIDCount()
        pending = len(conn.simulation.getPendingVehicles())  # departure due, not inserted
        kpis = acc.finish(arrived=arrived, unfinished=unfinished, teleports=teleports,
                          pending_insertion=pending)
        diagnostics = {"delay_veh_h": acc.delay_veh_h,
                       "duration_s": duration}
        return RunResult(kpis=kpis, frames=frames, phase_log=phase_log,
                         diagnostics=diagnostics)
    finally:
        conn.close()
