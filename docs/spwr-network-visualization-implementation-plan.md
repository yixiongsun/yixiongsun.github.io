# Expanded SPW R Network Visualization Implementation Plan

## Summary

Create `docs/spwr-network-visualization-implementation-plan.md` as the maintainable engineering specification for evolving the current replay into a scientifically grounded analysis interface.

The roadmap will add synchronized continuous signals, existing SPW-R detections, population activity, neuron inspection, baseline-versus-experience comparison, and selected-neuron connectivity. Scientific framing will follow the modeling methods and results described in `C:\Users\sunab\Downloads\CommitteeReport5Final.docx` and the current signal calculations in `F:\ModelingAnalysis\utils.py`.

Video export is excluded. The product remains an interactive website.

## Implementation Phases

### 1 Data Export and Schema Version 2

Extend the offline exporter without moving trusted pickle or NumPy loading into the browser.

- Preserve the existing spike-event payload and neuron IDs.
- Derive three separate 1 kHz CA1 current channels:
  - Somatic current from `II.npy`, `IP.npy`, and `PI.npy`.
  - Schaffer-collateral dendritic current from `PISC.npy` and `PPSC.npy`.
  - PFC-to-CA1 dendritic input from `PIPFC.npy` and `PPPFC.npy`, using the same cell-count and compartment-area weighting as the Schaffer calculation.
- Label all three as model-current arbitrary units. Do not present them as measured voltage or silently combine them.
- Store currents as channel-major little-endian Float32 data with a small versioned header. Three 30-second channels require approximately 360 KB.
- Generate six population firing-rate channels from the exported spikes:
  - PFC pyramidal and interneuron.
  - CA3 pyramidal and interneuron.
  - CA1 pyramidal and interneuron.
- Use 10 ms bins, convert counts to spikes per neuron per second, and smooth with a 20 ms Gaussian kernel. Export these at 100 Hz in a separate binary group.
- Call the existing `ripple_detection.SWR` function offline on the somatic-current trace at 1 kHz. Export its start sample, end sample, and normalized peak power without reimplementing detection in TypeScript.
- Normalize the detector’s empty-result behavior in the exporter while leaving filtering and thresholds unchanged.
- Add lazy voltage groups for the existing monitors:
  - CA1 and CA3 pyramidal neurons 550–599.
  - CA1 and CA3 interneurons 54–59.
  - Store each population in a separate Float32 file so selecting one neuron does not download every voltage trace.
- Add a run catalog initially containing:
  - `default_sv0` as Baseline.
  - `exp_25%_150_sv0` as Experience strengthened.
- Make the browser parser accept both schema versions. Version 1 remains a spike-only replay; version 2 enables signals, events, rates, and voltage metadata.

### 2 Synchronized Current and SPW R Viewer

Add a signal panel directly beneath the existing neuron canvas.

- Render three vertically stacked raw-current traces with independent, fixed y-axes:
  - CA1 somatic.
  - CA3 Schaffer input to CA1.
  - PFC input to CA1.
- Use a two-second rolling window by default, with 0.5, 1, 2, and 5 second choices.
- Add a thin 30-second overview showing the visible window, simulation playhead, and SPW-R locations.
- Use min/max-per-pixel downsampling so narrow peaks remain visible at any canvas width.
- Use one playback state for neuron animation, current traces, rate strips, overview, and timeline. Scrubbing or restarting updates every view in the same frame.
- Shade SPW-R intervals in the somatic trace and overview.
- Add previous event, next event, and focus event controls.
- Focus mode seeks to 250 ms before event onset, plays at 0.25× through 250 ms after event offset, then pauses and restores the prior playback speed.
- Display event number, onset, duration, and normalized peak power.
- If a run contains no detected events, disable event navigation while leaving ordinary playback functional.
- Preserve the triangle/circle cell encoding and animated interspersed/separated layout.
- Respect reduced-motion settings by disabling layout interpolation and event-focus animation while preserving state changes.

### 3 Population Activity and Neuron Inspection

Add six compact firing-rate strips aligned to the current panel and playhead.

- Keep regional colors consistent with the neuron canvas.
- Distinguish pyramidal and interneuron traces through solid versus outlined/dashed styling.
- Allow the rate section to collapse without changing playback state.

Enable neuron selection from either network layout.

