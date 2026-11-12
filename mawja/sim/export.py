"""Experiment comparison (results.json) and replay export (replay_<controller>.json).

All runs are rule-checked (``sim.rules.check_rules``); a run with violations raises
``RuleViolation`` and nothing is written for it.

Replay format (consumed by the offline web demo)::

    {meta: {controller, label_ar, seed, demand_hash, duration, scale},
     network: {lanes: [[[x, y], ...], ...]},          # lane polylines, 0.5 m
     tls: [{id, name_ar, x, y}],                      # south -> north
     frames: [{t, v: [[x, y, waiting_bucket], ...],   # 1 frame / s, 0.5 m
               s: {tls_id: "G" | "Y" | "R"},          # Olaya northbound through signal
               k: {avg_wait_s, max_queue_m, throughput}}]}   # KPIs accumulated up to t

Frames are recorded every second. If the 1 Hz file would exceed REPLAY_BUDGET_BYTES
(a 7200 s peak has ~460 vehicles on the road), every ``frame_step_s``-th frame is kept
(t = step, 2 step, ..., so the final frame -- final KPIs -- is always included); the
smallest step that fits is used and stored in ``meta.frame_step_s``.

``waiting_bucket``: accumulated waiting of the vehicle < 10 s -> 0, 10-60 s -> 1, > 60 s -> 2.
"""
from __future__ import annotations

import json
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Sequence

import yaml
from sumolib.net import readNet

from sim.controllers.actuated import Actuated
from sim.controllers.fixed import FixedWebster
from sim.controllers.max_pressure import MaxPressure
from sim.demand import build_routes, demand_hash
from sim.network import build_network, signal_ids
from sim.rules import check_rules
from sim.runner import RunResult, run

ROOT = Path(__file__).resolve().parents[1]
CFG = ROOT / "sim" / "config"
CORRIDOR_YAML = CFG / "corridor.yaml"
DEMAND_YAML = CFG / "demand_evening.yaml"
DEFAULT_OUT = ROOT / "web" / "data"

CONTROLLERS = ("fixed", "actuated", "max_pressure", "rl")
COMPARE_CONTROLLERS = ("fixed", "actuated", "max_pressure")
DEFAULT_MAWJA = "max_pressure"
REPLAY_SCALE = 1.0
# Replay size budget: below the 25 MB hard limit with margin, so the page loads fast.
REPLAY_BUDGET_BYTES = 20 * 1024 * 1024


class RuleViolation(RuntimeError):
    """A run broke the signal-timing rules; its results must not be exported."""


class ControllerUnavailable(RuntimeError):
    """The requested controller cannot be built (e.g. rl before it exists)."""


# --- helpers ----------------------------------------------------------------------------

def half_m(v: float) -> float | int:
    """Round to 0.5 m; whole numbers become ints (shorter JSON)."""
    r = round(float(v) * 2.0) / 2.0
    return int(r) if r.is_integer() else r


def waiting_bucket(wait_s: float) -> int:
    """0: < 10 s, 1: 10-60 s, 2: > 60 s accumulated waiting."""
    if wait_s < 10.0:
        return 0
    return 1 if wait_s <= 60.0 else 2


def signal_char(c: str) -> str:
    """SUMO link state -> 'G' (green), 'Y' (yellow) or 'R' (anything else)."""
    if c in "Gg":
        return "G"
    if c in "yY":
        return "Y"
    return "R"


def _dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def _write_json(path: Path, obj) -> None:
    _write_text(path, _dumps(obj))


def choose_frame_step(frame_sizes: Sequence[int], ts: Sequence[int], overhead: int,
                      budget: int = REPLAY_BUDGET_BYTES) -> int:
    """Smallest step >= 1 such that frames with t % step == 0 (plus overhead) fit budget."""
    step = 1
    while True:
        size = overhead + sum(n + 1 for n, t in zip(frame_sizes, ts) if t % step == 0)
        if size <= budget or step >= max(len(ts), 1):
            return step
        step += 1


def scale_key(scale: float) -> str:
    return repr(float(scale))


def _load_rl():
    try:
        from sim.controllers.rl import RL  # noqa: WPS433 (Task 8)
    except ImportError as exc:
        raise ControllerUnavailable(
            "controller 'rl' is not available: sim/controllers/rl.py (class RL) "
            f"cannot be imported ({exc})") from exc
    return RL


