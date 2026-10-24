# Taqam Brand Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin every Taqam surface (marketing site, company dashboard, employee app, platform admin portal, services PDF, slide deck) with the new visual identity, with a modern, professional finish and no leftovers of the old palette.

**Architecture:** All web UI already styles through Tailwind tokens (`primary`, `accent`, `sand`, `ink`, `line`) and shared primitives in `src/components/ui`. We introduce one source of truth, `src/lib/brand.ts`, map the Tailwind tokens onto it, swap the fonts and logo, then remove the 38 hard-coded legacy hex values in 20 files. A vitest suite pins contrast, the token mapping and the absence of legacy colors. Collateral (PDF and slides) is recoloured from the same values.

**Tech Stack:** Next.js 15.5, React 19, Tailwind 3.4, next/font/google, vitest 2.1.9 (new dev dependency in `apps/web`), Playwright (screenshots), Chromium (PDF).

**Spec:** `taqam/brand/brand-book.html` (palette, typography, mark, usage rules) and `taqam/docs/PRODUCT.md`.

## Global Constraints

- Palette (verbatim from brand book): Oasis `#0E8C7A`, Night `#0C1F24`, Saffron `#FFB547`, Dune `#E9E1D2`, Mist `#F4F7F5`, Slate `#50645F`, Line `#DCE4E0`.
- UI text/button green is Oasis-600 `#0B7A6B` (white on it = 5.24:1); raw Oasis `#0E8C7A` (4.16:1 with white) is only for the logo, large type (≥ 24px bold) and fills without text.
- Saffron carries dark text only (`#0C1F24` on `#FFB547` = 9.66:1); it marks people and the single primary action per screen.
- Fonts: display = Alexandria (300/500/600/700/800), body/UI = IBM Plex Sans Arabic (400/500/600/700). Both via `next/font/google`.
- Logo: the node-T mark from the brand book (64×64 grid: bar `M17 23H47`, stem `M32 23V43`, stroke 5 round, nodes r6 at (17,23),(47,23), saffron node r7.5 at (32,46), tile rx 18).
- Arabic leads, RTL default; English via `t()` must render in the same fonts.
- No new runtime dependencies. Do not change API, data or behaviour; this is a visual change only.
- Static demo export (`NEXT_PUBLIC_DEMO=1 NEXT_PUBLIC_BASE_PATH=/codex`) must keep building.

## Review Focus

1. Small grey captions on Mist failing contrast (old `ink-soft` `#8A9893` is 3.3:1) → `ink.soft` must be ≥ 4.5:1 on white and Mist. Pinned in Task 1 contrast test.
2. Saffron used behind white text (old accent buttons used `hover:text-white`) → hover keeps Night text. Pinned in Task 4 legacy scan (`hover:text-white` banned on accent buttons via Button test).
3. Charts where two series become indistinguishable after recolour (present/late/absent; gross/net) → series colours differ in lightness, not hue alone. Pinned in Task 1 (`CHART` palette lightness test).
4. Print payslip turning into grey boxes (background colours stripped) → print view keeps black text on white. Checked in Task 5 screenshot.
5. English toggle falling back to system font → Alexandria/Plex declare `latin` subset. Checked in Task 2 font config test.

---

### Task 1: Brand source of truth and test harness

**Files:**
- Create: `taqam/apps/web/src/lib/brand.ts`
- Create: `taqam/apps/web/src/lib/brand.test.ts`
- Create: `taqam/apps/web/vitest.config.ts`
- Modify: `taqam/apps/web/package.json` (devDependency `vitest: 2.1.9`, script `"test": "vitest run"`)

**Interfaces:**
- Produces: `BRAND` (object of hex strings: `oasis, oasis600, oasis700, oasis100, oasis50, night, night800, saffron, saffron600, saffron100, saffron50, dune, mist, mist200, slate, soft, line, white, success, warning, danger, info` + `*50` tints for the four status colours), `CHART: readonly string[]` (series order: oasis600, saffron, night, danger, info), `contrastRatio(fg: string, bg: string): number`, `relativeLuminance(hex: string): number`.

- [ ] **Step 1: Write the failing tests** in `brand.test.ts`:
  - `contrastRatio('#000000','#FFFFFF')` → `21`; `contrastRatio('#FFFFFF','#FFFFFF')` → `1`.
  - AA pairs ≥ 4.5: (white, oasis600), (night, saffron), (night, mist), (slate, mist), (slate, white), (soft, white), (soft, mist), (oasis600, mist), (white, night), (danger, white).
  - `CHART` adjacent entries differ in relative luminance by ≥ 0.08.
