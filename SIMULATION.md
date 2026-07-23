# Simulation Engine — MASAR 34

The simulator lets the platform run realistically with **no physical sensors**. It is a
first-class subsystem: it writes real telemetry and raises real alerts/incidents.

## How it works
On `POST /simulations/start`, the service (`apps/api/src/simulator/simulator.service.ts`) creates
a `simulations` row and starts a 3-second interval (`setInterval`). One tick per organization runs
at a time. Each tick:

1. Loads the org's zones and gates.
2. For each **zone**: derives entry/exit flow from a baseline scaled by the scenario's
   `inflowFactor` / `outflowFactor` (with jitter and optional zone-type focus), updates
   `currentOccupancy`, writes a `crowd_readings` row with computed density & risk, and raises a
   **CROWD_DENSITY** alert when risk ≥ 90.
3. For each **gate**: computes arrival/service rate and queue length, writes a `queue_readings`
   row via the shared `queueMetrics()` function, and raises a **QUEUE_TIME** alert on long waits.
4. Rolls scenario dice for **incidents** (`incidentChance`) and **device disruptions**
   (`disruptionChance`).
5. Persists a `simulation_events` snapshot and emits `sim:tick` over WebSocket to the org room.

`POST /simulations/stop` clears the interval and marks the run `STOPPED`.

## Scenarios (`apps/api/src/simulator/scenarios.ts`)
| Key | AR | inflow | outflow | incident | disruption |
|-----|----|--------|---------|----------|-----------|
| NORMAL | فعالية عادية | 1.0 | 1.0 | 0.02 | 0.01 |
| HIGH_ATTENDANCE | حضور مرتفع | 1.8 | 0.9 | 0.05 | 0.02 |
| GATE_FAILURE | تعطل بوابة | 1.2 | 0.6 | 0.08 | 0.40 |
| CROWD_SURGE | تدفق مفاجئ | 2.5 | 0.7 | 0.12 | 0.03 |
| TRANSPORT_DELAY | تأخر النقل | 0.6 | 0.5 | 0.04 | 0.02 |
| EMERGENCY_EVACUATION | إخلاء طارئ | 0.1 | 3.0 | 0.20 | 0.05 |
| FOOD_ZONE_CONGESTION | ازدحام الطعام | 1.3 | 0.8 | 0.05 | 0.02 |
| MULTIPLE_INCIDENTS | حوادث متعددة | 1.4 | 0.9 | 0.30 | 0.10 |
| CAMERA_OFFLINE | كاميرا خارج الخدمة | 1.0 | 1.0 | 0.03 | 0.50 |
| STAFF_SHORTAGE | نقص الموظفين | 1.2 | 0.5 | 0.07 | 0.03 |

## Analytics used
`crowdRiskScore`, `densityLevelFromPercentage`, `occupancyPercentage`, `predictOccupancy`,
`queueMetrics`, `movingAverage` — all pure and unit-tested in
`apps/api/src/common/analytics.spec.ts`.
