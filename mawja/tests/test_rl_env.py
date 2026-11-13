from pathlib import Path

import numpy as np
import pytest

pytest.importorskip("gymnasium")
pytest.importorskip("stable_baselines3")
pytest.importorskip("sb3_contrib")

from sim.controllers.base import Controller  # noqa: E402
from sim.network import signal_ids  # noqa: E402
from sim.rules import MAX_GREEN, MIN_GREEN, check_rules, phase_kind  # noqa: E402
from sim.runner import run  # noqa: E402

from sim.rl.env import N_PHASES, OBS_DIM, OBS_LANES, MawjaEnv, MultiAgentVecEnv  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CFG = ROOT / "sim" / "config"


@pytest.fixture(scope="module")
def env():
    e = MawjaEnv(seeds=[7], scales=(1.0, 1.0), episode_s=400)
    yield e
    e.close()


def test_env_obs_shape(env):
    obs, info = env.reset(seed=0)
    n = env.n_agents
    assert n == 6
    assert OBS_DIM == OBS_LANES + N_PHASES + 1 + 2 == 19
    assert obs.shape == (n, OBS_DIM) and obs.dtype == np.float32
    assert env.observation_space.contains(obs)
    assert np.all(obs >= 0.0) and np.all(obs <= 1.0)
    # phase one-hot: exactly one green index per agent
    onehot = obs[:, OBS_LANES:OBS_LANES + N_PHASES]
    assert np.all(onehot.sum(axis=1) == 1.0)
    obs2, reward, terminated, truncated, info = env.step(np.zeros(n, dtype=np.int64))
    assert obs2.shape == (n, OBS_DIM)
    assert info["agent_rewards"].shape == (n,)
    assert np.isclose(reward, info["agent_rewards"].mean())
    assert not terminated


def test_action_mask_enforces_min_green(env):
    env.reset(seed=0)
    n = env.n_agents
    steps = 0
    saw_free = saw_masked = False
    while True:
        masks = env.action_masks()
        assert masks.shape == (n, 2)
        assert masks[:, 0].all()            # "extend" is always allowed
        for k, tid in enumerate(env.tls_ids):
            g = env.signals.green_seconds(tid, env.t)
            if masks[k, 1]:
                saw_free = True
                assert g is not None and MIN_GREEN <= g < MAX_GREEN
            else:
                saw_masked = True
        # agent 0 always asks to advance (also when masked: the mask, not the agent, must
        # keep greens >= MIN_GREEN); the others always extend (MAX_GREEN must end them)
        action = np.zeros(n, dtype=np.int64)
        action[0] = 1
        _, _, term, trunc, _ = env.step(action)
        steps += 1
        if term or trunc:
            break
    assert saw_free and saw_masked and steps > 10
    log = env.phase_log
    assert check_rules(log, env.net_xml, end_t=env.t) == []

    def greens(tid):
        seq = [(e[0], e.state) for e in log if e[1] == tid]
        return [seq[k + 1][0] - t for k, (t, s) in enumerate(seq[1:-1], start=1)
                if phase_kind(s) == "green"]

    # advancing at every chance gives exactly MIN_GREEN greens (after the first) ...
    assert greens(env.tls_ids[0]) and set(greens(env.tls_ids[0])) == {MIN_GREEN}
    # ... and never advancing is cut off at MAX_GREEN
    assert set(greens(env.tls_ids[1])) == {MAX_GREEN}


def _small_env():
    return MawjaEnv(seeds=[7], scales=(1.0, 1.0), episode_s=60)


def test_multi_agent_vec_env_flattens_agents():
    from stable_baselines3.common.vec_env import SubprocVecEnv

    # libsumo runs one simulation per process: one env per subprocess
    base = SubprocVecEnv([_small_env] * 2, start_method="spawn")
    vec = MultiAgentVecEnv(base)
    try:
        assert vec.num_envs == 12
        obs = vec.reset()
        assert obs.shape == (12, OBS_DIM)
        masks = np.stack(vec.env_method("action_masks"))
        assert masks.shape == (12, 2)
        assert vec.has_attr("action_masks")
        done_seen = False
        for _ in range(20):
            obs, rew, dones, infos = vec.step(np.zeros(12, dtype=np.int64))
            assert obs.shape == (12, OBS_DIM) and rew.shape == (12,) and len(infos) == 12
            if dones.any():
                done_seen = True
                assert dones.all()
                assert all(i["terminal_observation"].shape == (OBS_DIM,) for i in infos)
                assert all(i.get("TimeLimit.truncated") for i in infos)
                break
        assert done_seen
    finally:
        vec.close()


