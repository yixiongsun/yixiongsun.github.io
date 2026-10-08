export interface PopulationDescriptor {
  id: string;
  label: string;
  region: 'PFC' | 'CA3' | 'CA1';
  cellType: 'pyramidal' | 'interneuron';
  idStart: number;
  count: number;
  eventCount: number;
}

export interface SignalChannelDescriptor {
  id: string;
  label: string;
  unit: string;
}

export interface SignalGroupDescriptor {
  id: string;
  file: string;
  encoding: string;
  sampleRateHz: number;
  sampleCount: number;
  channelCount: number;
  channelOrder: string[];
  channels: SignalChannelDescriptor[];
  semanticRole: 'model-current' | 'population-firing-rate';
  sha256?: string;
  binMs?: number;
  smoothing?: { kernel: 'gaussian'; sigmaMs: number };
}

export interface VoltageGroupDescriptor {
  id: string;
  label: string;
  file: string;
  encoding: string;
  sampleRateHz: number;
  sampleCount: number;
  channelCount: number;
  channelOrder: number[];
  localNeuronIds: number[];
  populationId: string;
  region: 'CA3' | 'CA1';
  cellType: 'pyramidal' | 'interneuron';
  unit: 'mV';
  semanticRole: 'membrane-voltage';
  sha256?: string;
}

export type SynapseType = 'excitatory' | 'inhibitory';

export interface ConnectivityProjectionDescriptor {
  id: string;
  label: string;
  file: string;
  edgeCount: number;
  sourcePopulationId: string;
  targetPopulationId: string;
  synapseType: SynapseType;
  weightUnit: string;
  encoding: string;
  sha256?: string;
}

export interface ConnectivityDescriptor {
  schemaVersion: 1;
  runId: string;
  seed: number;
  provenance: 'live-brian2-synapses' | 'synthetic-ui-fixture';
  indexFile: string;
  projections: ConnectivityProjectionDescriptor[];
}

interface SimulationManifestBase {
  runId: string;
  label: string;
  durationMs: number;
  tickMs: number;
  neuronCount: number;
  eventCount: number;
  spikeFile: string;
  spikeEncoding: string;
  sha256: string;
  populations: PopulationDescriptor[];
}

export interface SimulationManifestV1 extends SimulationManifestBase {
  schemaVersion: 1;
}

export interface SimulationManifestV2 extends SimulationManifestBase {
  schemaVersion: 2;
  condition?: { category: string; seed: number };
  signalGroups?: SignalGroupDescriptor[];
  events?: {
    file: string;
    count: number;
    sampleRateHz: number;
    semanticRole: 'spwr-detections';
  };
  voltageGroups?: VoltageGroupDescriptor[];
  connectivity?: ConnectivityDescriptor;
}

export type SimulationManifest = SimulationManifestV1 | SimulationManifestV2;

export interface SpikeDataset {
  times: Uint32Array;
  neuronIds: Uint16Array;
}

export interface SignalDataset {
  channelCount: number;
  sampleCount: number;
  samples: Float32Array;
}

export interface ConnectivityDataset {
  edgeCount: number;
  sourceIds: Uint16Array;
  targetIds: Uint16Array;
  weights: Float32Array;
  delaysMs: Float32Array;
}

export interface SpwrEvent {
  startSample: number;
  endSample: number;
  startMs: number;
  endMs: number;
  normalizedPeakPower: number;
}

export interface EventsDocument {
  schemaVersion: 1;
  detector: {
    name: string;
    sampleRateHz: number;
    thresholdStandardDeviations: number;
    peakThresholdStandardDeviations: number;
    inputChannel: string;
  };
  events: SpwrEvent[];
}

export interface RunCatalog {
  schemaVersion: 1;
  runs: Array<{
    id: string;
    label: string;
    conditionCategory: string;
    seed: number;
    manifestUrl: string;
    spwrEventCount?: number;
  }>;
}

