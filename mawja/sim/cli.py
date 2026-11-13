"""Mawja experiment CLI (run from ``mawja/``).

    python -m sim.cli compare --seed 1 --scales 0.8 1.0 1.2 [--out web/data/]
    python -m sim.cli export --controller {fixed,actuated,max_pressure,rl} --seed 1
                             [--out web/data/] [--set-mawja]

Every run is checked against the signal rules; any violation aborts with exit code 1 and
nothing is written for that command.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sim import export


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m sim.cli", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("compare", help="run all controllers at several demand scales")
    c.add_argument("--seed", type=int, default=1)
    c.add_argument("--scales", type=float, nargs="+", default=[0.8, 1.0, 1.2])
    c.add_argument("--controllers", nargs="+", default=list(export.COMPARE_CONTROLLERS),
                   choices=export.CONTROLLERS)
    c.add_argument("--out", type=Path, default=Path("web/data"))
    c.add_argument("--duration", type=int, default=None,
                   help="simulated seconds (default: full 7200 s peak)")

    e = sub.add_parser("export", help="record one run as replay_<controller>.json")
    e.add_argument("--controller", required=True, choices=export.CONTROLLERS)
    e.add_argument("--seed", type=int, default=1)
    e.add_argument("--scale", type=float, default=export.REPLAY_SCALE)
    e.add_argument("--out", type=Path, default=Path("web/data"))
    e.add_argument("--duration", type=int, default=None,
                   help="simulated seconds (default: full 7200 s peak)")
    e.add_argument("--set-mawja", action="store_true",
                   help="set manifest.json mawja to this controller "
                        f"(only {' / '.join(export.MAWJA_CHOICES)})")
    return p


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    if args.cmd == "export" and args.set_mawja and args.controller not in export.MAWJA_CHOICES:
        parser.error(f"--set-mawja: Mawja can only be {' or '.join(export.MAWJA_CHOICES)}, "
                     f"not {args.controller!r}")
    log = lambda msg: print(msg, file=sys.stderr, flush=True)  # noqa: E731
    try:
        if args.cmd == "compare":
            export.compare(args.seed, args.scales, args.out, controllers=args.controllers,
                           duration=args.duration, log=log)
            log(f"wrote {args.out / 'results.json'}")
        else:
            path = export.export_replay(args.controller, args.seed, args.out,
                                        scale=args.scale, duration=args.duration)
            manifest = export.write_manifest(
                args.out, args.controller if args.set_mawja else None)
            log(f"wrote {path} ({path.stat().st_size / 1e6:.1f} MB); manifest {manifest}")
    except (export.RuleViolation, export.ControllerUnavailable,
            export.ReplayIncomplete) as exc:
        log(f"error: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
