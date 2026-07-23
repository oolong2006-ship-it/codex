# Roadmap — MASAR 34

This MVP delivers the operational core. The items below complete the master specification.

## Near-term (next iteration)
- **Reports export:** generate Executive / Gate / Zone / Incident / Partner reports as PDF & Excel
  (data models + `reports` table already present).
- **Partner Portal UI:** demand forecast (30/60-min), queue status, operational alerts scoped to
  the partner's location (APIs + `partners`, `partner_locations`, `transactions`, `demand_forecasts`).
- **Fan Experience PWA:** venue map, best/accessible/family routes, nearest services, queue times,
  safety notifications (no ticketing coupling; integration layer only).
- **Field Ops mobile flows:** offline mode, QR check-in, geo-confirmation, photo upload.
- **Control Room fullscreen mode:** 4K layout with map + heatmap + live panels.

## Mid-term
- **AI service (Python FastAPI):** Prophet/XGBoost/LightGBM for congestion, queue, occupancy,
  incident-risk and demand forecasting, with an Explainable-AI layer (factors + confidence +
  recommended action). MVP baseline lives in `analytics.ts` and can be swapped behind the same API.
- **Integrations framework:** real connectors (CCTV people-counting, IoT sensors, POS, parking,
  transport, weather) via webhook ingestion + retry/failed-event queue (`webhook_events` present).
- **Notifications:** Email / SMS / WhatsApp senders (channels modelled in `notifications`).
- **Digital twin:** map-based scenario simulator UI on top of the existing engine.

## Hardening
- MFA flows, API-key rotation, encryption-at-rest, backups/DR runbooks, data retention/deletion,
  ISO 27001 controls, load testing, and expanded E2E (Playwright) coverage to ≥70% on critical paths.

## Technical debt / notes
- Frontend currently polls; switch dashboards to the WebSocket stream (`sim:tick`, `alert:new`).
- Add integration tests (supertest) for auth + tenant-isolation on top of the existing unit tests.
