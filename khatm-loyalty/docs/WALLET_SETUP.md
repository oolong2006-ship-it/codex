# Wallet setup

The app runs with `WALLET_PROVIDER=mock` by default: customers use the web card and no Apple/Google calls are made.
Set `WALLET_PROVIDER=live` and configure either or both sides below. Each side activates only when its variables are set.

## Apple Wallet

1. Apple Developer Program membership (organisation account recommended for a Saudi CR).
2. Certificates, Identifiers & Profiles → Identifiers → **Pass Type IDs** → create e.g. `pass.sa.khatm.loyalty`.
3. Create a **Pass Type ID certificate** for it (upload a CSR), download `pass.cer`.
4. Convert to PEM:
   ```bash
   openssl x509 -inform der -in pass.cer -out pass-cert.pem
   # private key from the keychain export (.p12):
   openssl pkcs12 -in pass.p12 -nocerts -out pass-key.pem          # set a passphrase
   ```
5. Download the **Apple WWDR intermediate certificate (G4)** and convert to `wwdr.pem`.
6. Environment:
   ```
   WALLET_PROVIDER=live
   APPLE_PASS_TYPE_ID=pass.sa.khatm.loyalty
   APPLE_TEAM_ID=XXXXXXXXXX
   APPLE_PASS_CERT_PEM_PATH=/run/secrets/pass-cert.pem
   APPLE_PASS_KEY_PEM_PATH=/run/secrets/pass-key.pem
   APPLE_PASS_KEY_PASSPHRASE=...
   APPLE_WWDR_CERT_PEM_PATH=/run/secrets/wwdr.pem
   APP_URL=https://your-domain        # must be HTTPS: Wallet only calls HTTPS web services
   ```
7. Verify: open a web card on an iPhone → "Add to Apple Wallet" → stamp it from `/pos` → the pass updates within seconds
   and shows the change message. Wallet logs arrive at `/api/wallet/apple/v1/log` (server console).

The same certificate authenticates APNs pushes to `api.push.apple.com` (topic = Pass Type ID).

## Google Wallet

1. Google Pay & Wallet Console → create an **issuer account** → note the Issuer ID.
2. Google Cloud: enable the **Google Wallet API**, create a service account, download its JSON key.
3. In the Wallet console, add the service account email as a user with access to the issuer.
4. Environment:
   ```
   GOOGLE_WALLET_ISSUER_ID=3388000000000000000
   GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_PATH=/run/secrets/google-wallet.json
   ```
5. Program classes are created/updated automatically when the program is saved (outbox job `wallet.program_changed`);
   new classes start as `UNDER_REVIEW` — request publishing access in the console before going live.
6. The class logo is served from `/api/brand/<merchantId>/logo.png`, so `APP_URL` must be publicly reachable.

## NFC (roadmap)

Tap-to-stamp needs Apple's NFC pass entitlement (apply separately) and Google Smart Tap. Not implemented yet.
