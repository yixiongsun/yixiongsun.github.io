#!/usr/bin/env python3
"""Export trusted Brian2 run data to versioned browser-safe payloads."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import pickle
import shutil
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np


SPIKE_MAGIC = b"NSV1"
SIGNAL_MAGIC = b"NSG2"
SCHEMA_VERSION = 2
TICK_MS = 0.05
DURATION_MS = 30_000.0
CURRENT_SAMPLE_RATE_HZ = 1_000
RATE_SAMPLE_RATE_HZ = 100
RATE_BIN_MS = 10.0
RATE_SMOOTHING_SIGMA_MS = 20.0
EXPECTED_SIGNAL_SAMPLES = 30_000
CONNECTIVITY_INDEX = "connectivity.json"

# These match the model's monitored CA1 compartment areas and cell counts.
DENDRITIC_AREA = 1.5e-4
AXOSOMATIC_AREA = 3.5e-4
PYRAMIDAL_AREA = DENDRITIC_AREA + AXOSOMATIC_AREA
INTERNEURON_AREA = 2e-4
MONITORED_PYRAMIDAL_COUNT = 50
MONITORED_INTERNEURON_COUNT = 6


@dataclass(frozen=True)
class Population:
    id: str
    label: str
    region: str
    cell_type: str
    filename: str
    id_start: int
    count: int


@dataclass(frozen=True)
class VoltageGroup:
    id: str
    label: str
    region: str
    cell_type: str
    population_id: str
    filename: str
    output_file: str
    local_id_start: int
    count: int


POPULATIONS = (
    Population("pfc-py", "PFC pyramidal", "PFC", "pyramidal", "Spikes_PYc.pkl", 0, 1000),
    Population("pfc-in", "PFC interneurons", "PFC", "interneuron", "Spikes_INc.pkl", 1000, 250),
    Population("ca3-py", "CA3 pyramidal", "CA3", "pyramidal", "Spikes_PY3.pkl", 1250, 1000),
    Population("ca3-in", "CA3 interneurons", "CA3", "interneuron", "Spikes_IN3.pkl", 2250, 100),
    Population("ca1-py", "CA1 pyramidal", "CA1", "pyramidal", "Spikes_PY1.pkl", 2350, 1000),
    Population("ca1-in", "CA1 interneurons", "CA1", "interneuron", "Spikes_IN1.pkl", 3350, 100),
)

VOLTAGE_GROUPS = (
    VoltageGroup("ca1-py", "CA1 pyramidal voltage", "CA1", "pyramidal", "ca1-py", "Vs_p1.npy", "voltage-ca1-pyramidal.bin", 550, 50),
    VoltageGroup("ca1-in", "CA1 interneuron voltage", "CA1", "interneuron", "ca1-in", "Vs_i1.npy", "voltage-ca1-interneuron.bin", 54, 6),
    VoltageGroup("ca3-py", "CA3 pyramidal voltage", "CA3", "pyramidal", "ca3-py", "Vs_p3.npy", "voltage-ca3-pyramidal.bin", 550, 50),
    VoltageGroup("ca3-in", "CA3 interneuron voltage", "CA3", "interneuron", "ca3-in", "Vs_i3.npy", "voltage-ca3-interneuron.bin", 54, 6),
)

CURRENT_CHANNELS = (
    {"id": "ca1-somatic", "label": "CA1 somatic", "unit": "arbitrary model-current units"},
    {"id": "ca3-schaffer-to-ca1", "label": "CA3 Schaffer input to CA1", "unit": "arbitrary model-current units"},
    {"id": "pfc-to-ca1", "label": "PFC input to CA1", "unit": "arbitrary model-current units"},
)


def _load_population(path: Path, population: Population) -> tuple[np.ndarray, np.ndarray]:
    # Pickle is intentionally confined to this offline, trusted-data conversion step.
    with path.open("rb") as handle:
        spike_trains = pickle.load(handle)

    if not isinstance(spike_trains, dict):
        raise ValueError(f"{path.name}: expected a dictionary of spike trains")

    expected_keys = set(range(population.count))
    actual_keys = {int(key) for key in spike_trains}
    if actual_keys != expected_keys:
        missing = sorted(expected_keys - actual_keys)[:5]
        extra = sorted(actual_keys - expected_keys)[:5]
        raise ValueError(f"{path.name}: neuron keys do not match population (missing={missing}, extra={extra})")

    time_chunks: list[np.ndarray] = []
    id_chunks: list[np.ndarray] = []
    tolerance_ms = 1e-6

    for local_id in range(population.count):
        values = np.asarray(spike_trains[local_id], dtype=np.float64)
        if values.ndim != 1:
            raise ValueError(f"{path.name}: neuron {local_id} spike train is not one-dimensional")
        if values.size == 0:
            continue
        if not np.isfinite(values).all():
            raise ValueError(f"{path.name}: neuron {local_id} contains a non-finite timestamp")
        if np.any(np.diff(values) < 0):
            raise ValueError(f"{path.name}: neuron {local_id} timestamps are not monotonic")
        if values[0] < 0 or values[-1] > DURATION_MS + tolerance_ms:
            raise ValueError(f"{path.name}: neuron {local_id} contains an out-of-range timestamp")

        ticks = np.rint(values / TICK_MS)
        if np.max(np.abs(values - ticks * TICK_MS)) > tolerance_ms:
            raise ValueError(f"{path.name}: neuron {local_id} timestamp is not aligned to {TICK_MS} ms")

        time_chunks.append(ticks.astype("<u4"))
        id_chunks.append(np.full(values.size, population.id_start + local_id, dtype="<u2"))

    if not time_chunks:
        return np.empty(0, dtype="<u4"), np.empty(0, dtype="<u2")
    return np.concatenate(time_chunks), np.concatenate(id_chunks)


def _load_series(input_dir: Path, filename: str) -> np.ndarray:
    path = input_dir / filename
    if not path.is_file():
        raise FileNotFoundError(f"Missing required signal file: {path}")
    values = np.asarray(np.load(path), dtype=np.float64)
    if values.shape != (EXPECTED_SIGNAL_SAMPLES,):
        raise ValueError(f"{filename}: expected {EXPECTED_SIGNAL_SAMPLES} samples, got {values.shape}")
    if not np.isfinite(values).all():
        raise ValueError(f"{filename}: contains non-finite samples")
    return values


def derive_current_channels(input_dir: Path) -> np.ndarray:
    """Return somatic, Schaffer, and PFC-to-CA1 currents at 1 kHz."""
    pyramidal_weight = MONITORED_PYRAMIDAL_COUNT * (1e3 * PYRAMIDAL_AREA)
    interneuron_weight = MONITORED_INTERNEURON_COUNT * (1e3 * INTERNEURON_AREA)

    somatic = (
        _load_series(input_dir, "II.npy") * interneuron_weight
        + _load_series(input_dir, "IP.npy") * pyramidal_weight
        + _load_series(input_dir, "PI.npy") * interneuron_weight
    )
    schaffer = (
        _load_series(input_dir, "PISC.npy") * interneuron_weight
        + _load_series(input_dir, "PPSC.npy") * pyramidal_weight
    )
    pfc = (
        _load_series(input_dir, "PIPFC.npy") * interneuron_weight
        + _load_series(input_dir, "PPPFC.npy") * pyramidal_weight
    )
    return np.stack((somatic, schaffer, pfc))


def _gaussian_smooth(values: np.ndarray, sigma_bins: float) -> np.ndarray:
    if sigma_bins <= 0:
        return values.astype(np.float64, copy=True)
    radius = max(1, int(math.ceil(4 * sigma_bins)))
    offsets = np.arange(-radius, radius + 1, dtype=np.float64)
    kernel = np.exp(-0.5 * np.square(offsets / sigma_bins))
    kernel /= kernel.sum()
    padded = np.pad(values, radius, mode="reflect")
    return np.convolve(padded, kernel, mode="valid")


def calculate_population_rates(times: np.ndarray, neuron_ids: np.ndarray) -> np.ndarray:
    """Return six population rates in spikes/neuron/second at 100 Hz."""
    sample_count = int(DURATION_MS / RATE_BIN_MS)
    bin_indices = np.floor(times.astype(np.float64) * TICK_MS / RATE_BIN_MS).astype(np.int64)
    bin_indices = np.clip(bin_indices, 0, sample_count - 1)
    sigma_bins = RATE_SMOOTHING_SIGMA_MS / RATE_BIN_MS
    channels = []
    for population in POPULATIONS:
        mask = (neuron_ids >= population.id_start) & (neuron_ids < population.id_start + population.count)
        counts = np.bincount(bin_indices[mask], minlength=sample_count).astype(np.float64)
        raw_rate = counts / population.count / (RATE_BIN_MS / 1_000)
        channels.append(_gaussian_smooth(raw_rate, sigma_bins))
    return np.stack(channels)


def encode_signal_group(channels: np.ndarray) -> bytes:
    values = np.asarray(channels)
    if values.ndim != 2 or values.shape[0] == 0 or values.shape[1] == 0:
        raise ValueError("Signal groups must be a non-empty channel-by-sample matrix")
    if not np.isfinite(values).all():
        raise ValueError("Signal group contains non-finite samples")
    channel_count, sample_count = values.shape
    samples = np.asarray(values, dtype="<f4", order="C")
    return struct.pack("<4sII", SIGNAL_MAGIC, channel_count, sample_count) + samples.tobytes(order="C")


def _write_signal_group(output_dir: Path, filename: str, channels: np.ndarray) -> str:
    payload = encode_signal_group(channels)
    (output_dir / filename).write_bytes(payload)
    return hashlib.sha256(payload).hexdigest()


def _load_detector(module_path: Path) -> Callable[..., object]:
    if not module_path.is_file():
        raise FileNotFoundError(f"Missing detector module: {module_path}")
    spec = importlib.util.spec_from_file_location("spwr_ripple_detection", module_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load detector module: {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    detector = getattr(module, "SWR", None)
    if not callable(detector):
        raise AttributeError(f"{module_path}: does not define callable SWR")
    return detector


def normalize_detector_result(result: object) -> tuple[np.ndarray, np.ndarray]:
    """Normalize ripple_detection.SWR's tuple/list empty-result variants."""
    if isinstance(result, list) and len(result) == 0:
        return np.empty((0, 2), dtype=np.int64), np.empty(0, dtype=np.float64)
    if not isinstance(result, tuple) or len(result) != 2:
        raise ValueError("SWR detector returned an unexpected result")
    intervals = np.asarray(result[0], dtype=np.int64)
    powers = np.asarray(result[1], dtype=np.float64)
    if intervals.size == 0:
        return np.empty((0, 2), dtype=np.int64), np.empty(0, dtype=np.float64)
    if intervals.ndim != 2 or intervals.shape[1] != 2 or powers.shape != (intervals.shape[0],):
        raise ValueError("SWR detector returned malformed intervals or powers")
    if np.any(intervals < 0) or np.any(intervals[:, 1] < intervals[:, 0]):
        raise ValueError("SWR detector returned invalid event bounds")
    if np.any(intervals[:, 1] > EXPECTED_SIGNAL_SAMPLES) or not np.isfinite(powers).all():
        raise ValueError("SWR detector returned out-of-range data")
    return intervals, powers