const SPIKE_MAGIC = 'NSV1';
const SIGNAL_MAGIC = 'NSG2';
const CONNECTIVITY_MAGIC = 'NCX1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function validateCoreManifest(manifest: Partial<SimulationManifest>): void {
  if (!Number.isFinite(manifest.durationMs) || Number(manifest.durationMs) <= 0) throw new Error('Invalid simulation duration.');
  if (!Number.isFinite(manifest.tickMs) || Number(manifest.tickMs) <= 0) throw new Error('Invalid simulation timestep.');
  if (!isPositiveInteger(manifest.neuronCount)) throw new Error('Invalid neuron count.');
  if (!Number.isInteger(manifest.eventCount) || Number(manifest.eventCount) < 0) throw new Error('Invalid event count.');
  if (!Array.isArray(manifest.populations) || manifest.populations.length === 0) throw new Error('Missing population definitions.');
  if (typeof manifest.spikeFile !== 'string' || !manifest.spikeFile) throw new Error('Missing spike filename.');

  const covered = new Uint8Array(Number(manifest.neuronCount));
  for (const population of manifest.populations) {
    if (!Number.isInteger(population.idStart) || !isPositiveInteger(population.count)) {
      throw new Error('Invalid population range.');
    }
    const end = population.idStart + population.count;
    if (population.idStart < 0 || end > Number(manifest.neuronCount)) throw new Error('Population range exceeds neuron count.');
    for (let id = population.idStart; id < end; id += 1) {
      if (covered[id]) throw new Error('Population ranges overlap.');
      covered[id] = 1;
    }
  }
  if (covered.some((entry) => entry === 0)) throw new Error('Population ranges do not cover every neuron.');
}

function validateSignalGroup(group: SignalGroupDescriptor): void {
  if (!group || typeof group !== 'object') throw new Error('Invalid signal group.');
  if (typeof group.id !== 'string' || !group.id || typeof group.file !== 'string' || !group.file) throw new Error('Signal group is missing its identity or file.');
  if (!isPositiveInteger(group.sampleRateHz) || !isPositiveInteger(group.sampleCount) || !isPositiveInteger(group.channelCount)) throw new Error('Invalid signal group dimensions.');
  if (!Array.isArray(group.channelOrder) || group.channelOrder.length !== group.channelCount) throw new Error('Signal channel order does not match its channel count.');
  if (!Array.isArray(group.channels) || group.channels.length !== group.channelCount) throw new Error('Signal channel metadata does not match its channel count.');
}

function validateVoltageGroup(group: VoltageGroupDescriptor): void {
  if (!group || typeof group !== 'object' || typeof group.file !== 'string' || !group.file) throw new Error('Invalid voltage group.');
  if (!isPositiveInteger(group.sampleRateHz) || !isPositiveInteger(group.sampleCount) || !isPositiveInteger(group.channelCount)) throw new Error('Invalid voltage group dimensions.');
  if (!Array.isArray(group.channelOrder) || group.channelOrder.length !== group.channelCount) throw new Error('Voltage channel order does not match its channel count.');
  if (!Array.isArray(group.localNeuronIds) || group.localNeuronIds.length !== group.channelCount) throw new Error('Voltage local-neuron mapping does not match its channel count.');
  if (new Set(group.channelOrder).size !== group.channelCount) throw new Error('Voltage channel mapping contains duplicate neuron IDs.');
}

