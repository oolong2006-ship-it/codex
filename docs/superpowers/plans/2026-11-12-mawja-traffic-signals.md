# Mawja (موجة) Traffic Signals Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A SUMO simulation of a 6-signal stretch of Olaya Street (Riyadh) at the evening peak that compares fixed-time, actuated, max-pressure and an RL agent, exported to an offline Arabic web page that replays fixed-time vs Mawja side by side with live KPIs.

**Architecture:** `mawja/sim/` is a Python package: it builds the SUMO network from a corridor config, generates estimated peak demand, runs each controller through `libsumo` with a shared runner, and exports per-second replay frames + KPI JSON. `mawja/web/` is a dependency-free static page (HTML/CSS/vanilla JS, canvas) that reads those JSON files and replays two runs in sync. RL is time-boxed; max-pressure is the guaranteed fallback.

**Tech Stack:** Python 3.13, `eclipse-sumo==1.28.0`, `libsumo==1.28.0`, `numpy`, `pyyaml`, `pytest`; RL: `gymnasium`, `stable-baselines3` (PPO, CPU, `torch` CPU wheel). Web: plain HTML/JS, no build step.

**Spec:** `docs/superpowers/specs/2026-11-12-mawja-traffic-signals-design.md`

## Global Constraints

- New independent product in `mawja/`; shares no code with MASAR 34, iso-platform or alnadeg.
- All user-facing text Arabic, RTL (`<html lang="ar" dir="rtl">`); code, identifiers, comments English.
- Web demo must run offline from `file://` or `python -m http.server`, no external CDN, fonts or network calls.
- No secrets in the repo.
- Signal rules for every adaptive controller: fixed cyclic phase order (no skipping), min green 10 s, max green 90 s, yellow 3 s, all-red 2 s. Controllers decide only "extend current phase" or "advance to next phase".
- Fixed-time baseline: Webster-optimised cycle per intersection, coordinated as a green wave along Olaya (offsets = distance / 50 km/h progression speed).
- Peak: evening 16:00–18:00 only. Demand volumes are estimates and every config/UI place that shows them says «تقديري».
- Reproducibility: same `seed` → identical KPIs (SUMO `--seed`, numpy seeds).
- Mawja label honesty: the web page labels the controller it shows by its real algorithm (RL agent «وكيل تعلم معزز» or max-pressure «خوارزمية الضغط الأقصى»).
- Map attribution: if OSM data is used, show "© OpenStreetMap contributors (ODbL)"; if the hand-built geometry is used, the methodology page says the geometry is approximate.
- Tests: `cd mawja && pytest -q` must pass before each commit.

## Review Focus

1. **Gridlock / teleports:** when demand exceeds capacity SUMO teleports stuck vehicles, silently shrinking queues. Expect: teleports are counted as a KPI and runs use `--time-to-teleport -1` so jams stay visible. (Test in Task 3.)
2. **Vehicles still in network at end of run** are excluded from trip-based waiting averages, flattering a bad controller. Expect: waiting is measured per-second over all vehicles present, and unfinished vehicles are reported. (Test in Task 3.)
3. **Controller breaking signal rules** (green < 10 s, > 90 s, or skipped yellow). Expect: a rule checker rejects any run that violates them. (Test in Task 4.)
4. **Replay files too large for an offline browser** (thousands of vehicles × 7200 s). Expect: export downsamples to 1 Hz with rounded coordinates and stays under 25 MB per run; page loads under 5 s. (Test in Task 6.)
5. **Mismatched replays** (fixed vs Mawja exported with different seeds or demand). Expect: page refuses to play two runs whose `meta.seed`/`meta.demand_hash` differ and shows an Arabic error. (Test in Task 7.)

---

### Task 1: Package scaffold and corridor network

**Files:**
- Create: `mawja/pyproject.toml`, `mawja/README.md`, `mawja/sim/__init__.py`, `mawja/sim/config/corridor.yaml`, `mawja/sim/network.py`
- Test: `mawja/tests/test_network.py`

**Interfaces:**
- Produces: `build_network(corridor_yaml: Path, out_dir: Path) -> Path` (returns path to `olaya.net.xml`); `signal_ids(net_xml: Path) -> list[str]` (ordered south→north).

