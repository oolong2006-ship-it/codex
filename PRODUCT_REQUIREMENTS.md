# Product Requirements — MASAR 34

## Vision
A Saudi, government-grade SaaS for crowd, queue and operations management across stadiums, fan
zones, airports, transport hubs, festivals, exhibitions, and pilgrimage sites.

## Personas / roles
Super Admin, Organization Admin, Operations Manager, Control Room Operator, Field Supervisor,
Analyst, Partner User. Permissions per role are defined in `apps/api/src/common/rbac.ts`.

## Core capabilities (spec → status)
| Capability | MVP status |
|-----------|------------|
| Live crowd density per zone | ✅ |
| Queue length & waiting time at gates/services | ✅ |
| Congestion prediction (baseline, ML-ready) | ✅ baseline |
| Operational alerts (12 types, 5 severities, lifecycle) | ✅ |
| Response recommendations | ✅ (queue engine) |
| Incident management (13 types, timeline, SLA fields) | ✅ |
| Field team dispatch & tasks (8-state flow) | ✅ |
| Multi-tenant organizations | ✅ |
| Venues / zones / gates / events | ✅ |
| Executive dashboard + realtime | ✅ |
| Data simulation (10 scenarios) | ✅ |
| Partner portal | 🟡 model + read APIs |
| Fan experience PWA | ⚪ scaffolded |
| Reports (PDF/Excel export) | ⚪ model present |
| Digital twin scenario UI | ⚪ engine present, UI later |
| AI service (Prophet/XGBoost) | ⚪ documented |
| Integrations (CCTV/IoT/POS/…) | ⚪ model + webhook table |

## Non-functional
- Arabic default + English, full RTL/LTR.
- Accessible: color is never the only signal (labels + icons on density/risk).
- Realtime updates (WebSocket).
- Security & privacy per `SECURITY.md`; no facial recognition.

## Acceptance criteria coverage
Runs via Docker Compose; demo-user login; enforced permissions; multi-tenancy; create venue/event;
crowd data; simulation; live data change; alert generation; incident creation; task assignment;
Arabic/English + RTL; no TypeScript/build errors; core tests pass; operational docs. Remaining
gaps (reports export, partner/fan UIs) are tracked in `ROADMAP.md`.
