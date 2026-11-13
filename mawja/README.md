# موجة (Mawja)

Simulation of AI-controlled traffic signals on Olaya Street, Riyadh, built on SUMO.

All commands run from this directory:

    pip install -e .
    pytest -q

The corridor definition lives in `sim/config/corridor.yaml` (geometry is approximate;
set `osm_file:` to build from real OpenStreetMap data).

## RL signal agent (optional, not the demo's Mawja)

    pip install -e '.[rl]'
    # stage 1: halting reward, ~1 M decisions (about 25 min on 4 cores)
    python -m sim.rl.train --reward halting --steps 1000000 --log-dir build/rl_stage1 \
        --out build/rl_stage1/final_policy.zip
    # stage 2: waiting-time reward, warm start, 80 min wall clock
    python -m sim.rl.train --reward wait --max-wall-min 80 --checkpoint-steps 500000 \
        --init-from build/rl_stage1/final_policy.zip --log-dir build/rl \
        --out build/rl/final_policy.zip
    # pick the checkpoint with the lowest avg wait on seeds 2-3 (scale 1.0), then
    cp build/rl/ckpt_<best>.zip models/rl_policy.zip
    python -m sim.cli compare --seed 1 --controllers fixed actuated max_pressure rl \
        --out build/compare_rl

One PPO policy (sb3-contrib MaskablePPO) is shared by all six junctions; it only decides
"extend" or "advance" every 5 s once a green reached 10 s, with the same signal program
as max-pressure. Training uses seeds 10-59 and demand scales 0.8-1.2; seed 1 is held out
for the comparison, seeds 2-3 select the checkpoint. `models/rl_policy.zip` (160 kB) is
the committed policy; training is not bit-reproducible (parallel episode order).

The policy did not pass the Task 8 decision gate (better than max-pressure at scale 1.0,
much worse at 0.8 and 1.2), so `web/data/manifest.json` keeps `max_pressure`.