`corridor.yaml` holds the 6 intersections on Olaya Street from south to north, each with `id`, `name_ar`, approximate `lat`/`lon`, cross-street lane counts; Olaya itself 3 lanes per direction, speed 60 km/h. Executor fills coordinates from public map knowledge and marks the file `geometry: approximate`. Optional `osm_file:` key: when set and the file exists, `build_network` uses `netconvert --osm-files` instead of plain XML.

- [ ] **Step 1: Write failing tests** — `test_build_network_creates_six_tls`: builds into `tmp_path`, asserts `len(signal_ids(net)) == 6`; `test_signal_ids_ordered_south_to_north`: asserts the y-coordinate of each junction increases.
- [ ] **Step 2: Run** `cd mawja && pytest tests/test_network.py -v` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `build_network` by writing SUMO plain `nod.xml`/`edg.xml` (signalised junctions `type="traffic_light"`) from the YAML, projected with `sumolib`, then calling the `netconvert` binary from `eclipse-sumo` (`sumo.SUMO_HOME`) with `--tls.default-type static`.
- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mawja): corridor network for Olaya Street`.

### Task 2: Estimated evening-peak demand

**Files:**
- Create: `mawja/sim/config/demand_evening.yaml`, `mawja/sim/demand.py`
- Test: `mawja/tests/test_demand.py`

**Interfaces:**
- Consumes: `build_network`.
- Produces: `build_routes(net_xml: Path, demand_yaml: Path, seed: int, scale: float = 1.0, out_dir: Path) -> Path` (returns `.rou.xml`); `demand_hash(demand_yaml: Path, scale: float) -> str` (sha256 of file bytes + scale, first 12 hex).

`demand_evening.yaml`: `estimated: true`, duration 7200 s, veh/h per entry (Olaya northbound/southbound ends, each cross-street both sides) and turning ratios per junction. Starting values: Olaya ends 1800 veh/h per direction, major cross streets 900, minor 400; turns 15 % left / 15 % right.

- [ ] **Step 1: Failing tests** — `test_same_seed_same_routes` (byte-identical file for seed 1 twice); `test_scale_changes_vehicle_count` (scale 1.2 gives 15–25 % more `<vehicle>`/flow vehicles than 1.0); `test_demand_hash_changes_with_scale`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** with SUMO `<flow>` elements + `jtrrouter` (turn ratios), passing `--seed`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(mawja): estimated evening peak demand`.

### Task 3: Runner and KPIs

**Files:**
- Create: `mawja/sim/runner.py`, `mawja/sim/kpi.py`, `mawja/sim/controllers/__init__.py`, `mawja/sim/controllers/base.py`
- Test: `mawja/tests/test_runner.py`, `mawja/tests/test_kpi.py`

**Interfaces:**
- Produces:
  - `class Controller(Protocol)`: `name: str`; `label_ar: str`; `setup(conn, tls_ids: list[str]) -> None`; `step(conn, t: int) -> None` (called every simulated second).
  - `run(net_xml: Path, routes: Path, controller: Controller, seed: int, record: bool = False) -> RunResult`
  - `@dataclass RunResult`: `kpis: dict[str, float]`, `frames: list[dict] | None`, `phase_log: list[tuple[int, str, int]]` (t, tls_id, phase index).
  - KPI keys (exact): `avg_wait_s` (mean over all vehicle-seconds of accumulated waiting per vehicle present), `max_queue_m` (max over time of the longest per-lane halting length in metres), `throughput` (arrived vehicles), `unfinished` (vehicles still in network at end), `teleports`, `fuel_l`, `co2_kg`, `cost_sar`.
  - `cost_sar` = total vehicle-hours delayed × `VALUE_OF_TIME_SAR_PER_H = 45.0` + `fuel_l` × `FUEL_SAR_PER_L = 2.33`; both constants in `kpi.py` with a comment marking them as assumptions.

Runner starts `libsumo` with `--seed`, `--time-to-teleport -1`, `--step-length 1`, `--no-warnings`.

