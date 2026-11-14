from pathlib import Path
import xml.etree.ElementTree as ET

import pytest
import sumolib
import yaml

from sim.demand import build_routes, demand_hash
from sim.network import build_network

ROOT = Path(__file__).resolve().parents[1] / "sim" / "config"
CORRIDOR = ROOT / "corridor.yaml"
DEMAND = ROOT / "demand_evening.yaml"


@pytest.fixture(scope="module")
def net_xml(tmp_path_factory):
    return build_network(CORRIDOR, tmp_path_factory.mktemp("net"))


def _count(rou: Path) -> int:
    root = ET.parse(rou).getroot()
    return len(root.findall("vehicle")) + sum(
        int(f.get("number", 0)) for f in root.findall("flow"))


def test_demand_yaml_is_marked_estimated():
    cfg = yaml.safe_load(DEMAND.read_text(encoding="utf-8"))
    assert cfg["estimated"] is True
    assert cfg["duration_s"] == 7200
    assert "estimate" in DEMAND.read_text(encoding="utf-8").lower()


def test_same_seed_same_routes(net_xml, tmp_path):
    a = build_routes(net_xml, DEMAND, 1, 1.0, tmp_path / "a")
    b = build_routes(net_xml, DEMAND, 1, 1.0, tmp_path / "b")
    assert a.read_bytes() == b.read_bytes()
    assert _count(a) > 1000


def test_scale_changes_vehicle_count(net_xml, tmp_path):
    base = _count(build_routes(net_xml, DEMAND, 1, 1.0, tmp_path / "a"))
    up = _count(build_routes(net_xml, DEMAND, 1, 1.2, tmp_path / "b"))
    assert 1.15 * base <= up <= 1.25 * base


def test_routes_are_valid_and_vehicles_exit(net_xml, tmp_path):
    rou = build_routes(net_xml, DEMAND, 1, 1.0, tmp_path)
    net = sumolib.net.readNet(str(net_xml))
    ids = {e.getID() for e in net.getEdges()}
    assert list(ET.parse(rou).getroot().iter("route"))
    # every route is edge-valid and ends on a sink (exit-only) edge
    for r in ET.parse(rou).getroot().iter("route"):
        edges = r.get("edges").split()
        assert set(edges) <= ids
        assert net.getEdge(edges[-1]).getToNode().getID().startswith(("olaya_south_end", "olaya_north_end", "xw_", "xe_"))


def test_demand_hash_changes_with_scale():
    assert demand_hash(DEMAND, 1.0) != demand_hash(DEMAND, 1.2)
    assert demand_hash(DEMAND, 1.0) == demand_hash(DEMAND, 1.0)
    assert len(demand_hash(DEMAND, 1.0)) == 12