def detect_events(somatic_current: np.ndarray, detector: Callable[..., object]) -> tuple[np.ndarray, np.ndarray]:
    try:
        result = detector(somatic_current, CURRENT_SAMPLE_RATE_HZ)
    except IndexError:
        # The existing detector indexes start[0]/stop[0] before its empty-result check.
        result = []
    return normalize_detector_result(result)


def _export_voltage_groups(input_dir: Path, output_dir: Path) -> list[dict[str, object]]:
    populations = {population.id: population for population in POPULATIONS}
    descriptors: list[dict[str, object]] = []
    for group in VOLTAGE_GROUPS:
        path = input_dir / group.filename
        if not path.is_file():
            raise FileNotFoundError(f"Missing required voltage file: {path}")
        values = np.asarray(np.load(path), dtype=np.float64)
        expected_shape = (group.count, EXPECTED_SIGNAL_SAMPLES)
        if values.shape != expected_shape:
            raise ValueError(f"{group.filename}: expected shape {expected_shape}, got {values.shape}")
        if not np.isfinite(values).all():
            raise ValueError(f"{group.filename}: contains non-finite samples")
        population = populations[group.population_id]
        local_ids = list(range(group.local_id_start, group.local_id_start + group.count))
        neuron_ids = [population.id_start + local_id for local_id in local_ids]
        digest = _write_signal_group(output_dir, group.output_file, values)
        descriptors.append(
            {
                "id": group.id,
                "label": group.label,
                "file": group.output_file,
                "encoding": "NSG2:u32-channel-count+u32-sample-count+f32-channel-major:little-endian",
                "sampleRateHz": CURRENT_SAMPLE_RATE_HZ,
                "sampleCount": EXPECTED_SIGNAL_SAMPLES,
                "channelCount": group.count,
                "channelOrder": neuron_ids,
                "localNeuronIds": local_ids,
                "populationId": group.population_id,
                "region": group.region,
                "cellType": group.cell_type,
                "unit": "mV",
                "semanticRole": "membrane-voltage",
                "sha256": digest,
            }
        )
    return descriptors


