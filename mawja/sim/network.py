"""Build the Olaya Street SUMO network from corridor.yaml."""
from __future__ import annotations

import math
import shutil
import subprocess
from pathlib import Path

import sumolib  # noqa: F401  (ensures the SUMO python tools are importable)
import yaml
from sumolib.net import readNet

EARTH_RADIUS_M = 6371000.0


def _netconvert() -> str:
    try:
        import sumo
        candidate = Path(sumo.SUMO_HOME) / "bin" / "netconvert"
        if candidate.exists():
            return str(candidate)
    except ImportError:
        pass
    found = shutil.which("netconvert")
    if not found:
        raise RuntimeError("netconvert not found; install eclipse-sumo")
    return found


def _project(lat: float, lon: float, lat0: float, lon0: float) -> tuple[float, float]:
    """Local equirectangular projection to metres (x east, y north) around the origin."""
    x = math.radians(lon - lon0) * EARTH_RADIUS_M * math.cos(math.radians(lat0))
    y = math.radians(lat - lat0) * EARTH_RADIUS_M
    return round(x, 2), round(y, 2)


def _write_plain(cfg: dict, out_dir: Path) -> tuple[Path, Path]:
    inters = cfg["intersections"]
    lat0, lon0 = inters[0]["lat"], inters[0]["lon"]
    pts = [_project(i["lat"], i["lon"], lat0, lon0) for i in inters]
    olaya_lanes = cfg["olaya"]["lanes_per_direction"]
    olaya_speed = cfg["olaya"]["speed_kmh"] / 3.6
    cross_len = cfg.get("cross_street_length_m", 250)
    cross_speed = cfg.get("cross_street_speed_kmh", 50) / 3.6

    nodes: list[str] = []
    edges: list[str] = []

    def node(nid: str, x: float, y: float, ntype: str) -> None:
        nodes.append(f'    <node id="{nid}" x="{x}" y="{y}" type="{ntype}"/>')

    def edge(eid: str, a: str, b: str, lanes: int, speed: float) -> None:
        edges.append(f'    <edge id="{eid}" from="{a}" to="{b}" numLanes="{lanes}" '
                     f'speed="{speed:.3f}"/>')

    # Corridor ends extend 300 m beyond the first/last junction along Olaya's direction.
    def extend(p: tuple[float, float], q: tuple[float, float], d: float) -> tuple[float, float]:
        dx, dy = p[0] - q[0], p[1] - q[1]
        n = math.hypot(dx, dy) or 1.0
        return round(p[0] + dx / n * d, 2), round(p[1] + dy / n * d, 2)

    south = extend(pts[0], pts[1], 300)
    north = extend(pts[-1], pts[-2], 300)
    node("olaya_south_end", *south, "priority")
    node("olaya_north_end", *north, "priority")

    chain = ["olaya_south_end"] + [i["id"] for i in inters] + ["olaya_north_end"]
    for i, ((x, y), it) in enumerate(zip(pts, inters)):
        node(it["id"], x, y, "traffic_light")
        # Perpendicular (east-west) cross street at this junction, tilted with Olaya's heading.
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        n = math.hypot(dx, dy) or 1.0
        px, py = dy / n, -dx / n  # right-hand normal (east)
        w = (round(x - px * cross_len, 2), round(y - py * cross_len, 2))
        e = (round(x + px * cross_len, 2), round(y + py * cross_len, 2))
        node(f"xw_{it['id']}", *w, "priority")
        node(f"xe_{it['id']}", *e, "priority")
        lanes = it["cross_lanes"]
        for tag in ("w", "e"):
            edge(f"x{tag}_{it['id']}_in", f"x{tag}_{it['id']}", it["id"], lanes, cross_speed)
            edge(f"x{tag}_{it['id']}_out", it["id"], f"x{tag}_{it['id']}", lanes, cross_speed)

    for a, b in zip(chain, chain[1:]):
        edge(f"{a}__{b}", a, b, olaya_lanes, olaya_speed)  # northbound
        edge(f"{b}__{a}", b, a, olaya_lanes, olaya_speed)  # southbound

    out_dir.mkdir(parents=True, exist_ok=True)
    nod = out_dir / "olaya.nod.xml"
    edg = out_dir / "olaya.edg.xml"
    nod.write_text('<nodes>\n' + "\n".join(nodes) + '\n</nodes>\n', encoding="utf-8")
    edg.write_text('<edges>\n' + "\n".join(edges) + '\n</edges>\n', encoding="utf-8")
    return nod, edg


def build_network(corridor_yaml: Path, out_dir: Path) -> Path:
    """Build olaya.net.xml in out_dir from the corridor YAML and return its path."""
    corridor_yaml = Path(corridor_yaml)
    out_dir = Path(out_dir)
    cfg = yaml.safe_load(corridor_yaml.read_text(encoding="utf-8"))
    out_dir.mkdir(parents=True, exist_ok=True)
    net = out_dir / "olaya.net.xml"

    cmd = [_netconvert(), "--tls.default-type", "static", "--no-warnings", "true",
           "-o", str(net)]
    osm = cfg.get("osm_file")
    if osm and not Path(osm).exists():
        raise FileNotFoundError(f"osm_file not found: {osm}")
    if osm:
        cmd += ["--osm-files", str(osm), "--tls.guess-signals", "true"]
    else:
        nod, edg = _write_plain(cfg, out_dir)
        cmd += ["--node-files", str(nod), "--edge-files", str(edg)]

    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 or not net.exists():
        raise RuntimeError(f"netconvert failed: {res.stderr or res.stdout}")
    return net


def signal_ids(net_xml: Path) -> list[str]:
    """Traffic-light ids ordered south -> north (increasing junction y)."""
    net = readNet(str(net_xml), withPrograms=True)
    tls = net.getTrafficLights()
    def y_of(t) -> float:
        nodes = t.getNodes() if hasattr(t, "getNodes") else [net.getNode(t.getID())]
        return sum(n.getCoord()[1] for n in nodes) / len(nodes)
    return [t.getID() for t in sorted(tls, key=y_of)]
