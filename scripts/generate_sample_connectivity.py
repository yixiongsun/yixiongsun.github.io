#!/usr/bin/env python3
"""Generate deterministic synthetic connectivity solely for browser UI testing."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from export_brian_connectivity import ProjectionExport, export_connectivity_bundle


POPULATIONS = {
    "pfc-py": (0, 1000),
    "pfc-in": (1000, 250),
    "ca3-py": (1250, 1000),
    "ca3-in": (2250, 100),
    "ca1-py": (2350, 1000),
    "ca1-in": (3350, 100),
}

PROJECTIONS = (
    ("pfc-py-py", "PFC pyramidal → pyramidal", "pfc-py", "pfc-py", "excitatory"),
    ("pfc-py-in", "PFC pyramidal → interneuron", "pfc-py", "pfc-in", "excitatory"),
    ("pfc-in-py", "PFC interneuron → pyramidal", "pfc-in", "pfc-py", "inhibitory"),
    ("pfc-in-in", "PFC interneuron → interneuron", "pfc-in", "pfc-in", "inhibitory"),
    ("ca3-py-py", "CA3 pyramidal → pyramidal", "ca3-py", "ca3-py", "excitatory"),
    ("ca3-py-in", "CA3 pyramidal → interneuron", "ca3-py", "ca3-in", "excitatory"),
    ("ca3-in-py", "CA3 interneuron → pyramidal", "ca3-in", "ca3-py", "inhibitory"),
    ("ca1-py-in", "CA1 pyramidal → interneuron", "ca1-py", "ca1-in", "excitatory"),
    ("ca1-in-py", "CA1 interneuron → pyramidal", "ca1-in", "ca1-py", "inhibitory"),
    ("ca1-in-in", "CA1 interneuron → interneuron", "ca1-in", "ca1-in", "inhibitory"),
    ("ca3-ca1-py", "Schaffer: CA3 pyramidal → CA1 pyramidal", "ca3-py", "ca1-py", "excitatory"),
    ("ca3-ca1-in", "Schaffer: CA3 pyramidal → CA1 interneuron", "ca3-py", "ca1-in", "excitatory"),
    ("pfc-ca3-py", "PFC pyramidal → CA3 pyramidal", "pfc-py", "ca3-py", "excitatory"),
    ("pfc-ca3-in", "PFC pyramidal → CA3 interneuron", "pfc-py", "ca3-in", "excitatory"),
    ("pfc-ca1-py", "PFC pyramidal → CA1 pyramidal", "pfc-py", "ca1-py", "excitatory"),
    ("pfc-ca1-in", "PFC pyramidal → CA1 interneuron", "pfc-py", "ca1-in", "excitatory"),
)


class ArrayVariable:
    def __init__(self, values: np.ndarray) -> None:
        self.values = values

    def __getitem__(self, _key: object) -> np.ndarray:
        return self.values


class SyntheticSynapses:
    def __init__(self, source_count: int, target_count: int, projection_index: int) -> None:
        source = np.repeat(np.arange(source_count, dtype=np.int64), 3)
        offsets = np.tile(np.array([1, 7, 19], dtype=np.int64), source_count)
        target = (source * (projection_index % 5 + 1) + offsets + projection_index * 11) % target_count
        weight = 0.12 + ((source * 17 + target * 7 + projection_index * 13) % 109) / 100
        delay = 0.5 + ((source * 3 + target + projection_index) % 76) / 10
        self.i = ArrayVariable(source)
        self.j = ArrayVariable(target)
        self.w = ArrayVariable(weight)
        self.delay = ArrayVariable(delay)


def generate(output_dir: Path, manifest_path: Path, run_id: str, seed: int) -> dict[str, object]:
    specifications = []
    for index, (projection_id, label, source_id, target_id, synapse_type) in enumerate(PROJECTIONS):
        source_offset, source_count = POPULATIONS[source_id]
        target_offset, target_count = POPULATIONS[target_id]
        specifications.append(
            ProjectionExport(
                projection_id,
                label,
                SyntheticSynapses(source_count, target_count, index),
                source_offset,
                target_offset,
                source_id,
                target_id,
                synapse_type,
                weight_unit_label="synthetic relative weight",
            )
        )
    index = export_connectivity_bundle(output_dir, run_id, seed, specifications, provenance="synthetic-ui-fixture")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("runId") != run_id or manifest.get("condition", {}).get("seed") != seed:
        raise ValueError("Manifest run ID or seed does not match the requested synthetic fixture")
    manifest["connectivity"] = {
        "schemaVersion": 1,
        "runId": run_id,
        "seed": seed,
        "provenance": "synthetic-ui-fixture",
        "indexFile": "connectivity/connectivity.json",
        "projections": [{**projection, "file": f"connectivity/{projection['file']}"} for projection in index["projections"]],
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return index


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-root", type=Path, required=True)
    parser.add_argument("--run-id", default="default_sv0")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()
    index = generate(args.run_root / "connectivity", args.run_root / "manifest.json", args.run_id, args.seed)
    print(f"Generated {sum(item['edgeCount'] for item in index['projections']):,} synthetic UI-test edges")


if __name__ == "__main__":
    main()
