# Exact Brian2 connectivity export

Connectivity must be exported by the simulation process while its constructed `Synapses` objects are live. A run seed is provenance, not a reconstruction recipe: do not create these files by reseeding a separate script after a run.

After `net.run(...)` has completed (so standalone values are available), after every condition-specific weight modification, and before `device.delete()`, import `ProjectionExport` and `export_connectivity_bundle` from `scripts/export_brian_connectivity.py`. Pass the exact public run ID and the same `sv` used by the simulation:

```python
from brian2 import ms
from export_brian_connectivity import ProjectionExport, export_connectivity_bundle

projection = lambda id, label, synapses, source_offset, target_offset, source_population, target_population, synapse_type: ProjectionExport(
    id=id,
    label=label,
    synapses=synapses,
    source_offset=source_offset,
    target_offset=target_offset,
    source_population_id=source_population,
    target_population_id=target_population,
    synapse_type=synapse_type,
    weight_unit_label="dimensionless model weight",
    delay_unit=ms,
)

export_connectivity_bundle(
    Path(output_directory) / "connectivity",
    run_id,
    sv,
    [
        projection("pfc-py-py", "PFC pyramidal → pyramidal", CPPc, 0, 0, "pfc-py", "pfc-py", "excitatory"),
        projection("pfc-py-in", "PFC pyramidal → interneuron", CPIc, 0, 1000, "pfc-py", "pfc-in", "excitatory"),
        projection("pfc-in-py", "PFC interneuron → pyramidal", CIPc, 1000, 0, "pfc-in", "pfc-py", "inhibitory"),
        projection("pfc-in-in", "PFC interneuron → interneuron", CIIc, 1000, 1000, "pfc-in", "pfc-in", "inhibitory"),
        projection("ca3-py-py", "CA3 pyramidal → pyramidal", CPP3, 1250, 1250, "ca3-py", "ca3-py", "excitatory"),
        projection("ca3-py-in", "CA3 pyramidal → interneuron", CPI3, 1250, 2250, "ca3-py", "ca3-in", "excitatory"),
        projection("ca3-in-py", "CA3 interneuron → pyramidal", CIP3, 2250, 1250, "ca3-in", "ca3-py", "inhibitory"),
        projection("ca1-py-in", "CA1 pyramidal → interneuron", CPI1, 2350, 3350, "ca1-py", "ca1-in", "excitatory"),
        projection("ca1-in-py", "CA1 interneuron → pyramidal", CIP1, 3350, 2350, "ca1-in", "ca1-py", "inhibitory"),
        projection("ca1-in-in", "CA1 interneuron → interneuron", CII1, 3350, 3350, "ca1-in", "ca1-in", "inhibitory"),
        projection("ca3-ca1-py", "Schaffer: CA3 pyramidal → CA1 pyramidal", C31_P, 1250, 2350, "ca3-py", "ca1-py", "excitatory"),
        projection("ca3-ca1-in", "Schaffer: CA3 pyramidal → CA1 interneuron", C31_I, 1250, 3350, "ca3-py", "ca1-in", "excitatory"),
        projection("pfc-ca3-py", "PFC pyramidal → CA3 pyramidal", Cc3_P, 0, 1250, "pfc-py", "ca3-py", "excitatory"),
        projection("pfc-ca3-in", "PFC pyramidal → CA3 interneuron", Cc3_I, 0, 2250, "pfc-py", "ca3-in", "excitatory"),
        projection("pfc-ca1-py", "PFC pyramidal → CA1 pyramidal", Cc1_P, 0, 2350, "pfc-py", "ca1-py", "excitatory"),
        projection("pfc-ca1-in", "PFC pyramidal → CA1 interneuron", Cc1_I, 0, 3350, "pfc-py", "ca1-in", "excitatory"),
    ],
)
```

The normal website exporter detects `<run folder>/connectivity/connectivity.json`, verifies that both `runId` and `seed` match the manifest being created, verifies every projection checksum, and then publishes it. Zero-weight entries from the model's dense `Synapses.connect()` arrays are omitted. Projection files remain separate so the browser can load only those relevant to the selected neuron and direction.