- [ ] **Step 2: Run** `cd taqam/apps/web && npm i -D vitest@2.1.9 && npx vitest run` → FAIL (module not found).
- [ ] **Step 3: Implement `brand.ts`** with the Global Constraints values; `soft` = `#5E6E69` (≥4.5 on white and Mist); status: success `#1E8A5A`, warning `#B7791F` (text use) with tint `#FDF3DC`, danger `#C2412D`, info `#2F6F9F`.
- [ ] **Step 4: Run** `npx vitest run` → PASS.
- [ ] **Step 5: Commit** `feat(web): brand tokens source of truth with contrast tests`.

### Task 2: Tailwind tokens and typography

**Files:**
- Modify: `taqam/apps/web/tailwind.config.ts`
- Modify: `taqam/apps/web/src/app/layout.tsx` (fonts, `themeColor`)
- Modify: `taqam/apps/web/src/app/globals.css`
- Test: `taqam/apps/web/src/lib/theme.test.ts`

**Interfaces:**
- Consumes: `BRAND` from Task 1.
- Produces: Tailwind colours `primary{DEFAULT:oasis600,600:oasis700,500:oasis,100,50}`, `night{DEFAULT,800}`, `accent{DEFAULT:saffron,600,100,50}`, `sand{DEFAULT:mist,200:mist200,300:dune}`, `ink{DEFAULT:night,muted:slate,soft}`, `line`, status colours; font families `sans: var(--font-plex)` and `display: var(--font-display)`; CSS rule `h1,h2,h3 { font-family: var(--font-display) }`.

- [ ] **Step 1: Write failing test** `theme.test.ts`: importing `tailwind.config` gives `colors.primary.DEFAULT === BRAND.oasis600`, `colors.night.DEFAULT === BRAND.night`, `colors.accent.DEFAULT === BRAND.saffron`, `colors.sand.DEFAULT === BRAND.mist`, `colors.ink.DEFAULT === BRAND.night`, `fontFamily.display[0] === 'var(--font-display)'`.
- [ ] **Step 2: Run** `npx vitest run src/lib/theme.test.ts` → FAIL.
- [ ] **Step 3: Implement** config mapping from `BRAND` (shadows tinted with Night rgba); in `layout.tsx` add `Alexandria({subsets:['arabic','latin'], weight:['300','500','600','700','800'], variable:'--font-display'})` alongside Plex, `themeColor: BRAND.night`; `globals.css` body background `#F4F7F5`, headings use display font, replace the diagonal `.taqam-pattern` with a node-dot pattern (radial dots on a 24px grid, saffron at 12% alpha).
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(web): map tailwind tokens and fonts to the new identity`.

### Task 3: Logo, app icon and manifest

**Files:**
- Modify: `taqam/apps/web/src/components/ui/Logo.tsx`
- Modify: `taqam/apps/web/src/app/icon.svg`
- Modify: `taqam/apps/web/public/manifest.webmanifest`
- Create: `taqam/apps/web/src/components/ui/LogoMark.tsx`

**Interfaces:**
- Produces: `LogoMark({ size?: number; tone?: 'oasis'|'night'|'white'; className?: string })` (SVG per Global Constraints; `white` tone = white tile, oasis glyph); `Logo({ className?, light?, showLatin?: boolean })` = mark + «طاقم» in Alexandria 800 + optional `taqam` in Alexandria 500 (saffron on dark, oasis600 on light).

- [ ] **Step 1:** Implement `LogoMark` and rewrite `Logo` (keep the existing `light` prop so call sites are unchanged).
- [ ] **Step 2:** Replace `icon.svg` with the mark (tile `#0E8C7A`); manifest `theme_color` `#0C1F24`, `background_color` `#F4F7F5`.
- [ ] **Step 3: Run** `npx tsc --noEmit` → PASS.
- [ ] **Step 4: Commit** `feat(web): node-T logo mark and app icon`.

### Task 4: Remove legacy colours

