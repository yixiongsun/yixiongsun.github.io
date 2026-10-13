import type { PopulationDescriptor, SpikeDataset } from './network-data';

export const COFIRING_SAMPLE_COLOR = '#ff4d4d';
export const COFIRING_THRESHOLD = 3;
const LINE_FADE_MS = 300;
const LINE_DECAY_MS = 72;

// Zero-based indices in the CA1 pyramidal population, in the supplied cg order.
export const COFIRING_SAMPLE_LOCAL_IDS = [
  148, 114, 139, 142, 161, 112, 125, 141, 143, 129,
  353, 322, 314, 345, 343, 332, 316, 327, 335, 359,
  538, 520, 550, 534, 536, 561, 530, 528, 541, 523,
  755, 731, 754, 735, 720, 741, 727, 740, 751, 736,
  914, 949, 912, 927, 920, 924, 931, 946, 935, 958,
] as const;

export function sampledCofiringNeuronIds(populations: PopulationDescriptor[]): Set<number> {
  const population = populations.find((entry) => entry.id === 'ca1-py');
  if (!population) return new Set();
  return new Set(COFIRING_SAMPLE_LOCAL_IDS
    .filter((localId) => localId < population.count)
    .map((localId) => population.idStart + localId));
}

export interface CofiringEdge {
  sourceId: number;
  targetId: number;
  score: number;
}

export function parseCofiringEdges(value: unknown, runId: string, populations: PopulationDescriptor[]): CofiringEdge[] {
  const data = value as Record<string, unknown> | null;
  const population = populations.find((entry) => entry.id === 'ca1-py');
  if (!data || data.schemaVersion !== 1 || data.runId !== runId || data.populationId !== 'ca1-py' || !population
    || data.scoreDefinition !== 'positive-peak-central-three-z-bins'
    || !Array.isArray(data.lagWindowMs) || data.lagWindowMs[0] !== -25 || data.lagWindowMs[1] !== 25
    || !Array.isArray(data.sampleLocalIds) || data.sampleLocalIds.length !== 50
    || new Set(data.sampleLocalIds).size !== 50
    || !COFIRING_SAMPLE_LOCAL_IDS.every((id) => (data.sampleLocalIds as unknown[]).includes(id))
    || !Array.isArray(data.edges)) throw new Error('Cofiring data does not match this simulation and sample.');
  const samples = new Set<number>(COFIRING_SAMPLE_LOCAL_IDS);
  const seen = new Set<string>();
  const edges: CofiringEdge[] = [];
  for (const entry of data.edges) {
    const { sourceLocalId, targetLocalId, score } = entry ?? {};
    const key = [sourceLocalId, targetLocalId].sort((a, b) => a - b).join(':');
    if (!samples.has(sourceLocalId) || !samples.has(targetLocalId) || sourceLocalId === targetLocalId
      || sourceLocalId >= population.count || targetLocalId >= population.count || seen.has(key)
      || (score !== null && (typeof score !== 'number' || !Number.isFinite(score) || score <= 0))) throw new Error('Invalid cofiring cell pair or score.');
    seen.add(key);
    if (score !== null) edges.push({ sourceId: population.idStart + sourceLocalId, targetId: population.idStart + targetLocalId, score });
  }
  return edges;
}

export function selectCofiringEdges(edges: CofiringEdge[], threshold: number): CofiringEdge[] {
  return edges.filter((edge) => Number.isFinite(edge.score) && edge.score > 0 && edge.score > threshold);
}

export type CofiringPulseMode = 'either' | 'paired';

// A pulse starts at the second spike of a qualifying pair. Precompute from
// all spike events so seeking and skipped animation frames preserve matches.
export function buildCofiringPulseTicks(edges: CofiringEdge[], spikes: SpikeDataset, tickMs: number): Map<CofiringEdge, Uint32Array> {
  const timesByNeuron = new Map<number, number[]>();
  for (const edge of edges) {
    timesByNeuron.set(edge.sourceId, []);
    timesByNeuron.set(edge.targetId, []);
  }
  for (let index = 0; index < spikes.times.length; index += 1) {
    timesByNeuron.get(spikes.neuronIds[index])?.push(spikes.times[index]);
  }
  const result = new Map<CofiringEdge, Uint32Array>();
  for (const edge of edges) {
    const source = timesByNeuron.get(edge.sourceId)!;
    const target = timesByNeuron.get(edge.targetId)!;
    let sourceIndex = 0;
    let targetIndex = 0;
    let lastSource = -Infinity;
    let lastTarget = -Infinity;
    const pulses: number[] = [];
    while (sourceIndex < source.length || targetIndex < target.length) {
      const nextSource = source[sourceIndex] ?? Infinity;
      const nextTarget = target[targetIndex] ?? Infinity;
      const tick = Math.min(nextSource, nextTarget);
      if (nextSource === tick) lastSource = source[sourceIndex++];
      if (nextTarget === tick) lastTarget = target[targetIndex++];
      if (Number.isFinite(lastSource) && Number.isFinite(lastTarget)
        && Math.abs(lastSource - lastTarget) <= 50 / tickMs
        && pulses[pulses.length - 1] !== tick) pulses.push(tick);
    }
    result.set(edge, new Uint32Array(pulses));
  }
  return result;
}

export function cofiringPulseIntensity(
  edge: CofiringEdge, mode: CofiringPulseMode, lastSpikeTicks: Int32Array,
  pairPulseTicks: Uint32Array, tickMs: number, currentMs: number,
): number {
  let pulseTick = -Infinity;
  if (mode === 'either') {
    pulseTick = Math.max(lastSpikeTicks[edge.sourceId], lastSpikeTicks[edge.targetId]);
  } else {
    let low = 0;
    let high = pairPulseTicks.length;
    const currentTick = currentMs / tickMs;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (pairPulseTicks[middle] <= currentTick) low = middle + 1;
      else high = middle;
    }
    if (low > 0) pulseTick = pairPulseTicks[low - 1];
  }
  const ageMs = currentMs - pulseTick * tickMs;
  return pulseTick < 0 || !Number.isFinite(ageMs) || ageMs < 0 || ageMs > LINE_FADE_MS ? 0 : Math.exp(-ageMs / LINE_DECAY_MS);
}
