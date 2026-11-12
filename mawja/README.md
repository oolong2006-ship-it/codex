# موجة (Mawja)

Simulation of AI-controlled traffic signals on Olaya Street, Riyadh, built on SUMO.

All commands run from this directory:

    pip install -e .
    pytest -q

The corridor definition lives in `sim/config/corridor.yaml` (geometry is approximate;
set `osm_file:` to build from real OpenStreetMap data).
