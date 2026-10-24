"""Majlis voice lab: measures providers with real numbers, per dialect."""

DIALECTS = ("najdi", "hijazi", "southern", "eastern", "northern", "msa_simple")

# Acceptance thresholds from the product spec. They are reported against, never relaxed here.
THRESHOLDS = {
    "wer_max": 0.08,  # per dialect, strictly below
    "mos_min": 4.4,
    "dialect_correct_min": 0.95,
    "latency_p90_ms_max": 800.0,  # strictly below
}
