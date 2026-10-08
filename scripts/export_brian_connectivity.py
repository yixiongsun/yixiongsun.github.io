#!/usr/bin/env python3
"""Export exact connectivity while constructed Brian2 Synapses objects are still live.

Call ``export_connectivity_bundle`` from the simulation process after all connection
and condition-specific weight changes have been applied. This module intentionally
does not accept a random seed as a recipe for rebuilding connectivity later.
"""

from __future__ import annotations

import hashlib
import json
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import numpy as np


CONNECTIVITY_MAGIC = b"NCX1"


@dataclass(frozen=True)
class ProjectionExport:
    id: str
    label: str
    synapses: Any
    source_offset: int
    target_offset: int
    source_population_id: str
    target_population_id: str
    synapse_type: str
    weight_unit: Any | None = None
    weight_unit_label: str = "model weight"
    delay_unit: Any | None = None


def encode_projection(source_ids: np.ndarray, target_ids: np.ndarray, weights: np.ndarray, delays_ms: np.ndarray) -> bytes:
    """Encode one projection as global IDs plus weight and delay arrays."""
    source = np.asarray(source_ids, dtype="<u2")
    target = np.asarray(target_ids, dtype="<u2")
    weight = np.asarray(weights, dtype="<f4")
    delay = np.asarray(delays_ms, dtype="<f4")
    if not (source.ndim == target.ndim == weight.ndim == delay.ndim == 1):
        raise ValueError("Connectivity arrays must be one-dimensional")
    if not (len(source) == len(target) == len(weight) == len(delay)):
        raise ValueError("Connectivity arrays must have equal lengths")
    if not np.isfinite(weight).all() or not np.isfinite(delay).all() or np.any(delay < 0):
        raise ValueError("Connectivity contains an invalid weight or delay")
    return (
        struct.pack("<4sI", CONNECTIVITY_MAGIC, len(source))
        + source.tobytes()
        + target.tobytes()
        + weight.tobytes()
        + delay.tobytes()
    )


def _values(variable: Any, unit: Any | None = None) -> np.ndarray:
    selected = variable[:]
    if unit is not None:
        selected = selected / unit
    return np.asarray(selected)


def export_connectivity_bundle(
    output_dir: Path,
    run_id: str,
    seed: int,
    projections: Iterable[ProjectionExport],
    provenance: str = "live-brian2-synapses",
) -> dict[str, object]:
    """Write a seed-specific bundle directly from constructed synapse objects.

    Dense Brian2 Synapses objects in this model include zero-weight placeholders;
    those entries are excluded from the exported anatomical/functional edge set.
    """
    if not run_id:
        raise ValueError("run_id is required")
    if provenance not in {"live-brian2-synapses", "synthetic-ui-fixture"}:
        raise ValueError("Unsupported connectivity provenance")
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    descriptors: list[dict[str, object]] = []
    seen: set[str] = set()

    for projection in projections:
        if projection.id in seen:
            raise ValueError(f"Duplicate projection id: {projection.id}")
        seen.add(projection.id)
        local_sources = _values(projection.synapses.i).astype(np.int64, copy=False)
        local_targets = _values(projection.synapses.j).astype(np.int64, copy=False)
        weights = _values(projection.synapses.w, projection.weight_unit).astype(np.float64, copy=False)
        try:
            delays = _values(projection.synapses.delay, projection.delay_unit).astype(np.float64, copy=False)
        except (AttributeError, TypeError):
            delays = np.zeros(len(weights), dtype=np.float64)
        if not (len(local_sources) == len(local_targets) == len(weights) == len(delays)):
            raise ValueError(f"{projection.id}: synapse arrays have unequal lengths")

        present = np.isfinite(weights) & (weights != 0)
        source_ids = local_sources[present] + projection.source_offset
        target_ids = local_targets[present] + projection.target_offset
        selected_weights = weights[present]
        selected_delays = delays[present]
        if np.any(source_ids < 0) or np.any(source_ids > np.iinfo(np.uint16).max):
            raise ValueError(f"{projection.id}: source ID exceeds Uint16 range")
        if np.any(target_ids < 0) or np.any(target_ids > np.iinfo(np.uint16).max):
            raise ValueError(f"{projection.id}: target ID exceeds Uint16 range")

        payload = encode_projection(source_ids, target_ids, selected_weights, selected_delays)
        filename = f"{projection.id}.bin"
        (output_dir / filename).write_bytes(payload)
        descriptors.append(
            {
                "id": projection.id,
                "label": projection.label,
                "file": filename,
                "edgeCount": int(present.sum()),
                "sourcePopulationId": projection.source_population_id,
                "targetPopulationId": projection.target_population_id,
                "synapseType": projection.synapse_type,
                "weightUnit": projection.weight_unit_label,
                "encoding": "NCX1:u16-source+u16-target+f32-weight+f32-delay-ms:little-endian",
                "sha256": hashlib.sha256(payload).hexdigest(),
            }
        )

    index: dict[str, object] = {
        "schemaVersion": 1,
        "runId": run_id,
        "seed": int(seed),
        "provenance": provenance,
        "projections": descriptors,
    }
    (output_dir / "connectivity.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    return index

