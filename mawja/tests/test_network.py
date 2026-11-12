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
    import yaml
    cfg = yaml.safe_load(CORRIDOR.read_text(encoding="utf-8"))
    assert signal_ids(net_xml) == [i["id"] for i in cfg["intersections"]]


def test_olaya_has_three_lanes_per_direction(net_xml):
    net = sumolib.net.readNet(str(net_xml))
    olaya = [e for e in net.getEdges() if e.getID().startswith("olaya_")
             and e.getFromNode().getID().startswith("olaya_")
             and e.getToNode().getID().startswith("olaya_")]
    assert olaya and all(e.getLaneNumber() == 3 for e in olaya)
    assert all(abs(e.getSpeed() - 60 / 3.6) < 0.01 for e in olaya)


def _corridor_with_osm(tmp_path, osm_path):
    import yaml
    cfg = yaml.safe_load(CORRIDOR.read_text(encoding="utf-8"))
    cfg["osm_file"] = str(osm_path)
    f = tmp_path / "corridor.yaml"
    f.write_text(yaml.safe_dump(cfg, allow_unicode=True), encoding="utf-8")
    return f


def test_osm_file_uses_osm_files_option(tmp_path, monkeypatch):
    import subprocess
    osm = tmp_path / "olaya.osm"
    osm.write_text("<osm/>", encoding="utf-8")
    calls = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        (tmp_path / "out" / "olaya.net.xml").write_text("<net/>", encoding="utf-8")
        return subprocess.CompletedProcess(cmd, 0, "", "")

    (tmp_path / "out").mkdir()
    monkeypatch.setattr("sim.network.subprocess.run", fake_run)
    build_network(_corridor_with_osm(tmp_path, osm), tmp_path / "out")
    assert "--osm-files" in calls[0] and str(osm) in calls[0]
    assert "--node-files" not in calls[0]
    assert not (tmp_path / "out" / "olaya.nod.xml").exists()
    assert not (tmp_path / "out" / "olaya.edg.xml").exists()


def test_missing_osm_file_raises(tmp_path):
    with pytest.raises(FileNotFoundError, match="osm_file"):
        build_network(_corridor_with_osm(tmp_path, tmp_path / "nope.osm"), tmp_path / "out")
