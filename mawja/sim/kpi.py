"""KPI accumulation for one simulation run.

All per-second inputs come from the runner (step length 1 s). Definitions:

- ``avg_wait_s``: pooled mean over all vehicle-seconds of SUMO accumulated waiting time
  (``vehicle.getAccumulatedWaitingTime``) of each vehicle present in the network:
  ``sum_t sum_v wait(v, t) / sum_t N_t``, where N_t is the number of vehicles in the network
  at second t. Vehicles that never finish their trip are therefore included (no
  survivorship bias from trip-based averages). Vehicles still waiting to be *inserted*
  are not in the network and are not included here -- they are counted by
  ``pending_insertion``.
- ``max_queue_m``: max over time of the longest per-lane queue, where a lane's queue is
  ``lane.getLastStepHaltingNumber`` x ``QUEUE_M_PER_HALTING_VEHICLE`` (7.5 m = SUMO default
  passenger car length 5 m + minGap 2.5 m), capped at the lane's length. A queue that
  spills back past the upstream junction therefore shows as a full lane (it is a
  per-lane measure, not the total back-of-queue across several links).
- ``throughput``: vehicles that arrived at their destination.
- ``unfinished``: vehicles still in the network at the end of the run.
- ``pending_insertion``: vehicles whose departure time has passed but which SUMO could
  not insert yet because the entry lane is full (``simulation.getPendingVehicles``), at
  the end of the run. These vehicles appear in no other KPI.
- ``teleports``: SUMO teleports (runs use ``--time-to-teleport -1``, so expected 0).
- ``fuel_l`` / ``co2_kg``: sums of SUMO HBEFA emission outputs (mg per 1 s step).
- ``cost_sar``: delayed vehicle-hours x value of time + fuel litres x fuel price, where
  delayed vehicle-hours = sum over seconds of halting vehicles (speed < 0.1 m/s) / 3600.
"""
from __future__ import annotations

from typing import Iterable

# ASSUMPTION: value of time for a Riyadh driver, SAR per vehicle-hour of delay.
VALUE_OF_TIME_SAR_PER_H = 45.0
# ASSUMPTION: petrol price, SAR per litre (Saudi 91-octane, approximate).
FUEL_SAR_PER_L = 2.33
# Petrol density used to convert SUMO fuel mass (mg) to litres.
PETROL_DENSITY_G_PER_L = 745.0
# Queue length per halting vehicle: default car length 5 m + minGap 2.5 m.
QUEUE_M_PER_HALTING_VEHICLE = 7.5

KPI_KEYS = ("avg_wait_s", "max_queue_m", "throughput", "unfinished", "teleports",
            "fuel_l", "co2_kg", "cost_sar", "pending_insertion")


def cost_sar(delay_veh_h: float, fuel_l: float) -> float:
    """Economic cost: delayed vehicle-hours x VALUE_OF_TIME + litres x FUEL price."""
    return delay_veh_h * VALUE_OF_TIME_SAR_PER_H + fuel_l * FUEL_SAR_PER_L


class KpiAccumulator:
    """Accumulates per-second observations; ``finish`` returns the KPI dict."""

    def __init__(self) -> None:
        self._wait_sum = 0.0
        self._veh_seconds = 0
        self._halting_veh_s = 0
        self._max_queue_m = 0.0
        self._fuel_mg = 0.0
        self._co2_mg = 0.0

    def add_second(self, waits: Iterable[float], halting: int, lane_halting: Iterable[int],
                   lane_length_m: Iterable[float], fuel_mg: float, co2_mg: float) -> None:
        waits = list(waits)
        self._wait_sum += sum(waits)
        self._veh_seconds += len(waits)
        self._halting_veh_s += int(halting)
        for h, length in zip(lane_halting, lane_length_m):
            q = min(h * QUEUE_M_PER_HALTING_VEHICLE, length)
            if q > self._max_queue_m:
                self._max_queue_m = q
        self._fuel_mg += fuel_mg
        self._co2_mg += co2_mg

    @property
    def avg_wait_s(self) -> float:
        """Pooled vehicle-second mean waiting so far (equals the final KPI at the end)."""
        return self._wait_sum / self._veh_seconds if self._veh_seconds else 0.0

    @property
    def max_queue_m(self) -> float:
        """Longest per-lane queue so far (equals the final KPI at the end)."""
        return self._max_queue_m

    @property
    def delay_veh_h(self) -> float:
        return self._halting_veh_s / 3600.0

    def finish(self, arrived: int, unfinished: int, teleports: int,
               pending_insertion: int) -> dict[str, float]:
        fuel_l = self._fuel_mg / 1000.0 / PETROL_DENSITY_G_PER_L
        co2_kg = self._co2_mg / 1e6
        return {
            "avg_wait_s": self._wait_sum / self._veh_seconds if self._veh_seconds else 0.0,
            "max_queue_m": self._max_queue_m,
            "throughput": int(arrived),
            "unfinished": int(unfinished),
            "teleports": int(teleports),
            "fuel_l": fuel_l,
            "co2_kg": co2_kg,
            "cost_sar": cost_sar(self.delay_veh_h, fuel_l),
            "pending_insertion": int(pending_insertion),
        }
