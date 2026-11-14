"""Estimated evening-peak demand: flows + turning ratios routed with SUMO jtrrouter."""
from __future__ import annotations

import hashlib
import re
import shutil
import subprocess
from pathlib import Path

import yaml

from sim.network import signal_ids


def _jtrrouter() -> str:
    try:
        import sumo
        candidate = Path(sumo.SUMO_HOME) / "bin" / "jtrrouter"
        if candidate.exists():
            return str(candidate)
    except ImportError:
        pass
    found = shutil.which("jtrrouter")
    if not found:
        raise RuntimeError("jtrrouter not found; install eclipse-sumo")
    return found


def demand_hash(demand_yaml: Path, scale: float) -> str:
    """sha256 of the demand file bytes plus the scale, first 12 hex chars."""
    h = hashlib.sha256(Path(demand_yaml).read_bytes())
    h.update(repr(float(scale)).encode("ascii"))
    return h.hexdigest()[:12]


def _model(ids: list[str], demand: dict, scale: float):
    """Return (flows, turns, sinks): flows=[(edge, vph)], turns=[(from, to, prob)]."""
    chain = ["olaya_south_end"] + ids + ["olaya_north_end"]
    dflt = demand["default_turns"]
    veh = demand["olaya_veh_per_hour"]
    cross = demand["cross_veh_per_hour"]

    flows = [(f"{chain[0]}__{chain[1]}", veh["northbound"] * scale),
             (f"{chain[-1]}__{chain[-2]}", veh["southbound"] * scale)]
    sinks = [f"{chain[1]}__{chain[0]}", f"{chain[-2]}__{chain[-1]}"]
    turns: list[tuple[str, str, float]] = []

    for k, jid in enumerate(ids, start=1):
        prev, nxt = chain[k - 1], chain[k + 1]
        t = {**dflt, **demand["intersections"][jid].get("turns", {})}
        left, right = t["left"], t["right"]
        thru = 1.0 - left - right
        vph = cross[demand["intersections"][jid]["cross_class"]]
        xw_in, xw_out = f"xw_{jid}_in", f"xw_{jid}_out"
        xe_in, xe_out = f"xe_{jid}_in", f"xe_{jid}_out"
        north_in, north_out = f"{prev}__{jid}", f"{jid}__{nxt}"
        south_in, south_out = f"{nxt}__{jid}", f"{jid}__{prev}"
        # Northbound: left = west, right = east.
        turns += [(north_in, north_out, thru), (north_in, xw_out, left), (north_in, xe_out, right)]
        # Southbound: left = east, right = west.
        turns += [(south_in, south_out, thru), (south_in, xe_out, left), (south_in, xw_out, right)]
        # Eastbound from west side: left = north, right = south.
        turns += [(xw_in, xe_out, thru), (xw_in, north_out, left), (xw_in, south_out, right)]
        # Westbound from east side: left = south, right = north.
        turns += [(xe_in, xw_out, thru), (xe_in, south_out, left), (xe_in, north_out, right)]
        flows += [(xw_in, vph * scale), (xe_in, vph * scale)]
        sinks += [xw_out, xe_out]
    return flows, turns, sinks


def build_routes(net_xml: Path, demand_yaml: Path, seed: int, scale: float = 1.0,
                 out_dir: Path = Path(".")) -> Path:
    """Generate olaya.rou.xml in out_dir (deterministic for a given seed and scale)."""
    net_xml, demand_yaml, out_dir = Path(net_xml), Path(demand_yaml), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    demand = yaml.safe_load(demand_yaml.read_text(encoding="utf-8"))
    flows, turns, sinks = _model(signal_ids(net_xml), demand, scale)
    duration = int(demand["duration_s"])

    flow_xml = ['<routes>']
    for n, (edge, vph) in enumerate(flows):
        flow_xml.append(f'    <flow id="f{n}" from="{edge}" begin="0" end="{duration}" '
                        f'vehsPerHour="{vph:.4f}"/>')
    flow_xml.append('</routes>')
    turn_xml = ['<turns>']
    for frm in dict.fromkeys(t[0] for t in turns):
        turn_xml.append(f'    <fromEdge id="{frm}">')
        for a, b, p in turns:
            if a == frm and p > 0:
                turn_xml.append(f'        <toEdge id="{b}" probability="{p:.4f}"/>')
        turn_xml.append('    </fromEdge>')
    turn_xml.append('</turns>')

    flow_f, turn_f = out_dir / "olaya.flows.xml", out_dir / "olaya.turns.xml"
    flow_f.write_text("\n".join(flow_xml) + "\n", encoding="utf-8")
    turn_f.write_text("\n".join(turn_xml) + "\n", encoding="utf-8")
    rou = out_dir / "olaya.rou.xml"
    cmd = [_jtrrouter(), "-n", str(net_xml), "-f", str(flow_f), "-t", str(turn_f),
           "--sinks", ",".join(sinks), "--accept-all-destinations", "true",
           "--seed", str(int(seed)), "--no-warnings", "true", "-o", str(rou)]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 or not rou.exists():
        raise RuntimeError(f"jtrrouter failed: {res.stderr or res.stdout}")
    # Drop the generation-timestamp comment so output is byte-identical per seed.
    text = re.sub(r"<!--.*?-->\n?", "", rou.read_text(encoding="utf-8"), flags=re.S)
    rou.write_text(text, encoding="utf-8")
    return rou