function validateConnectivity(value: ConnectivityDescriptor, manifest: Partial<SimulationManifestV2>): void {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1 || (value.provenance !== 'live-brian2-synapses' && value.provenance !== 'synthetic-ui-fixture')) throw new Error('Invalid connectivity descriptor.');
  if (value.runId !== manifest.runId || value.seed !== manifest.condition?.seed) throw new Error('Connectivity run or seed does not match its manifest.');
  if (typeof value.indexFile !== 'string' || !value.indexFile || !Array.isArray(value.projections)) throw new Error('Connectivity descriptor is missing its index or projections.');
  const populationIds = new Set(manifest.populations?.map((population) => population.id));
  const projectionIds = new Set<string>();
  for (const projection of value.projections) {
    if (!projection || typeof projection.id !== 'string' || !projection.id || projectionIds.has(projection.id)) throw new Error('Connectivity contains an invalid or duplicate projection.');
    projectionIds.add(projection.id);
    if (typeof projection.file !== 'string' || !projection.file || !Number.isInteger(projection.edgeCount) || projection.edgeCount < 0) throw new Error('Connectivity projection has invalid file or edge count.');
    if (!populationIds.has(projection.sourcePopulationId) || !populationIds.has(projection.targetPopulationId)) throw new Error('Connectivity projection references an unknown population.');
    if (projection.synapseType !== 'excitatory' && projection.synapseType !== 'inhibitory') throw new Error('Connectivity projection has an invalid synapse type.');
  }
}

export function validateManifest(value: unknown): SimulationManifest {
  if (!isRecord(value)) throw new Error('Simulation manifest is not an object.');
  const manifest = value as unknown as Partial<SimulationManifest>;
  if (manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2) throw new Error('Unsupported simulation schema.');
  validateCoreManifest(manifest);

  if (manifest.schemaVersion === 2) {
    const versionTwo = manifest as Partial<SimulationManifestV2>;
    if (versionTwo.signalGroups !== undefined) {
      if (!Array.isArray(versionTwo.signalGroups)) throw new Error('Invalid signal groups.');
      versionTwo.signalGroups.forEach(validateSignalGroup);
    }
    if (versionTwo.voltageGroups !== undefined) {
      if (!Array.isArray(versionTwo.voltageGroups)) throw new Error('Invalid voltage groups.');
      versionTwo.voltageGroups.forEach(validateVoltageGroup);
    }
    if (versionTwo.events !== undefined) {
      if (!versionTwo.events || typeof versionTwo.events.file !== 'string' || !versionTwo.events.file || !Number.isInteger(versionTwo.events.count) || versionTwo.events.count < 0) {
        throw new Error('Invalid event metadata.');
      }
    }
    if (versionTwo.connectivity !== undefined) validateConnectivity(versionTwo.connectivity, versionTwo);
  }
  return manifest as SimulationManifest;
}

export function parseSpikeDataset(buffer: ArrayBuffer, manifest: SimulationManifest): SpikeDataset {
  const expectedBytes = 8 + manifest.eventCount * 6;
  if (buffer.byteLength !== expectedBytes) throw new Error('Spike data length does not match its manifest.');

  const header = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (header !== SPIKE_MAGIC) throw new Error('Spike data has an invalid format signature.');
  const view = new DataView(buffer);
  const eventCount = view.getUint32(4, true);
  if (eventCount !== manifest.eventCount) throw new Error('Spike event count does not match its manifest.');

  const times = new Uint32Array(buffer, 8, eventCount);
  const neuronIds = new Uint16Array(buffer, 8 + eventCount * 4, eventCount);
  const durationTicks = Math.ceil(manifest.durationMs / manifest.tickMs);
  let previous = 0;
  for (let index = 0; index < eventCount; index += 1) {
    const time = times[index];
    if (index > 0 && time < previous) throw new Error('Spike events are not time-sorted.');
    if (time > durationTicks) throw new Error('Spike event lies outside the simulation duration.');
    if (neuronIds[index] >= manifest.neuronCount) throw new Error('Spike event references an unknown neuron.');
    previous = time;
  }
  return { times, neuronIds };
}

