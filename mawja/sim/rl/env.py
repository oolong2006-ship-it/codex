"""Gymnasium environment for training one signal policy shared by all junctions.

``MawjaEnv`` runs one libsumo simulation of the Olaya corridor (libsumo allows one
simulation per process -- use one env per process, e.g. ``SubprocVecEnv``). The signal
mechanics are exactly those of ``MaxPressure`` (same cyclic program, 3 s yellow + 2 s
all-red, decisions every 5 s once a green reached MIN_GREEN, greens forced to end at
MAX_GREEN); only the extend/advance decision comes from the agent.

Multi-agent by parameter sharing: observations are ``(n_agents, OBS_DIM)``, actions
``(n_agents,)`` with 0 = extend, 1 = advance. ``action_masks()`` allows "advance" only for
agents whose decision is due (green >= MIN_GREEN on the 5 s grid, below MAX_GREEN); for
all others only "extend" is valid and the action is ignored. The gymnasium ``reward`` is
the mean agent reward; per-agent rewards are in ``info["agent_rewards"]``.

``MultiAgentVecEnv`` turns a VecEnv of ``MawjaEnv`` into a VecEnv with one slot per
(env, agent), which is what a single shared PPO policy trains on.
"""
from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any, Sequence

import gymnasium as gym
import libsumo
import numpy as np
from stable_baselines3.common.vec_env.base_vec_env import VecEnv, VecEnvWrapper

from sim.controllers.max_pressure import MaxPressure
from sim.demand import build_routes
from sim.network import build_network, signal_ids
from sim.rl.features import N_PHASES, OBS_DIM, OBS_LANES, REWARD_SCALE, REWARDS, Features
from sim.runner import PhaseEntry, _sumo_cmd

__all__ = ["MawjaEnv", "MultiAgentVecEnv", "OBS_DIM", "OBS_LANES", "N_PHASES",
           "REWARD_SCALE"]

ROOT = Path(__file__).resolve().parents[2]
CORRIDOR_YAML = ROOT / "sim" / "config" / "corridor.yaml"
DEMAND_YAML = ROOT / "sim" / "config" / "demand_evening.yaml"
SCALE_STEP = 0.05  # demand scales are drawn on this grid (routes are cached per scale)


class MawjaEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, seeds: Sequence[int], scales: tuple[float, float] = (0.8, 1.2),
                 episode_s: int = 7200, work_dir: Path | None = None,
                 reward: str = "wait"):
        super().__init__()
        if not seeds:
            raise ValueError("seeds must not be empty")
        self.seeds = [int(s) for s in seeds]
        self.scales = (float(scales[0]), float(scales[1]))
        self.episode_s = int(episode_s)
        if reward not in REWARDS:
            raise ValueError(f"unknown reward {reward!r}; choose from {REWARDS}")
        self.reward = reward
        base = Path(work_dir) if work_dir is not None else None
        if base is not None:
            base.mkdir(parents=True, exist_ok=True)
        self._work = Path(tempfile.mkdtemp(prefix="mawja_env_", dir=base))
        self.net_xml = build_network(CORRIDOR_YAML, self._work / "net")
        self.tls_ids = signal_ids(self.net_xml)
        self.n_agents = len(self.tls_ids)
        self.observation_space = gym.spaces.Box(0.0, 1.0, (self.n_agents, OBS_DIM),
                                                dtype=np.float32)
        self.action_space = gym.spaces.MultiDiscrete([2] * self.n_agents)
        self._routes: dict[tuple[int, float], Path] = {}
        self._running = False
        self.t = 0
        self.signals: MaxPressure | None = None
        self.features: Features | None = None
        self._due: list[str] = []
        self.phase_log: list[PhaseEntry] = []
        self.episode_info: dict[str, Any] = {}

    # --- helpers --------------------------------------------------------------------
    def _route(self, seed: int, scale: float) -> Path:
        key = (seed, scale)
        if key not in self._routes:
            self._routes[key] = build_routes(self.net_xml, DEMAND_YAML, seed, scale,
                                             self._work / f"rou_{seed}_{scale!r}")
        return self._routes[key]

    def _close_sim(self) -> None:
        if self._running:
            try:
                libsumo.close()
            except Exception:
                pass
            self._running = False

    def _log_phases(self) -> None:
        tl = libsumo.trafficlight
        for tid in self.tls_ids:
            p = tl.getPhase(tid)
            if self._last_phase[tid] != p:
                self._last_phase[tid] = p
                self.phase_log.append(PhaseEntry(self.t, tid, p,
                                                 tl.getRedYellowGreenState(tid)))

    def _advance(self) -> np.ndarray:
        """Simulate until a decision is due or the episode ends; mean reward per agent."""
        total = np.zeros(self.n_agents)
        n = 0
        while True:
            libsumo.simulationStep()
            self.t += 1
            self.episode_info["throughput"] += libsumo.simulation.getArrivedNumber()
            self._due = self.signals._due(libsumo, self.t)
            self._log_phases()
            total += self.features.rewards(libsumo, self.signals, self.reward)
            n += 1
            if self._due or self.t >= self.episode_s:
                return total / n

    # --- gymnasium API --------------------------------------------------------------
    def reset(self, *, seed: int | None = None, options: dict | None = None):
        super().reset(seed=seed)
        self._close_sim()
        sim_seed = int(self.np_random.choice(self.seeds))
        lo, hi = self.scales
        scale = float(self.np_random.uniform(lo, hi))
        scale = round(round(scale / SCALE_STEP) * SCALE_STEP, 2)
        scale = min(max(scale, round(lo, 2)), round(hi, 2))
        routes = self._route(sim_seed, scale)
        try:
            libsumo.close()  # a previous run in this process may have been left open
        except Exception:
            pass
        libsumo.start(_sumo_cmd(self.net_xml, routes, sim_seed, self.episode_s))
        self._running = True
        self.t = 0
        self.signals = MaxPressure()
        self.signals.setup(libsumo, list(self.tls_ids))
        self.features = Features(libsumo, self.tls_ids)
        tl = libsumo.trafficlight
        self._last_phase = {tid: tl.getPhase(tid) for tid in self.tls_ids}
        self.phase_log = [PhaseEntry(0, tid, p, tl.getRedYellowGreenState(tid))
                          for tid, p in self._last_phase.items()]
        self.episode_info = {"seed": sim_seed, "scale": scale, "return": 0.0,
                             "decisions": 0, "throughput": 0}
        self._advance()
        obs = self.features.observe(libsumo, self.signals, self.t)
        return obs, {"seed": sim_seed, "scale": scale}

    def action_masks(self) -> np.ndarray:
        masks = np.zeros((self.n_agents, 2), dtype=bool)
        masks[:, 0] = True
        for k, tid in enumerate(self.tls_ids):
            masks[k, 1] = tid in self._due
        return masks

    def step(self, action):
        action = np.asarray(action).reshape(-1)
        for k, tid in enumerate(self.tls_ids):
            if tid in self._due:
                self.episode_info["decisions"] += 1
                if int(action[k]) == 1:
                    self.signals._end_green(libsumo.trafficlight, tid)
        self._due = []
        rewards = self._advance()
        obs = self.features.observe(libsumo, self.signals, self.t)
        truncated = self.t >= self.episode_s
        self.episode_info["return"] += float(rewards.sum())
        info: dict[str, Any] = {"agent_rewards": rewards, "t": self.t}
        if truncated:
            info["episode_stats"] = {**self.episode_info,
                                     "in_network": libsumo.vehicle.getIDCount()}
        return obs, float(rewards.mean()), False, truncated, info

    def close(self) -> None:
        self._close_sim()