**Files:**
- Create: `taqam/apps/web/src/lib/legacy-colors.test.ts`
- Modify (each hard-coded legacy hex → token class or `BRAND.*`): `components/ess/{primitives,CheckInCard,EssShell}.tsx`, `components/app/{primitives,charts}.tsx`, `components/marketing/PricingPage.tsx`, `app/app/attendance/{roster,shifts}/page.tsx`, `app/app/org-chart/page.tsx`, `app/app/recruitment/[id]/JobBoardClient.tsx`, `app/me/{more,leaves}/page.tsx`, `app/me/layout.tsx`, `lib/adminTypes.ts`, `demo/{seed,seed-platform,routes-core}.ts` (shift/avatar colours), `components/ui/Button.tsx` (accent variant hover keeps `text-night`).
- Modify dark surfaces that should be Night, not green: ESS hero card, marketing final CTA band and hero mock frame, dashboard topbar avatar, admin shell (already Night literal → `bg-night`).

**Interfaces:**
- Consumes: `BRAND`, `CHART`, Tailwind `night` token.

- [ ] **Step 1: Write failing test** `legacy-colors.test.ts`: walk `src/**/*.{ts,tsx,css,svg}` and `public/manifest.webmanifest`; fail listing file:line for any of `#0F3D3E #145A5C #1F7A7C #F2A541 #D98B23 #FAF6EF #F1E9DB #E6DAC5 #1B2421 #5C6B66 #8A9893 #E7E1D6 #CFE3E0 #DCEBEA rgba(15,61,62 rgba(242,165,65` (case-insensitive). Second test: `Button.tsx` source does not contain `hover:text-white` inside the `accent` variant string.
- [ ] **Step 2: Run** `npx vitest run src/lib/legacy-colors.test.ts` → FAIL with the 38 hits.
- [ ] **Step 3:** Replace each hit; charts take series colours from `CHART`; seed shift colours use `BRAND.oasis600, BRAND.saffron600, BRAND.info, BRAND.night800`.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `refactor(web): remove legacy palette`.

### Task 5: Visual polish and verification of every surface

**Files:**
- Modify as findings require: `components/marketing/*` (hero: animated node-network canvas from the brand book behind the dashboard mock, respects `prefers-reduced-motion`), `components/app/AppShell.tsx` (sidebar active item Oasis tint, section labels in display font), `components/ess/EssShell.tsx`, `components/admin/AdminShell.tsx`, `components/ui/{Card,Stat,Badge,Tabs}.tsx` (radius 16/24, Line border, Night-tinted shadow).
- Create: `/tmp/claude-0/qa/brand-shots.js` (Playwright script; not committed).

- [ ] **Step 1:** Build and serve: `npx next build && npx next start -p 3100` with the API on 4100 (`node dist/main.js`).
- [ ] **Step 2:** Screenshot at 1440 and 390: `/`, `/pricing`, `/tools/end-of-service`, `/login`, `/app` (hr), `/app/payroll/<id>`, `/me` (employee), `/me/payslips/<id>` print media, `/admin` (admin). Expected: no old green/sand, display font on headings, logo mark everywhere, no console errors.
- [ ] **Step 3:** Fix what the screenshots show (one pass), re-run `npx vitest run && npx tsc --noEmit && npx next build` and the demo export build → all PASS.
- [ ] **Step 4: Commit** `style(web): modern polish across marketing, dashboard, ESS and admin`.

### Task 6: Collateral — services PDF and slide deck

**Files:**
- Modify: `taqam/marketing/profile.html` (CSS variables → brand values, Alexandria headings, node mark SVG in cover/contact, pattern → node dots)
- Regenerate: `taqam/marketing/Taqam-Services-Profile.pdf`
- Modify + republish: slide files in the scratchpad deck folder (`project/slides/*.html`, `project/deck.json` faces add Alexandria) for artifact `https://claude.ai/artifact/FF1BNjj2RcWPRnre8wo2uY`

- [ ] **Step 1:** Update `profile.html`; render with `/tmp/claude-0/qa/pdf.js`. Expected: 15 pages, `font loaded: true`, pages 1, 8, 12, 15 screenshots show new palette and no overflow into the footer.
- [ ] **Step 2:** Recolour slides with `sed` substitutions of the old hex values to brand values; add Alexandria face; republish to the same artifact URL.
- [ ] **Step 3: Commit** `docs(taqam): services profile and deck in the new identity`.

### Task 7: Ship

- [ ] **Step 1:** `git push` (no `[skip ci]`) → Taqam CI, CI and Pages deploy run.
- [ ] **Step 2:** Check runs via GitHub Actions: all `success`. On failure read logs, fix, push again.
- [ ] **Step 3:** Report the demo link and what changed.
