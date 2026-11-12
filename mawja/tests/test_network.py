from pathlib import Path

import pytest
import sumolib

from sim.network import build_network, signal_ids

CORRIDOR = Path(__file__).resolve().parents[1] / "sim" / "config" / "corridor.yaml"


@pytest.fixture(scope="module")
def net_xml(tmp_path_factory):
    return build_network(CORRIDOR, tmp_path_factory.mktemp("net"))


def test_build_network_creates_six_tls(net_xml):
    assert net_xml.name == "olaya.net.xml"
    assert len(signal_ids(net_xml)) == 6


def test_signal_ids_ordered_south_to_north(net_xml):
    net = sumolib.net.readNet(str(net_xml))
    ys = [net.getNode(i).getCoord()[1] for i in signal_ids(net_xml)]
    assert ys == sorted(ys)
    assert len(set(ys)) == 6


def test_olaya_has_three_lanes_per_direction(net_xml):
    net = sumolib.net.readNet(str(net_xml))
    olaya = [e for e in net.getEdges() if e.getID().startswith("olaya_")
             and e.getFromNode().getID().startswith("olaya_")
             and e.getToNode().getID().startswith("olaya_")]
    assert olaya and all(e.getLaneNumber() == 3 for e in olaya)
    assert all(abs(e.getSpeed() - 60 / 3.6) < 0.01 for e in olaya)


def test_osm_file_branch_skipped_without_file():
    import yaml
    cfg = yaml.safe_load(CORRIDOR.read_text(encoding="utf-8"))
    osm = cfg.get("osm_file")
    if not osm or not Path(osm).exists():
        pytest.skip("no osm_file configured")
