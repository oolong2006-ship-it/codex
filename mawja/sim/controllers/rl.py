"""Reinforcement-learning signal agent: one PPO policy shared by all junctions.

Signal mechanics are inherited unchanged from ``MaxPressure`` (same cyclic program with
3 s yellow + 2 s all-red, decisions every 5 s once a green reached MIN_GREEN, greens
forced to end at MAX_GREEN), so the phase structure is identical to the max-pressure
controller and the signal rules hold by construction. Only the extend/advance decision
comes from the trained policy (``sim.rl.train``), applied to each junction's own
observation (``sim.rl.features``).

Needs the optional ``rl`` extra (gymnasium, stable-baselines3, sb3-contrib, torch).
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from sim.controllers.max_pressure import MaxPressure

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODEL = ROOT / "models" / "rl_policy.zip"


def _unavailable(msg: str) -> Exception:
    from sim.export import ControllerUnavailable  # local: export imports this module lazily
    return ControllerUnavailable(msg)


class RLController(MaxPressure):
    name = "rl"
    label_ar = "وكيل تعلم معزز"

    def __init__(self, model_path: Path = DEFAULT_MODEL):
        super().__init__(decision_interval=5)
        model_path = Path(model_path)
        if not model_path.exists():
            raise _unavailable(f"RL model {model_path} not found; train it with "
                               "`python -m sim.rl.train` (see README)")
        try:
            import torch
            from sb3_contrib import MaskablePPO
        except ImportError as exc:
            raise _unavailable(f"rl extra not installed ({exc}); pip install -e '.[rl]'") \
                from exc
        torch.set_num_threads(1)
        self.model_path = model_path
        self.model = MaskablePPO.load(str(model_path), device="cpu")
        self.features = None

    def setup(self, conn: Any, tls_ids: list[str]) -> None:
        from sim.rl.features import Features
        super().setup(conn, tls_ids)
        self.features = Features(conn, list(tls_ids))

    def step(self, conn: Any, t: int) -> None:
        due = self._due(conn, t)
        if not due:
            return
        obs = self.features.observe(conn, self, t)
        idx = [self.features.tls_ids.index(tid) for tid in due]
        masks = np.ones((len(idx), 2), dtype=bool)
        actions, _ = self.model.predict(obs[idx], action_masks=masks, deterministic=True)
        tl = conn.trafficlight
        for tid, a in zip(due, np.asarray(actions).reshape(-1)):
            if int(a) == 1:
                self._end_green(tl, tid)