- Show neuron ID, region, cell type, population-local ID, and spike count.
- Show a full-recording spike history plus an expanded view of spikes within the active rolling window.
- For monitored CA1/CA3 neurons, lazy-load and display membrane voltage synchronized to the shared playhead.
- For all other neurons, explicitly show that voltage was not recorded; never synthesize or interpolate it.
- Keep selected-neuron identity stable when switching layouts.

### 4 Baseline Versus Experience Comparison

Implement the first comparison using `default_sv0` and `exp_25%_150_sv0`.

- Use side-by-side network panels on desktop and vertically stacked panels on narrow screens.
- Retain one shared control bar, playback speed, rolling-window duration, and population visibility state.
- Default to linked absolute simulation time.
- Give each condition its own current and population-rate channels while using shared per-channel y-domains calculated from the union of both runs. This preserves meaningful amplitude comparisons.
- Add event-aligned mode:
  - Let the user choose one SPW-R from each condition.
  - Rebase both displays to event onset at time zero.
  - Show a default window from −500 to +500 ms.
  - Preserve each condition’s actual underlying simulation time internally.
- Present the detected baseline and experience event counts as run metadata, not as a statistical conclusion.
- Keep the run catalog extensible for later excess-glutamate, glutamate-plus-experience, interneuron-dysfunction, and treatment runs.

### 5 Selected Connectivity and Synaptic Transmission

Treat exact connectivity as a late phase requiring new Brian2 exports.

- Update the simulation-side export to save source ID, target ID, projection name, synapse type, weight, and delay directly from constructed synapse objects.
- Do not reconstruct exact connectivity from random seeds after a run has completed.
- Store connectivity by projection and load it only after neuron selection.
- Display only one-hop incoming or outgoing connections for the selected neuron.
- Provide filters for projection, excitatory/inhibitory type, direction, and strongest weights.
- Cap the visible edge set at 200 by default and disclose when filtering or truncation is active.
- Animate a pulse only when a displayed presynaptic neuron spikes, using the exported delay to determine postsynaptic arrival.
- Continue to use population-level labels rather than rendering the complete synaptic graph.

## Interfaces and Data Contracts

- `manifest.json` advances to schema version 2 and gains optional signal groups, event metadata, voltage mappings, and condition metadata.
- Binary signal groups use:
  - Four-byte magic identifier.
  - Unsigned channel count.
  - Unsigned sample count.
  - Channel-major Float32 samples.
- Each signal-group descriptor specifies file, sample rate, channel order, labels, units, and semantic role.
- `events.json` contains detector provenance plus ordered SPW-R records with start, end, and normalized peak power.
- `runs.json` provides stable run IDs, user-facing labels, condition category, seed, and manifest URL.
- All timestamps exposed to the UI use milliseconds. Sample indices remain available for exact signal lookup.
- Failed optional signal loads degrade to spike-only replay with an inline error; malformed spikes or core manifest data remain fatal.

## Testing and Acceptance

- Add Python tests for each current formula, population-rate calculation, Float32 encoding, voltage-ID mapping, and detector result normalization.
- Add a local integration smoke test against the two seed-0 folders:
  - 30,000 samples per current channel.
  - 30-second duration at 1 kHz.
  - Existing detector yields 26 baseline and 33 experience events unless the upstream detector or source data intentionally changes.
- Add TypeScript tests for schema versions 1 and 2, signal headers, malformed lengths, optional data, and event ordering.
- Add browser tests covering playback, scrubbing, trace-window changes, event navigation, focus mode, layout transitions, neuron selection, voltage availability, and both comparison alignment modes.
- Verify that all visual layers remain synchronized within one 1 ms signal sample after seek and during playback.
- Verify fixed y-domains do not change as the rolling window moves.
- Test desktop, mobile, reduced-motion, keyboard navigation, and loss of optional files.
- Performance target: smooth playback at 60 fps on a typical desktop and at least 30 fps on a representative mobile viewport with all three currents and six rates enabled.

## Assumptions and Defaults

- The plan document is repository Markdown at `docs/spwr-network-visualization-implementation-plan.md`.
- Current traces remain separate; no combined LFP channel is shown.
- The somatic-current proxy is the sole input to the existing SPW-R detector.
- Raw amplitudes are displayed using fixed independent axes and labeled as arbitrary model-current units.
- Baseline versus experience is the first implemented comparison.
- Exact connectivity requires new simulation output and is not available for existing run folders.
- PFC input means the PFC-to-CA1 dendritic current contribution, not a PFC-recorded LFP.
- The website remains interactive-only; pre-rendered video support is out of scope.