def test_rl_controller_obeys_rules(tmp_path):
    from sim import export
    from sim.controllers.rl import RLController
    from sim.rl.train import save_untrained

    model = save_untrained(tmp_path / "random_policy.zip", seed=3)
    ctrl = RLController(model)
    assert isinstance(ctrl, Controller)
    assert (ctrl.name, ctrl.label_ar) == ("rl", "وكيل تعلم معزز")
    net_xml, routes = export.prepare(1, 1.0, tmp_path / "w")
    r = run(net_xml, routes, ctrl, seed=1, duration=900)
    assert check_rules(r.phase_log, net_xml, end_t=r.diagnostics["duration_s"]) == []
    assert r.kpis["teleports"] == 0 and r.kpis["throughput"] > 0
    tid = signal_ids(net_xml)[0]
    seq = [(e[0], e.state) for e in r.phase_log if e[1] == tid]
    greens = [seq[k + 1][0] - t for k, (t, s) in enumerate(seq[1:-1], start=1)
              if phase_kind(s) == "green"]
    assert greens and min(greens) >= MIN_GREEN and max(greens) <= MAX_GREEN


def test_rl_controller_missing_model_is_clear_error(tmp_path):
    from sim import export
    from sim.controllers.rl import RLController

    with pytest.raises(export.ControllerUnavailable):
        RLController(tmp_path / "nope.zip")


def test_rewards(env):
    import libsumo

    from sim.rl.features import REWARD_SCALE, WAIT_REWARD_SCALE

    env.reset(seed=0)
    for _ in range(30):
        env.step(np.zeros(env.n_agents, dtype=np.int64))
    feats, lane = env.features, libsumo.lane
    # default (trained) reward: -(accumulated waiting of vehicles on incoming lanes)
    r = feats.rewards(libsumo, env.signals)
    expect = [-WAIT_REWARD_SCALE * sum(libsumo.vehicle.getAccumulatedWaitingTime(v)
                                       for l in feats.in_lanes[tid]
                                       for v in lane.getLastStepVehicleIDs(l))
              for tid in env.tls_ids]
    # (+ departure delay of vehicles that could not enter; none in the first 150 s here)
    assert libsumo.simulation.getPendingVehicles() == ()
    assert np.allclose(r, expect)
    assert np.all(r <= 0.0) and r.sum() < 0.0   # queues build within 150 s of extending
    h = feats.rewards(libsumo, env.signals, "halting")
    assert np.allclose(h, [-REWARD_SCALE * sum(lane.getLastStepHaltingNumber(l)
                                               for l in feats.in_lanes[tid])
                           for tid in env.tls_ids])
    from sim.controllers.max_pressure import pressure
    p = feats.rewards(libsumo, env.signals, "pressure")
    assert np.allclose(p, [-REWARD_SCALE * sum(pressure(libsumo, tid, st)
                                               for st in env.signals._greens[tid])
                           for tid in env.tls_ids])
    with pytest.raises(ValueError):
        feats.rewards(libsumo, env.signals, "nope")


def test_wait_reward_counts_vehicles_that_cannot_enter(tmp_path):
    """Starving an approach until it backs up out of the network must not pay off."""
    import libsumo

    from sim.rl.features import WAIT_REWARD_SCALE

    e = MawjaEnv(seeds=[7], scales=(1.2, 1.2), episode_s=1500, work_dir=tmp_path)
    try:
        e.reset(seed=0)
        n = e.n_agents
        while True:      # never advance: cross streets get green only via MAX_GREEN
            _, _, _, trunc, _ = e.step(np.zeros(n, dtype=np.int64))
            pend = libsumo.simulation.getPendingVehicles()
            if pend or trunc:
                break
        assert pend, "expected vehicles waiting outside the network"
        on_lanes = np.array([-WAIT_REWARD_SCALE * sum(
            libsumo.vehicle.getAccumulatedWaitingTime(v) for l in e.features.in_lanes[tid]
            for v in libsumo.lane.getLastStepVehicleIDs(l)) for tid in e.tls_ids])
        r = e.features.wait_rewards(libsumo)
        delay = sum(libsumo.vehicle.getDepartDelay(v) for v in pend)
        assert r.sum() == pytest.approx(on_lanes.sum() - WAIT_REWARD_SCALE * delay)
        assert r.sum() < on_lanes.sum()
    finally:
        e.close()