def _copy_connectivity_bundle(input_dir: Path, output_dir: Path, run_id: str, seed: int) -> dict[str, object] | None:
    """Copy only an exact live-synapse export matching this run and seed."""
    source_dir = input_dir / "connectivity"
    index_path = source_dir / CONNECTIVITY_INDEX
    if not index_path.is_file():
        return None
    document = json.loads(index_path.read_text(encoding="utf-8"))
    if document.get("schemaVersion") != 1 or document.get("provenance") != "live-brian2-synapses":
        raise ValueError("Connectivity bundle has unsupported schema or provenance")
    if document.get("runId") != run_id:
        raise ValueError(f"Connectivity run ID {document.get('runId')!r} does not match {run_id!r}")
    if document.get("seed") != seed:
        raise ValueError(f"Connectivity seed {document.get('seed')!r} does not match seed {seed}")
    projections = document.get("projections")
    if not isinstance(projections, list):
        raise ValueError("Connectivity bundle is missing projection descriptors")

    destination = output_dir / "connectivity"
    destination.mkdir(parents=True, exist_ok=True)
    for projection in projections:
        if not isinstance(projection, dict) or not isinstance(projection.get("file"), str):
            raise ValueError("Connectivity bundle contains an invalid projection")
        source_file = source_dir / projection["file"]
        if not source_file.is_file() or source_file.parent.resolve() != source_dir.resolve():
            raise ValueError(f"Connectivity projection file is missing: {source_file}")
        payload = source_file.read_bytes()
        if hashlib.sha256(payload).hexdigest() != projection.get("sha256"):
            raise ValueError(f"Connectivity checksum mismatch: {source_file.name}")
        (destination / source_file.name).write_bytes(payload)
    shutil.copyfile(index_path, destination / CONNECTIVITY_INDEX)
    return {
        "schemaVersion": 1,
        "runId": run_id,
        "seed": seed,
        "provenance": "live-brian2-synapses",
        "indexFile": f"connectivity/{CONNECTIVITY_INDEX}",
        "projections": [
            {**projection, "file": f"connectivity/{projection['file']}"}
            for projection in projections
        ],
    }