- [ ] **Step 1: Failing tests** — `test_run_deterministic` (same seed → equal `kpis` with a trivial "do nothing" controller); `test_teleports_disabled` (`kpis["teleports"] == 0` at scale 2.0); `test_unfinished_reported` (60 s run → `unfinished > 0`); `test_cost_formula` (unit test of the cost function with given numbers).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `run` and the KPI accumulator.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(mawja): simulation runner and KPIs`.

### Task 4: Fixed-time (Webster green wave), actuated, rule checker

**Files:**
- Create: `mawja/sim/controllers/fixed.py`, `mawja/sim/controllers/actuated.py`, `mawja/sim/rules.py`
- Test: `mawja/tests/test_controllers_baseline.py`, `mawja/tests/test_rules.py`

**Interfaces:**
- Consumes: `Controller`, `run`, `RunResult.phase_log`.
- Produces: `FixedWebster(demand_yaml: Path, progression_kmh: float = 50.0)`; `Actuated()` (switches TLS programs to SUMO `actuated` with min 10 / max 90); `check_rules(phase_log, net_xml) -> list[str]` (empty = OK; messages name tls and time); constants `MIN_GREEN=10, MAX_GREEN=90, YELLOW=3, ALL_RED=2`.

Webster: `C0 = (1.5L + 5) / (1 - Y)`, clamp 60–150 s, greens split by critical flow ratios, offsets = cumulative distance / progression speed mod cycle.

- [ ] **Step 1: Failing tests** — `test_webster_cycle_clamped` (hand-computed example → expected cycle); `test_fixed_offsets_follow_progression`; `test_rules_flag_short_green` (synthetic phase_log with 8 s green → one message); `test_baselines_obey_rules` (60-min run of each → `check_rules == []`).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(mawja): fixed-time green wave and actuated baselines`.

### Task 5: Max-pressure controller (guaranteed fallback)

**Files:**
- Create: `mawja/sim/controllers/max_pressure.py`
- Test: `mawja/tests/test_max_pressure.py`

**Interfaces:**
- Consumes: `Controller`, `check_rules`, constants from `rules.py`.
- Produces: `MaxPressure(decision_interval: int = 5)`; `name="max_pressure"`, `label_ar="خوارزمية الضغط الأقصى"`; `pressure(conn, tls_id, phase) -> float` (sum incoming halting − outgoing halting for movements green in `phase`).

Decision every 5 s once min green elapsed: advance (through yellow/all-red) if next phase's pressure exceeds current by > 0, or max green reached; otherwise extend.

- [ ] **Step 1: Failing tests** — `test_pressure_counts_halting` (small hand-made state via a 2-junction toy network in `tests/fixtures/`); `test_max_pressure_obeys_rules`; `test_max_pressure_beats_fixed_on_wait` (full 2 h, seed 1: `avg_wait_s` lower than `FixedWebster`).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS. If `test_max_pressure_beats_fixed_on_wait` fails, report numbers to the user rather than tuning the baseline down.
- [ ] **Step 5: Commit** `feat(mawja): max-pressure adaptive controller`.

### Task 6: Experiment CLI and replay export

**Files:**
- Create: `mawja/sim/export.py`, `mawja/sim/cli.py`
- Test: `mawja/tests/test_export.py`

**Interfaces:**
- Consumes: everything above.
- Produces: CLI `python -m mawja.sim.cli compare --seed 1 --scales 0.8 1.0 1.2 --out mawja/web/data/` and `python -m mawja.sim.cli export --controller {fixed,actuated,max_pressure,rl} --seed 1 --out mawja/web/data/`.
  - `data/results.json`: `{meta: {seed, demand_hash, estimated: true, generated_at}, runs: {<scale>: {<controller>: kpis}}}`.
  - `data/replay_<controller>.json`: `{meta: {controller, label_ar, seed, demand_hash, duration}, network: {lanes: [[x,y]...]}, tls: [{id, name_ar, x, y}], frames: [{t, v: [[x, y, waiting_bucket]...], s: {tls_id: "G"|"Y"|"R" for Olaya direction}, k: {avg_wait_s, max_queue_m, throughput}}]}`; positions rounded to 0.5 m, 1 frame/s, `waiting_bucket` 0/1/2 (<10 s, 10–60 s, >60 s).

