# MASAR 34 — World-Class Platform Finishing Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Backend logic tasks follow strict TDD; UI tasks verify by typecheck + production build + a real-browser screenshot (UI correctness is visual, not unit-testable).

**Goal:** Raise the existing MASAR 34 web app from a functional MVP UI to a government-grade, world-class product experience (cohesive design system, polished pages, full responsiveness, Arabic RTL + dark control-room mode), and add one TDD-driven backend capability (incident SLA-breach detection) surfaced in the UI.

**Architecture:** Introduce a token-based design system (CSS custom properties + Tailwind theme) and a small reusable component library under `apps/web/src/components/ui`. Rebuild the app shell and every page on those primitives. Backend change is a pure, unit-tested function consumed by the incidents service and dashboard aggregation.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, Recharts (web); NestJS, Prisma (api). No new runtime deps unless noted.

**Spec:** The original MASAR 34 master prompt (crowd/queue/ops platform) + this session's status matrix in `README.md`. This plan implements the "world-class, professional, global" finishing pass.

## Global Constraints

- Arabic is the default language and RTL is the default direction; English/LTR fully supported via the existing `lang-context`.
- Accessibility: status is never conveyed by color alone — always pair with an icon and a text label. Visible keyboard focus. Respect `prefers-reduced-motion`.
- Three themes supported via `data-theme` on `<html>`: `light` (admin/reports), `dark` (control room), falling back to `prefers-color-scheme`. Every component styled through tokens, never hard-coded colors.
- No `any` in TypeScript. Every data view handles loading, empty, and error states.
- Brand: MASAR green (`--accent` ≈ `#0f7a52` light / `#2bd08f` dark). Semantic risk colors are separate from the brand accent.
- Do NOT modify the unrelated `alnadeg-procurement/` directory.
- Fonts: use a crafted system-font stack (no build-time external font fetch) to keep the production build hermetic behind the proxy.
- Mobile: no horizontal page scroll at 390px width; wide tables scroll inside their own container.

## Review Focus

- **RTL logical layout:** new components must use logical properties (`inset-inline`, `margin-inline`, `ps/pe`) so they mirror correctly — verify by screenshotting one LTR and one RTL page. (Task 2)
- **Theme token coverage:** every new surface must define its color in all three theme blocks; a token used but not redefined in dark leaves an unreadable panel — verify dark screenshots of every page. (Tasks 2,4,5,6,7)
- **Mobile breakpoint:** KPI grids and tables must not overflow at 390px — screenshot dashboard + queues at mobile width. (Tasks 4,5)
- **SLA breach boundary:** an incident is breached only when `now > slaDueAt` and it is not yet resolved; exactly at `slaDueAt` is not breached, and resolved incidents are never breached — pinned by unit tests. (Task 3)
- **Empty/error states:** alerts with zero rows, a failed fetch, and an unauthenticated view must each render a designed state, not a blank screen. (Tasks 4,6)

---

### Task 1: Design-system foundation (tokens + Tailwind + primitives)

**Files:**
- Modify: `apps/web/src/app/globals.css` (token system: light/dark/control-room, base type scale, utilities)
- Modify: `apps/web/tailwind.config.ts` (map tokens to Tailwind theme; darkMode via `[data-theme]`)
- Create: `apps/web/src/components/ui/index.ts` (barrel)
- Create: `apps/web/src/components/ui/{Card,Kpi,Badge,StatusPill,Button,Skeleton,EmptyState,SectionHeader,PageHeader,Spinner}.tsx`
- Create: `apps/web/src/lib/format.ts` (`formatNumber`, `formatRelativeTime`, `cx`)
- Create: `apps/web/src/lib/theme.ts` (`THEMES`, `getTheme`, `setTheme`, `cycleTheme`)

