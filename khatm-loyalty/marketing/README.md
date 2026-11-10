# Marketing site

`site.tpl.html` is the single source of the marketing page. It is rendered two ways by
`src/server/marketing.ts`:

- **In the app** at `/` (`src/app/route.ts`): self-hosted fonts (`public/fonts`, copied by
  `scripts/copy-fonts.mjs` on `predev`/`prebuild`), photos from `public/img`, links to `/signup` and `/login`.
- **Standalone** `index.html` (`npm run marketing:build`): Google Fonts and embedded photos, for any static host.

Photos are from Unsplash (free licence, commercial use allowed).

Before going live, edit `site.tpl.html`:
- `WA_NUMBER` in the script: the sales WhatsApp number (digits only, e.g. `9665XXXXXXXX`).
- Prices (`data-m` / `data-y`) and the launch offer text.
- Feature claims for Apple/Google Wallet and Foodics should match what is activated (see the main README status table).