- [ ] **Step 1: Failing tests** — `test_replay_schema` (export a 120 s run, validate keys); `test_replay_size_limit` (full 7200 s fixed run file < 25 MB); `test_results_has_all_controllers`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(mawja): comparison CLI and replay export` (include generated `web/data/*.json` for fixed and max_pressure).

### Task 7: Arabic offline demo page

**Files:**
- Create: `mawja/web/index.html`, `mawja/web/app.js`, `mawja/web/style.css`, `mawja/web/methodology.html`
- Test: `mawja/tests/test_web.py` (Playwright, pre-installed Chromium)

**Interfaces:**
- Consumes: `data/results.json`, `data/replay_fixed.json`, `data/replay_<mawja controller>.json` (which one is set by `data/manifest.json`: `{"mawja": "max_pressure"|"rl"}` written by the CLI).

Layout (RTL): header «موجة — إشارات ذكية لشارع العليا»; two synchronized canvases — right «الوضع الحالي (توقيت ثابت)», left «موجة» + `label_ar`; vehicles colored by waiting bucket (green/amber/red); signal dots; controls ▶︎/⏸ and speed ×1/×10/×60; clock showing 16:00–18:00; KPI cards under each canvas updating per frame (متوسط الانتظار، أطول طابور، السيارات العابرة) and a final summary with % improvement and «الكلفة التقديرية بالريال»; badge «حجم المرور تقديري»; link to methodology. `methodology.html`: Arabic explanation of geometry source, estimated demand, Webster green-wave baseline, signal rules, the algorithm shown, and the multi-scale results table from `results.json`.

- [ ] **Step 1: Failing tests** — `test_page_loads_offline` (serve `mawja/web` via `http.server`, block all non-localhost requests, assert no console errors and both canvases render); `test_rtl_and_arabic` (`dir="rtl"`, title text); `test_mismatched_meta_shows_error` (fixture replays with different `demand_hash` → Arabic error text visible); `test_kpis_update` (after ×60 for 2 s, KPI text changes).
- [ ] **Step 2: Run** `cd mawja && pytest tests/test_web.py -v` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS; also open the page, screenshot, and check it visually.
- [ ] **Step 5: Commit** `feat(mawja): Arabic offline demo page`.

### Task 8: RL agent (time-boxed, day 6–10)

**Files:**
- Create: `mawja/sim/rl/env.py`, `mawja/sim/rl/train.py`, `mawja/sim/controllers/rl.py`, `mawja/models/.gitkeep`
- Test: `mawja/tests/test_rl_env.py`

**Interfaces:**
- Consumes: `build_network`, `build_routes`, `run`, rules constants, `MaxPressure.pressure`.
- Produces: `MawjaEnv(gymnasium.Env)` — multi-agent via parameter sharing: one shared PPO policy applied per TLS each 5 s decision; obs per TLS = normalized halting per incoming lane (padded to 12), current phase one-hot (4), time in phase / 90, both neighbours' total halting; action `Discrete(2)` (0 extend, 1 advance), masked to 0 below min green and forced to 1 at max green; reward = −(sum of pressures). `train(steps: int, seeds: list[int], out: Path)`; `RLController(model_path: Path)` with `name="rl"`, `label_ar="وكيل تعلم معزز"`.

Training: 4 parallel envs (`SubprocVecEnv`), randomized seeds and scale ∈ [0.8, 1.2], evaluate on seed 1 scale 1.0 (held out from training seeds).

- [ ] **Step 1: Failing tests** — `test_env_obs_shape`; `test_action_mask_enforces_min_green`; `test_rl_controller_obeys_rules` (with an untrained random model).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement env, train, controller.**
- [ ] **Step 4: Run** — PASS. Then train with the step budget that fits by day 10.
- [ ] **Step 5: Decision gate (day 10):** run `compare`. If RL `avg_wait_s` beats both `actuated` and `max_pressure` at scale 1.0 (and is not worse at 0.8 and 1.2), export `replay_rl.json` and set manifest `mawja: rl`; else keep `max_pressure`. Commit the model only if under 20 MB. Report the numbers to the user either way.
- [ ] **Step 6: Commit** `feat(mawja): RL signal agent`.

### Task 9: Rehearsal

**Files:**
- Modify: `mawja/README.md` (Arabic run instructions: install, `compare`, `export`, open page)

- [ ] **Step 1:** Fresh clone in scratch dir → follow README exactly → page opens offline. Fix README until it works verbatim.
- [ ] **Step 2:** `cd mawja && pytest -q` — all pass.
- [ ] **Step 3: Commit** `docs(mawja): run instructions`.
