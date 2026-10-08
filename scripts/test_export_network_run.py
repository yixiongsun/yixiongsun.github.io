from __future__ import annotations

import json
import pickle
import struct
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import export_network_run as exporter
import export_brian_connectivity as connectivity_exporter


class ExportNetworkRunTests(unittest.TestCase):
    def test_population_validation_and_tick_conversion(self) -> None:
        population = exporter.Population("test", "Test", "T", "pyramidal", "spikes.pkl", 10, 2)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / population.filename
            with path.open("wb") as handle:
                pickle.dump({0: np.array([0.05, 0.15]), 1: np.array([0.10])}, handle)
            ticks, ids = exporter._load_population(path, population)
        np.testing.assert_array_equal(ticks, np.array([1, 3, 2], dtype="<u4"))
        np.testing.assert_array_equal(ids, np.array([10, 10, 11], dtype="<u2"))

    def test_rejects_noncontiguous_neuron_keys(self) -> None:
        population = exporter.Population("test", "Test", "T", "pyramidal", "spikes.pkl", 0, 2)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / population.filename
            with path.open("wb") as handle:
                pickle.dump({0: np.array([]), 2: np.array([])}, handle)
            with self.assertRaisesRegex(ValueError, "neuron keys"):
                exporter._load_population(path, population)

    def test_current_formulas(self) -> None:
        values = {
            "II.npy": np.array([1.0, 2.0, 3.0]),
            "IP.npy": np.array([4.0, 5.0, 6.0]),
            "PI.npy": np.array([7.0, 8.0, 9.0]),
            "PISC.npy": np.array([10.0, 11.0, 12.0]),
            "PPSC.npy": np.array([13.0, 14.0, 15.0]),
            "PIPFC.npy": np.array([16.0, 17.0, 18.0]),
            "PPPFC.npy": np.array([19.0, 20.0, 21.0]),
        }
        with tempfile.TemporaryDirectory() as temp, mock.patch.object(exporter, "EXPECTED_SIGNAL_SAMPLES", 3):
            root = Path(temp)
            for filename, samples in values.items():
                np.save(root / filename, samples)
            currents = exporter.derive_current_channels(root)

        py_weight = 50 * 1e3 * (1.5e-4 + 3.5e-4)
        in_weight = 6 * 1e3 * 2e-4
        np.testing.assert_allclose(currents[0], values["II.npy"] * in_weight + values["IP.npy"] * py_weight + values["PI.npy"] * in_weight)
        np.testing.assert_allclose(currents[1], values["PISC.npy"] * in_weight + values["PPSC.npy"] * py_weight)
        np.testing.assert_allclose(currents[2], values["PIPFC.npy"] * in_weight + values["PPPFC.npy"] * py_weight)

    def test_population_rate_units_and_smoothing(self) -> None:
        population = exporter.Population("test", "Test", "T", "pyramidal", "spikes.pkl", 0, 2)
        # One spike per 10 ms bin across a two-neuron population is 50 spikes/neuron/second.
        times = np.array([0, 200, 400, 600], dtype="<u4")
        neuron_ids = np.zeros(4, dtype="<u2")
        with mock.patch.object(exporter, "DURATION_MS", 40.0), mock.patch.object(exporter, "POPULATIONS", (population,)):
            rates = exporter.calculate_population_rates(times, neuron_ids)
        self.assertEqual(rates.shape, (1, 4))
        np.testing.assert_allclose(rates[0], np.full(4, 50.0))

    def test_signal_binary_header_and_channel_major_layout(self) -> None:
        channels = np.array([[1.0, 2.0], [3.0, 4.0]])
        payload = exporter.encode_signal_group(channels)
        self.assertEqual(payload[:4], b"NSG2")
        self.assertEqual(struct.unpack_from("<II", payload, 4), (2, 2))
        np.testing.assert_array_equal(np.frombuffer(payload, dtype="<f4", offset=12), [1, 2, 3, 4])

    def test_voltage_mapping_uses_global_and_local_neuron_ids(self) -> None:
        population = exporter.Population("ca1-py", "CA1 pyramidal", "CA1", "pyramidal", "spikes.pkl", 2350, 1000)
        group = exporter.VoltageGroup("ca1-py", "CA1 voltage", "CA1", "pyramidal", "ca1-py", "voltage.npy", "voltage.bin", 550, 2)
        with tempfile.TemporaryDirectory() as source_temp, tempfile.TemporaryDirectory() as output_temp:
            source = Path(source_temp)
            np.save(source / "voltage.npy", np.arange(6).reshape(2, 3))
            with mock.patch.object(exporter, "POPULATIONS", (population,)), mock.patch.object(exporter, "VOLTAGE_GROUPS", (group,)), mock.patch.object(exporter, "EXPECTED_SIGNAL_SAMPLES", 3):
                descriptors = exporter._export_voltage_groups(source, Path(output_temp))
        self.assertEqual(descriptors[0]["localNeuronIds"], [550, 551])
        self.assertEqual(descriptors[0]["channelOrder"], [2900, 2901])

    def test_detector_empty_results_are_normalized(self) -> None:
        intervals, powers = exporter.normalize_detector_result([])
        self.assertEqual(intervals.shape, (0, 2))
        self.assertEqual(powers.shape, (0,))

        def raises_index_error(_values: np.ndarray, _sample_rate: int) -> object:
            raise IndexError("existing detector empty-result behavior")

        intervals, powers = exporter.detect_events(np.zeros(100), raises_index_error)
        self.assertEqual(intervals.shape, (0, 2))
        self.assertEqual(powers.shape, (0,))

    def test_spike_binary_header_layout_is_preserved(self) -> None:
        times = np.array([1, 2], dtype="<u4")
        ids = np.array([3, 4], dtype="<u2")
        payload = exporter.SPIKE_MAGIC + struct.pack("<I", 2) + times.tobytes() + ids.tobytes()
        self.assertEqual(payload[:4], b"NSV1")
        self.assertEqual(struct.unpack_from("<I", payload, 4)[0], 2)
        self.assertEqual(len(payload), 20)

    def test_connectivity_export_filters_dense_zero_weight_placeholders(self) -> None:
        class Values:
            def __init__(self, values: list[float]) -> None:
                self.values = np.asarray(values)

            def __getitem__(self, _key: object) -> np.ndarray:
                return self.values

        class Synapses:
            i = Values([0, 0, 1])
            j = Values([0, 1, 1])
            w = Values([0.0, 2.5, -1.0])
            delay = Values([0.0, 3.0, 4.0])

        projection = connectivity_exporter.ProjectionExport(
            "test-projection", "Test projection", Synapses(), 10, 20, "source", "target", "excitatory"
        )
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            index = connectivity_exporter.export_connectivity_bundle(output, "run_sv7", 7, [projection])
            payload = (output / "test-projection.bin").read_bytes()
        self.assertEqual(index["runId"], "run_sv7")
        self.assertEqual(index["seed"], 7)
        self.assertEqual(index["projections"][0]["edgeCount"], 2)
        self.assertEqual(payload[:4], b"NCX1")
        self.assertEqual(struct.unpack_from("<I", payload, 4)[0], 2)
        np.testing.assert_array_equal(np.frombuffer(payload, dtype="<u2", count=2, offset=8), [10, 11])
        np.testing.assert_array_equal(np.frombuffer(payload, dtype="<u2", count=2, offset=12), [21, 21])

    def test_connectivity_bundle_must_match_run_and_seed(self) -> None:
        document = {
            "schemaVersion": 1,
            "runId": "run_sv1",
            "seed": 1,
            "provenance": "live-brian2-synapses",
            "projections": [],
        }
        with tempfile.TemporaryDirectory() as source_temp, tempfile.TemporaryDirectory() as output_temp:
            source = Path(source_temp)
            bundle = source / "connectivity"
            bundle.mkdir()
            (bundle / "connectivity.json").write_text(json.dumps(document), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "seed"):
                exporter._copy_connectivity_bundle(source, Path(output_temp), "run_sv1", 2)


class LocalIntegrationTests(unittest.TestCase):
    source_root = Path(r"F:\ModelingAnalysis\PFC-HPC\final_run_v2")
    detector_module = Path(r"F:\ModelingAnalysis\ripple_detection.py")

    @unittest.skipUnless(source_root.is_dir() and detector_module.is_file(), "local simulation outputs are unavailable")
    def test_seed_zero_signal_lengths_and_event_counts(self) -> None:
        detector = exporter._load_detector(self.detector_module)
        expected_counts = {"default_sv0": 26, "exp_25%_150_sv0": 33}
        for run_id, expected_count in expected_counts.items():
            currents = exporter.derive_current_channels(self.source_root / run_id)
            self.assertEqual(currents.shape, (3, 30_000))
            intervals, powers = exporter.detect_events(currents[0], detector)
            self.assertEqual(len(intervals), expected_count)
            self.assertEqual(len(powers), expected_count)


if __name__ == "__main__":
    unittest.main()
