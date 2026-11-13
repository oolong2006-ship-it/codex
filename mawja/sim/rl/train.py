"""Train the shared signal policy with (maskable) PPO on parallel Olaya simulations.

    python -m sim.rl.train --steps 3000000 --out models/rl_policy.zip \\
        [--envs 4] [--max-wall-min 120] [--log-dir build/rl]

One libsumo simulation per subprocess (``SubprocVecEnv``); every junction of every
simulation is one slot of the PPO batch (parameter sharing). Episodes draw a training
seed and a demand scale in [0.8, 1.2]. Seeds 1-9 are never used for training: seed 1 is
the held-out evaluation seed of the comparison, seeds 2-3 are for checkpoint selection.

``steps`` counts agent decisions (PPO samples), i.e. 6 per 5 simulated seconds per env.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path
from typing import Sequence

import gymnasium as gym
import numpy as np

from sim.rl.features import OBS_DIM

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "models" / "rl_policy.zip"
DEFAULT_LOG = ROOT / "build" / "rl"
TRAIN_SEEDS = list(range(10, 60))
VALIDATION_SEEDS = [2, 3]
HELD_OUT_SEED = 1

PPO_KW = dict(n_steps=240, batch_size=1440, n_epochs=5, learning_rate=3e-4, gamma=0.99,
              gae_lambda=0.95, clip_range=0.2, ent_coef=0.01, vf_coef=0.5,
              policy_kwargs=dict(net_arch=[64, 64]))


class _SpacesEnv(gym.Env):
    """Per-agent spaces only (to build an untrained policy without a simulation)."""

    observation_space = gym.spaces.Box(0.0, 1.0, (OBS_DIM,), dtype=np.float32)
    action_space = gym.spaces.Discrete(2)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        return np.zeros(OBS_DIM, dtype=np.float32), {}

    def step(self, action):
        return np.zeros(OBS_DIM, dtype=np.float32), 0.0, False, True, {}

    def action_masks(self):
        return np.ones(2, dtype=bool)


def save_untrained(path: Path, seed: int = 0) -> Path:
    """Save a randomly initialised policy (same architecture as training) to ``path``."""
    from sb3_contrib import MaskablePPO

    model = MaskablePPO("MlpPolicy", _SpacesEnv(), seed=seed, device="cpu",
                        **{k: v for k, v in PPO_KW.items() if k == "policy_kwargs"})
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    model.save(str(path))
    return path


def _make_env(seeds: Sequence[int], scales: tuple[float, float], episode_s: int,
              work_dir: Path, rank: int, reward: str = "wait"):
    def thunk():
        from sim.rl.env import MawjaEnv
        env = MawjaEnv(seeds=seeds, scales=scales, episode_s=episode_s, work_dir=work_dir,
                       reward=reward)
        env.reset(seed=1000 + rank)
        return env
    return thunk


def _callback(log_dir: Path, checkpoint_steps: int, max_wall_s: float | None):
    from stable_baselines3.common.callbacks import BaseCallback

    class LogAndCheckpoint(BaseCallback):
        def _on_training_start(self) -> None:
            self.t0 = time.time()
            self.next_ckpt = checkpoint_steps
            log_dir.mkdir(parents=True, exist_ok=True)
            self.f = open(log_dir / "episodes.csv", "a", newline="")
            self.w = csv.writer(self.f)
            if self.f.tell() == 0:
                self.w.writerow(["timesteps", "wall_s", "seed", "scale", "return",
                                 "decisions", "throughput", "in_network"])

        def _on_step(self) -> bool:
            for info in self.locals["infos"]:
                st = info.get("episode_stats")
                if st:
                    self.w.writerow([self.num_timesteps, round(time.time() - self.t0),
                                     st["seed"], st["scale"], round(st["return"], 2),
                                     st["decisions"], st["throughput"], st["in_network"]])
                    self.f.flush()
                    print(f"[{time.time() - self.t0:7.0f}s] steps={self.num_timesteps} "
                          f"seed={st['seed']} scale={st['scale']} "
                          f"return={st['return']:.1f} throughput={st['throughput']}",
                          flush=True)
            if self.num_timesteps >= self.next_ckpt:
                self.model.save(str(log_dir / f"ckpt_{self.num_timesteps}.zip"))
                self.next_ckpt += checkpoint_steps
            if max_wall_s is not None and time.time() - self.t0 > max_wall_s:
                print("wall-clock budget reached, stopping", flush=True)
                return False
            return True

        def _on_training_end(self) -> None:
            self.f.close()

    return LogAndCheckpoint()


def train(steps: int, seeds: list[int], out: Path, n_envs: int = 4,
          scales: tuple[float, float] = (0.8, 1.2), episode_s: int = 7200,
          log_dir: Path = DEFAULT_LOG, checkpoint_steps: int = 250_000,
          max_wall_s: float | None = None, seed: int = 0, reward: str = "wait",
          init_from: Path | None = None) -> Path:
    """Train for ``steps`` agent decisions; save the policy to ``out`` and return it.

    Rewards are normalised by a running return std (``VecNormalize``, rewards only; the
    observations are already in [0, 1], so inference needs no normaliser).
    ``init_from``: warm-start the policy weights from a saved model."""
    import torch
    from sb3_contrib import MaskablePPO
    from stable_baselines3.common.vec_env import SubprocVecEnv, VecNormalize

    from sim.rl.env import MultiAgentVecEnv

    if HELD_OUT_SEED in seeds:
        raise ValueError(f"seed {HELD_OUT_SEED} is the held-out evaluation seed")
    torch.set_num_threads(1)
    log_dir = Path(log_dir)
    work = log_dir / "work"
    venv = SubprocVecEnv([_make_env(seeds, scales, episode_s, work, r, reward)
                          for r in range(n_envs)], start_method="spawn")
    env = VecNormalize(MultiAgentVecEnv(venv), norm_obs=False, norm_reward=True,
                       gamma=PPO_KW["gamma"])
    model = MaskablePPO("MlpPolicy", env, seed=seed, device="cpu", verbose=1, **PPO_KW)
    if init_from is not None:
        model.policy.load_state_dict(
            MaskablePPO.load(str(init_from), device="cpu").policy.state_dict())
    (log_dir).mkdir(parents=True, exist_ok=True)
    (log_dir / "config.json").write_text(json.dumps(
        {"steps": steps, "seeds": seeds, "n_envs": n_envs, "scales": scales,
         "episode_s": episode_s, "ppo": PPO_KW, "seed": seed, "reward": reward,
         "init_from": init_from, "reward_normalisation": "VecNormalize(norm_reward)"},
        indent=1, default=str))
    t0 = time.time()
    try:
        model.learn(total_timesteps=int(steps),
                    callback=_callback(log_dir, checkpoint_steps, max_wall_s))
    finally:
        out = Path(out)
        out.parent.mkdir(parents=True, exist_ok=True)
        model.save(str(out))
        env.close()
    print(f"trained {model.num_timesteps} steps in {time.time() - t0:.0f} s -> {out}",
          flush=True)
    return out


def evaluate(model_path: Path, seed: int, scale: float, duration: int | None = None,
             work_dir: Path | None = None) -> dict:
    """KPIs of the RL controller on one rule-checked run (raises on rule violations)."""
    from sim import export
    from sim.controllers.rl import RLController

    with export._workdir(work_dir) as wd:
        net, routes = export.prepare(seed, scale, wd)
        r = export.run_checked(net, routes, RLController(model_path), seed,
                               duration=duration)
    return dict(r.kpis)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m sim.rl.train")
    p.add_argument("--steps", type=int, default=3_000_000)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--envs", type=int, default=4)
    p.add_argument("--episode-s", type=int, default=7200)
    p.add_argument("--log-dir", type=Path, default=DEFAULT_LOG)
    p.add_argument("--checkpoint-steps", type=int, default=250_000)
    p.add_argument("--max-wall-min", type=float, default=None)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--reward", choices=("wait", "halting", "pressure"), default="wait")
    p.add_argument("--init-from", type=Path, default=None)
    a = p.parse_args(argv)
    train(a.steps, TRAIN_SEEDS, a.out, n_envs=a.envs, episode_s=a.episode_s,
          log_dir=a.log_dir, checkpoint_steps=a.checkpoint_steps,
          max_wall_s=None if a.max_wall_min is None else a.max_wall_min * 60, seed=a.seed,
          reward=a.reward, init_from=a.init_from)
    return 0


if __name__ == "__main__":
    sys.exit(main())