export function parseSignalDataset(buffer: ArrayBuffer, descriptor: Pick<SignalGroupDescriptor | VoltageGroupDescriptor, 'channelCount' | 'sampleCount'>): SignalDataset {
  const expectedBytes = 12 + descriptor.channelCount * descriptor.sampleCount * 4;
  if (buffer.byteLength !== expectedBytes) throw new Error('Signal data length does not match its manifest.');
  const header = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (header !== SIGNAL_MAGIC) throw new Error('Signal data has an invalid format signature.');
  const view = new DataView(buffer);
  const channelCount = view.getUint32(4, true);
  const sampleCount = view.getUint32(8, true);
  if (channelCount !== descriptor.channelCount || sampleCount !== descriptor.sampleCount) throw new Error('Signal dimensions do not match their manifest.');
  return { channelCount, sampleCount, samples: new Float32Array(buffer, 12) };
}

export function parseConnectivityDataset(
  buffer: ArrayBuffer,
  descriptor: ConnectivityProjectionDescriptor,
  neuronCount: number,
): ConnectivityDataset {
  const expectedBytes = 8 + descriptor.edgeCount * 12;
  if (buffer.byteLength !== expectedBytes) throw new Error('Connectivity data length does not match its manifest.');
  const header = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (header !== CONNECTIVITY_MAGIC) throw new Error('Connectivity data has an invalid format signature.');
  const edgeCount = new DataView(buffer).getUint32(4, true);
  if (edgeCount !== descriptor.edgeCount) throw new Error('Connectivity edge count does not match its manifest.');
  const sourceIds = new Uint16Array(buffer, 8, edgeCount);
  const targetIds = new Uint16Array(buffer, 8 + edgeCount * 2, edgeCount);
  const weights = new Float32Array(buffer, 8 + edgeCount * 4, edgeCount);
  const delaysMs = new Float32Array(buffer, 8 + edgeCount * 8, edgeCount);
  for (let index = 0; index < edgeCount; index += 1) {
    if (sourceIds[index] >= neuronCount || targetIds[index] >= neuronCount) throw new Error('Connectivity references an unknown neuron.');
    if (!Number.isFinite(weights[index]) || !Number.isFinite(delaysMs[index]) || delaysMs[index] < 0) throw new Error('Connectivity contains an invalid weight or delay.');
  }
  return { edgeCount, sourceIds, targetIds, weights, delaysMs };
}

export function validateEventsDocument(value: unknown, expectedCount?: number): EventsDocument {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.detector) || !Array.isArray(value.events)) throw new Error('Invalid SPW-R event document.');
  if (expectedCount !== undefined && value.events.length !== expectedCount) throw new Error('SPW-R event count does not match its manifest.');
  let previousEnd = -1;
  for (const event of value.events) {
    if (!isRecord(event) || !Number.isInteger(event.startSample) || !Number.isInteger(event.endSample) || Number(event.startSample) < 0 || Number(event.endSample) < Number(event.startSample)) throw new Error('Invalid SPW-R event bounds.');
    if (Number(event.startSample) < previousEnd) throw new Error('SPW-R events are not ordered.');
    if (!Number.isFinite(event.startMs) || !Number.isFinite(event.endMs) || !Number.isFinite(event.normalizedPeakPower)) throw new Error('Invalid SPW-R event values.');
    previousEnd = Number(event.endSample);
  }
  return value as unknown as EventsDocument;
}

export function validateRunCatalog(value: unknown): RunCatalog {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.runs)) throw new Error('Invalid run catalog.');
  const ids = new Set<string>();
  for (const run of value.runs) {
    if (!isRecord(run) || typeof run.id !== 'string' || !run.id || typeof run.label !== 'string' || typeof run.conditionCategory !== 'string' || !Number.isInteger(run.seed) || typeof run.manifestUrl !== 'string' || !run.manifestUrl) throw new Error('Invalid run catalog entry.');
    if (ids.has(run.id)) throw new Error('Run catalog contains duplicate IDs.');
    ids.add(run.id);
  }
  return value as unknown as RunCatalog;
}

export function lowerBound(values: Uint32Array, target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + ((high - low) >> 1);
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}
