#!/usr/bin/env python3
"""Export the initial baseline/experience catalog for the website."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import quote

from export_network_run import _load_detector, export_run


RUNS = (
    {"id": "default_sv0", "label": "Baseline", "conditionCategory": "baseline", "seed": 0},
    {
        "id": "exp_25%_150_sv0",
        "label": "Experience strengthened",
        "conditionCategory": "experience-strengthened",
        "seed": 0,
    },
)


def export_catalog(source_root: Path, output_root: Path, detector_module: Path) -> dict[str, object]:
    detector = _load_detector(detector_module)
    entries = []
    for run in RUNS:
        run_id = str(run["id"])
        manifest = export_run(
            source_root / run_id,
            output_root / run_id,
            run_id,
            str(run["label"]),
            str(run["conditionCategory"]),
            int(run["seed"]),
            detector,
        )
        entries.append(
            {
                **run,
                "manifestUrl": f"{quote(run_id, safe='')}/manifest.json",
                "spwrEventCount": manifest["events"]["count"],
            }
        )

    catalog = {"schemaVersion": 1, "runs": entries}
    output_root.mkdir(parents=True, exist_ok=True)
    (output_root / "runs.json").write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    return catalog


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True, type=Path, help="Parent directory containing both trusted run folders")
    parser.add_argument("--output-root", required=True, type=Path, help="Destination data catalog directory")
    parser.add_argument("--detector-module", required=True, type=Path, help="Path to the trusted ripple_detection.py module")
    args = parser.parse_args()
    catalog = export_catalog(args.source_root.resolve(), args.output_root.resolve(), args.detector_module.resolve())
    print(f"Exported {len(catalog['runs'])} runs to {args.output_root.resolve()}")


if __name__ == "__main__":
    main()