def export_run(
    input_dir: Path,
    output_dir: Path,
    run_id: str,
    label: str,
    condition_category: str,
    seed: int,
    detector: Callable[..., object],
) -> dict[str, object]:
    all_times: list[np.ndarray] = []
    all_ids: list[np.ndarray] = []
    population_counts: dict[str, int] = {}

    for population in POPULATIONS:
        source = input_dir / population.filename
        if not source.is_file():
            raise FileNotFoundError(f"Missing required spike file: {source}")
        times, neuron_ids = _load_population(source, population)
        all_times.append(times)
        all_ids.append(neuron_ids)
        population_counts[population.id] = int(times.size)

    times = np.concatenate(all_times)
    neuron_ids = np.concatenate(all_ids)
    order = np.argsort(times, kind="stable")
    times = times[order]
    neuron_ids = neuron_ids[order]

    spike_payload = SPIKE_MAGIC + struct.pack("<I", int(times.size)) + times.tobytes() + neuron_ids.tobytes()
    spike_digest = hashlib.sha256(spike_payload).hexdigest()

    currents = derive_current_channels(input_dir)
    rates = calculate_population_rates(times, neuron_ids)
    event_intervals, event_powers = detect_events(currents[0], detector)

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "spikes.bin").write_bytes(spike_payload)
    current_digest = _write_signal_group(output_dir, "currents.bin", currents)
    rate_digest = _write_signal_group(output_dir, "population-rates.bin", rates)
    voltage_groups = _export_voltage_groups(input_dir, output_dir)
    connectivity = _copy_connectivity_bundle(input_dir, output_dir, run_id, seed)

    events = [
        {
            "startSample": int(interval[0]),
            "endSample": int(interval[1]),
            "startMs": float(interval[0] * 1_000 / CURRENT_SAMPLE_RATE_HZ),
            "endMs": float(interval[1] * 1_000 / CURRENT_SAMPLE_RATE_HZ),
            "normalizedPeakPower": float(power),
        }
        for interval, power in zip(event_intervals, event_powers)
    ]
    event_document = {
        "schemaVersion": 1,
        "detector": {
            "name": "ripple_detection.SWR",
            "sampleRateHz": CURRENT_SAMPLE_RATE_HZ,
            "thresholdStandardDeviations": 2,
            "peakThresholdStandardDeviations": 3,
            "inputChannel": "ca1-somatic",
        },
        "events": events,
    }
    (output_dir / "events.json").write_text(json.dumps(event_document, indent=2) + "\n", encoding="utf-8")

    rate_channels = [
        {"id": population.id, "label": population.label, "unit": "spikes/neuron/second"}
        for population in POPULATIONS
    ]
    manifest: dict[str, object] = {
        "schemaVersion": SCHEMA_VERSION,
        "runId": run_id,
        "label": label,
        "durationMs": int(DURATION_MS),
        "tickMs": TICK_MS,
        "neuronCount": sum(population.count for population in POPULATIONS),
        "eventCount": int(times.size),
        "spikeFile": "spikes.bin",
        "spikeEncoding": "NSV1:u32-ticks+u16-neuron-id:little-endian",
        "sha256": spike_digest,
        "condition": {"category": condition_category, "seed": seed},
        "populations": [
            {
                "id": population.id,
                "label": population.label,
                "region": population.region,
                "cellType": population.cell_type,
                "idStart": population.id_start,
                "count": population.count,
                "eventCount": population_counts[population.id],
            }
            for population in POPULATIONS
        ],
        "signalGroups": [
            {
                "id": "currents",
                "file": "currents.bin",
                "encoding": "NSG2:u32-channel-count+u32-sample-count+f32-channel-major:little-endian",
                "sampleRateHz": CURRENT_SAMPLE_RATE_HZ,
                "sampleCount": EXPECTED_SIGNAL_SAMPLES,
                "channelCount": len(CURRENT_CHANNELS),
                "channelOrder": [channel["id"] for channel in CURRENT_CHANNELS],
                "channels": list(CURRENT_CHANNELS),
                "semanticRole": "model-current",
                "sha256": current_digest,
            },
            {
                "id": "population-rates",
                "file": "population-rates.bin",
                "encoding": "NSG2:u32-channel-count+u32-sample-count+f32-channel-major:little-endian",
                "sampleRateHz": RATE_SAMPLE_RATE_HZ,
                "sampleCount": int(DURATION_MS / RATE_BIN_MS),
                "channelCount": len(rate_channels),
                "channelOrder": [channel["id"] for channel in rate_channels],
                "channels": rate_channels,
                "semanticRole": "population-firing-rate",
                "binMs": RATE_BIN_MS,
                "smoothing": {"kernel": "gaussian", "sigmaMs": RATE_SMOOTHING_SIGMA_MS},
                "sha256": rate_digest,
            },
        ],
        "events": {
            "file": "events.json",
            "count": len(events),
            "sampleRateHz": CURRENT_SAMPLE_RATE_HZ,
            "semanticRole": "spwr-detections",
        },
        "voltageGroups": voltage_groups,
    }
    if connectivity is not None:
        manifest["connectivity"] = connectivity

    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Directory containing the trusted run files")
    parser.add_argument("--output", required=True, type=Path, help="Destination directory for web assets")
    parser.add_argument("--run-id", required=True, help="Stable public run identifier")
    parser.add_argument("--label", required=True, help="User-facing run label")
    parser.add_argument("--condition", required=True, help="Condition category")
    parser.add_argument("--seed", type=int, default=0, help="Simulation seed")
    parser.add_argument("--detector-module", required=True, type=Path, help="Path to the trusted ripple_detection.py module")
    args = parser.parse_args()

    detector = _load_detector(args.detector_module.resolve())
    manifest = export_run(
        args.input.resolve(),
        args.output.resolve(),
        args.run_id,
        args.label,
        args.condition,
        args.seed,
        detector,
    )
    print(
        f"Exported {manifest['eventCount']:,} spikes and {manifest['events']['count']} SPW-R events "
        f"from {manifest['neuronCount']:,} neurons to {args.output.resolve()}"
    )


if __name__ == "__main__":
    main()