**Interfaces:**
- Produces: `cx(...classes): string`; `formatNumber(n, lang): string`; `formatRelativeTime(iso, lang): string`; UI components with typed props (e.g. `Badge({tone: 'safe'|'watch'|'busy'|'danger'|'critical'|'neutral', label, icon?})`, `Kpi({label, value, sub?, tone?, trend?})`, `StatusPill({status})`, `EmptyState({icon, title, hint?})`).

- [ ] Step 1: Write token system in `globals.css` (`:root` light defaults; `@media (prefers-color-scheme: dark)`; `:root[data-theme="dark"]`, `:root[data-theme="light"]`; type scale vars; `.tabular`, focus-visible, reduced-motion).
- [ ] Step 2: Extend `tailwind.config.ts` to expose tokens as colors and set `darkMode: ['selector', '[data-theme="dark"]']`.
- [ ] Step 3: Implement `format.ts` and `theme.ts` (pure helpers; `cx` filters falsy).
- [ ] Step 4: Implement the UI primitives, each styled only through tokens, each exported from the barrel.
- [ ] Step 5: Verify — `npm run typecheck --workspace=apps/web` passes.
- [ ] Step 6: Commit (`feat(web): design-system tokens and UI primitives`).

### Task 2: App shell redesign (responsive nav + theme/lang controls)

**Files:**
- Modify: `apps/web/src/app/(app)/layout.tsx` (desktop sidebar + mobile bottom tab bar + sticky header)
- Create: `apps/web/src/components/ThemeToggle.tsx`, `apps/web/src/components/AppNav.tsx`
- Modify: `apps/web/src/components/LangToggle.tsx` (token styling)
- Modify: `apps/web/src/lib/i18n.ts` (add keys: `incidents`, `landing*`, nav + page strings used below)

**Interfaces:**
- Consumes: UI primitives, `theme.ts`, `lang-context`.
- Produces: shell with nav items `dashboard, crowd, queues, alerts, incidents, simulation`; collapses to a bottom tab bar under `md`.

- [ ] Step 1: Build `AppNav` (shared nav model) and `ThemeToggle` (cycles light→dark, persists to `localStorage`, guarded by try/catch).
- [ ] Step 2: Rebuild `(app)/layout.tsx`: sidebar ≥md, bottom tab bar <md, header with user + role chip + lang + theme + logout.
- [ ] Step 3: Verify typecheck + `npm run build --workspace=apps/web`.
- [ ] Step 4: Screenshot one page in Arabic/RTL and one in English/LTR, light and dark, at 390px and 1280px; confirm mirroring + no overflow.
- [ ] Step 5: Commit (`feat(web): responsive app shell with theme switching`).

### Task 3: Incident SLA-breach detection (backend, TDD)

**Files:**
- Create: `apps/api/src/common/sla.ts`
- Create: `apps/api/src/common/sla.spec.ts`
- Modify: `apps/api/src/incidents/incidents.service.ts` (surface `slaBreached` + `slaMinutesRemaining` on list/detail)
- Modify: `apps/api/src/dashboard/dashboard.service.ts` (add `breachedIncidents` KPI)

**Interfaces:**
- Produces: `isSlaBreached(incident: {slaDueAt: Date|null; status: string; resolvedAt: Date|null}, now: Date): boolean`; `slaMinutesRemaining(slaDueAt: Date|null, now: Date): number|null`.
- Consumes: existing incident records.

- [ ] Step 1: Write failing tests in `sla.spec.ts`:
  - breached when `now > slaDueAt` and status open and not resolved → true
  - exactly at `slaDueAt` → false; before → false
  - resolved/closed incident → always false (even past due)
  - null `slaDueAt` → false; `slaMinutesRemaining(null)` → null
  - `slaMinutesRemaining` returns signed minutes (negative once overdue)