class MultiAgentVecEnv(VecEnvWrapper):
    """One VecEnv slot per (env, agent): obs (E*N, D), actions (E*N,), rewards (E*N,).

    All agents of an env end their episode together (time limit -> truncated, so PPO
    bootstraps from the terminal observation).
    """

    def __init__(self, venv: VecEnv):
        space = venv.observation_space
        self.n_agents = int(space.shape[0])
        self.n_envs = venv.num_envs
        obs_space = gym.spaces.Box(0.0, 1.0, (space.shape[1],), dtype=np.float32)
        self.venv = venv
        VecEnv.__init__(self, self.n_envs * self.n_agents, obs_space, gym.spaces.Discrete(2))
        self.class_attributes = {}

    def reset(self) -> np.ndarray:
        obs = self.venv.reset()
        return obs.reshape(self.num_envs, -1)

    def step_async(self, actions: np.ndarray) -> None:
        self.venv.step_async(np.asarray(actions).reshape(self.n_envs, self.n_agents))

    def step_wait(self):
        obs, _, dones, infos = self.venv.step_wait()
        n = self.n_agents
        rewards = np.concatenate([np.asarray(i["agent_rewards"], dtype=np.float32)
                                  for i in infos])
        out_infos: list[dict] = []
        for e, info in enumerate(infos):
            for k in range(n):
                d: dict[str, Any] = {}
                if dones[e]:
                    d["terminal_observation"] = info["terminal_observation"][k]
                    d["TimeLimit.truncated"] = bool(info.get("TimeLimit.truncated", True))
                    if k == 0 and "episode_stats" in info:
                        d["episode_stats"] = info["episode_stats"]
                out_infos.append(d)
        return (obs.reshape(self.num_envs, -1), rewards, np.repeat(dones, n), out_infos)

    def env_method(self, method_name: str, *args, indices=None, **kwargs) -> list:
        if method_name == "action_masks":
            masks = self.venv.env_method("action_masks")
            flat = [m for env_masks in masks for m in env_masks]
            if indices is not None:
                idx = [indices] if isinstance(indices, int) else list(indices)
                flat = [flat[i] for i in idx]
            return flat
        return self.venv.env_method(method_name, *args, indices=indices, **kwargs)

    def has_attr(self, attr_name: str) -> bool:
        return attr_name == "action_masks" or self.venv.has_attr(attr_name)

    def close(self) -> None:
        self.venv.close()