def make_controller(name: str, scale: float):
    """Build a controller by name; FixedWebster uses the same demand scale as the routes."""
    if name == "fixed":
        return FixedWebster(DEMAND_YAML, progression_kmh=50.0, scale=scale)
    if name == "actuated":
        return Actuated()
    if name == "max_pressure":
        return MaxPressure()
    if name == "rl":
        return _load_rl()()
    raise ControllerUnavailable(f"unknown controller {name!r}; choose from {CONTROLLERS}")


@contextmanager
def _workdir(work_dir: Path | None) -> Iterator[Path]:
    if work_dir is not None:
        Path(work_dir).mkdir(parents=True, exist_ok=True)
        yield Path(work_dir)
    else:
        with tempfile.TemporaryDirectory(prefix="mawja_") as d:
            yield Path(d)


def run_checked(net_xml: Path, routes: Path, controller, seed: int,
                duration: int | None = None, **kw) -> RunResult:
    """``sim.runner.run`` + rule check; raises RuleViolation on any violation."""
    r = run(net_xml, routes, controller, seed, duration=duration, **kw)
    violations = check_rules(r.phase_log, net_xml, end_t=r.diagnostics["duration_s"])
    if violations:
        head = "\n  ".join(violations[:10])
        raise RuleViolation(f"{controller.name}: {len(violations)} signal-rule violations, "
                            f"not exported:\n  {head}")
    return r


# --- network / signal description --------------------------------------------------------

def olaya_link_index(net_xml: Path) -> dict[str, int]:
    """Per tls: link index of the Olaya northbound through movement (prev -> next junction)."""
    net = readNet(str(net_xml), withPrograms=True)
    ids = signal_ids(net_xml)
    chain = ["olaya_south_end"] + ids + ["olaya_north_end"]
    out: dict[str, int] = {}
    for k, tid in enumerate(ids, start=1):
        frm, to = f"{chain[k - 1]}__{tid}", f"{tid}__{chain[k + 1]}"
        idx = None
        if net.hasEdge(frm) and net.hasEdge(to):
            conns = net.getEdge(frm).getConnections(net.getEdge(to))
            links = sorted(c.getTLLinkIndex() for c in conns if c.getTLLinkIndex() >= 0)
            idx = links[0] if links else None
        if idx is None:
            # Geometry not built from corridor.yaml naming (e.g. OSM): first link of the tls.
            idx = 0
        out[tid] = idx
    return out


def network_payload(net_xml: Path) -> tuple[dict, list[dict]]:
    """Lane polylines (0.5 m) and the tls list (id, name_ar, x, y), south -> north."""
    net = readNet(str(net_xml))
    lanes = []
    for edge in net.getEdges():
        for lane in edge.getLanes():
            lanes.append([[half_m(x), half_m(y)] for x, y in lane.getShape()])
    corridor = yaml.safe_load(CORRIDOR_YAML.read_text(encoding="utf-8"))
    names = {i["id"]: i.get("name_ar", i["id"]) for i in corridor["intersections"]}
    tls = []
    for tid in signal_ids(net_xml):
        x, y = net.getNode(tid).getCoord()
        tls.append({"id": tid, "name_ar": names.get(tid, tid), "x": half_m(x), "y": half_m(y)})
    return {"lanes": lanes}, tls


def _frame_converter(link_idx: dict[str, int]):
    def convert(frame: dict) -> dict:
        k = frame["k"]
        return {
            "t": frame["t"],
            "v": [[half_m(v["x"]), half_m(v["y"]), waiting_bucket(v["wait"])]
                  for v in frame["vehicles"]],
            "s": {tid: signal_char(frame["tls"][tid][i]) for tid, i in link_idx.items()},
            "k": {"avg_wait_s": round(k["avg_wait_s"], 1),
                  "max_queue_m": round(k["max_queue_m"], 1),
                  "throughput": int(k["throughput"])},
        }
    return convert


# --- public API ---------------------------------------------------------------------------

def prepare(seed: int, scale: float, work_dir: Path) -> tuple[Path, Path]:
    """Build the network and the routes for (seed, scale) in work_dir."""
    net = build_network(CORRIDOR_YAML, Path(work_dir) / "net")
    routes = build_routes(net, DEMAND_YAML, seed, scale,
                          Path(work_dir) / f"rou_{scale_key(scale)}")
    return net, routes