- [ ] Step 2: Run `npm run test --workspace=apps/api -- sla.spec` → FAIL (module not found).
- [ ] Step 3: Implement `isSlaBreached` and `slaMinutesRemaining` in `sla.ts` (pure, no deps).
- [ ] Step 4: Run the spec → PASS.
- [ ] Step 5: Surface computed fields in `incidents.service.ts` (`findAll`/`findOne` map) and add `breachedIncidents` to `dashboard.overview`.
- [ ] Step 6: Verify `npm run typecheck --workspace=apps/api` + full `npm run test --workspace=apps/api`.
- [ ] Step 7: Commit (`feat(api): incident SLA-breach detection with tests`).

### Task 4: Executive dashboard redesign

**Files:** Modify `apps/web/src/app/(app)/dashboard/page.tsx`; add `apps/web/src/lib/api.ts` type for `breachedIncidents`.

- [ ] Step 1: Rebuild with a KPI grid (primitives), an occupancy-by-zone chart (Recharts, token colors, RTL-aware), a high-risk-zones panel, and a breached-incidents highlight; keep 5s polling; loading = skeletons, error = `EmptyState`.
- [ ] Step 2: Verify typecheck + build.
- [ ] Step 3: Screenshot (live sim running) light + dark, mobile + desktop.
- [ ] Step 4: Commit (`feat(web): redesigned executive dashboard`).

### Task 5: Crowd + Queues redesign

**Files:** Modify `apps/web/src/app/(app)/crowd/page.tsx`, `apps/web/src/app/(app)/queues/page.tsx`.

- [ ] Step 1: Crowd — zone cards with occupancy meter, density + risk badges (icon+label), 15/30/60 forecast; responsive grid.
- [ ] Step 2: Queues — table inside an `overflow-x-auto` card; risk pill; recommendation chips; empty state.
- [ ] Step 3: Verify typecheck + build; screenshot both (RTL+dark).
- [ ] Step 4: Commit (`feat(web): redesigned crowd & queue monitoring`).

### Task 6: Alerts + Incidents pages (uses SLA breach)

**Files:** Modify `apps/web/src/app/(app)/alerts/page.tsx`; create `apps/web/src/app/(app)/incidents/page.tsx`; add incidents API methods + types in `api.ts`.

- [ ] Step 1: Alerts — severity-striped rows, ack/resolve actions, filters, empty + error states.
- [ ] Step 2: Incidents — list with status pill, SLA-remaining/breached badge (from Task 3), severity; empty state.
- [ ] Step 2: Verify typecheck + build; screenshot (dark, RTL).
- [ ] Step 3: Commit (`feat(web): alerts polish + incidents page with SLA state`).

### Task 7: Simulation center redesign

**Files:** Modify `apps/web/src/app/(app)/simulation/page.tsx`.

- [ ] Step 1: Scenario grid (selectable cards), run state with live tick + stop, recent-runs list; clear affordances.
- [ ] Step 2: Verify typecheck + build; screenshot running state.
- [ ] Step 3: Commit (`feat(web): redesigned simulation center`).

### Task 8: Public landing page + login redesign

**Files:** Create `apps/web/src/app/(marketing)/page.tsx` or convert root `page.tsx` to a landing page with a "Sign in" CTA (keep auth redirect behavior for logged-in users); modify `apps/web/src/app/login/page.tsx`.

- [ ] Step 1: Landing — hero (product thesis), capability highlights, sectors served, bilingual, with CTA to `/login`; logged-in users auto-redirect to `/dashboard`.
- [ ] Step 2: Login — refined card on branded background, demo-account picker, clear preview/demo note, lang + theme toggles.
- [ ] Step 3: Verify typecheck + build; screenshot landing + login (both langs).
- [ ] Step 4: Commit (`feat(web): public landing page and refined login`).

### Task 9: Finalize

- [ ] Step 1: Run full gate — `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` (api + web) all green.
- [ ] Step 2: Run the stack locally, drive a full click-through with the browser, capture a final gallery of screenshots.
- [ ] Step 3: Update `README.md` status matrix (frontend now ✅ world-class; incidents page added; SLA breach).
- [ ] Step 4: Commit and push the branch.
