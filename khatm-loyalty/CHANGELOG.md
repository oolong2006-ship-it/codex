# Changelog

## 0.1.0 — MVP
- Domain core: merchants, branches, staff/RBAC, programs, customers, cards, immutable stamp/redemption events.
- Signed card barcodes with key rotation; DB-backed sessions; Postgres rate limiting; audit log.
- Apple Wallet pass generation (PKCS#7), Wallet web service and APNs pushes; Google Wallet save links and updates;
  mock provider + web card for local use.
- Merchant dashboard (Arabic/English, RTL): overview analytics, customers + CSV, program editor with live preview,
  printable QR poster, branches, staff, campaigns, integrations, activity log.
- Cashier PWA with camera scanning, phone/USB-scanner lookup, multi-stamp, redeem.
- Foodics webhook adapter (HMAC, idempotent), WhatsApp/console messaging, Saudi occasion campaign templates.
- PDPL: consent capture, export, merchant and self-service erasure.
- 43 Vitest tests (real Postgres) and Playwright E2E; CI workflow.