def export_replay(controller: str, seed: int, out_dir: Path = DEFAULT_OUT,
                  scale: float = REPLAY_SCALE, duration: int | None = None,
                  work_dir: Path | None = None,
                  budget_bytes: int = REPLAY_BUDGET_BYTES) -> Path:
    """Run ``controller`` once (recorded, rule-checked) and write replay_<controller>.json."""
    ctrl = make_controller(controller, scale)
    with _workdir(work_dir) as wd:
        net, routes = prepare(seed, scale, wd)
        link_idx = olaya_link_index(net)
        r = run_checked(net, routes, ctrl, seed, duration=duration, record=True,
                        frame_fn=_frame_converter(link_idx))
        network, tls = network_payload(net)
    frame_json = [_dumps(f) for f in r.frames]
    ts = [f["t"] for f in r.frames]
    meta = {"controller": controller, "label_ar": ctrl.label_ar, "seed": int(seed),
            "demand_hash": demand_hash(DEMAND_YAML, scale),
            "duration": int(r.diagnostics["duration_s"]), "scale": float(scale),
            "frame_step_s": 1}
    head = _dumps({"meta": meta, "network": network, "tls": tls})
    step = choose_frame_step([len(s) for s in frame_json], ts, len(head.encode()) + 64,
                             budget_bytes)
    meta["frame_step_s"] = step
    head = _dumps({"meta": meta, "network": network, "tls": tls})
    kept = (s for s, t in zip(frame_json, ts) if t % step == 0)
    path = Path(out_dir) / f"replay_{controller}.json"
    _write_text(path, head[:-1] + ',"frames":[' + ",".join(kept) + "]}")
    return path


def compare(seed: int, scales: Sequence[float], out_dir: Path = DEFAULT_OUT,
            controllers: Sequence[str] = COMPARE_CONTROLLERS, duration: int | None = None,
            work_dir: Path | None = None, log=None) -> dict:
    """Run every controller at every scale (rule-checked) and write results.json.

    ``meta.demand_hash`` is the hash at the replay scale (1.0) when it is compared, so the
    web page can match results against replays; per-scale hashes are in
    ``meta.demand_hash_by_scale``.
    """
    scales = [float(s) for s in scales]
    runs: dict[str, dict[str, dict]] = {}
    run_duration = None
    with _workdir(work_dir) as wd:
        for scale in scales:
            net, routes = prepare(seed, scale, wd)
            runs[scale_key(scale)] = {}
            for name in controllers:
                r = run_checked(net, routes, make_controller(name, scale), seed,
                                duration=duration)
                runs[scale_key(scale)][name] = dict(r.kpis)
                run_duration = int(r.diagnostics["duration_s"])
                if log:
                    log(f"scale {scale_key(scale)} {name}: " +
                        ", ".join(f"{k}={v:.1f}" if isinstance(v, float) else f"{k}={v}"
                                  for k, v in r.kpis.items()))
    ref = REPLAY_SCALE if REPLAY_SCALE in scales else scales[0]
    results = {
        "meta": {"seed": int(seed), "demand_hash": demand_hash(DEMAND_YAML, ref),
                 "estimated": True,
                 "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                 "reference_scale": ref,
                 "scales": scales,
                 "demand_hash_by_scale": {scale_key(s): demand_hash(DEMAND_YAML, s)
                                          for s in scales},
                 "duration": run_duration},
        "runs": runs,
    }
    _write_json(Path(out_dir) / "results.json", results)
    return results


def write_manifest(out_dir: Path, mawja: str | None = None) -> dict:
    """manifest.json = {"mawja": <controller shown as Mawja>}.

    ``mawja`` given (``--set-mawja``): set it. Otherwise create the manifest with
    max_pressure if missing, and leave an existing choice (e.g. rl from Task 8) unchanged.
    """
    path = Path(out_dir) / "manifest.json"
    current = {}
    if path.exists():
        current = json.loads(path.read_text(encoding="utf-8"))
    if mawja is not None:
        current["mawja"] = mawja
    current.setdefault("mawja", DEFAULT_MAWJA)
    _write_json(path, current)
    return current
