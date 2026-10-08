import type {
  PopulationDescriptor,
  SignalDataset,
  SpikeDataset,
  VoltageGroupDescriptor,
} from './network-data';
import type { SignalDomain } from './signal-viewer';

export interface NeuronIdentity {
  population: PopulationDescriptor;
  populationIndex: number;
  localId: number;
}

export interface VoltageChannelMatch {
  descriptor: VoltageGroupDescriptor;
  channelIndex: number;
}

export function identifyNeuron(populations: PopulationDescriptor[], neuronId: number): NeuronIdentity | undefined {
  if (!Number.isInteger(neuronId) || neuronId < 0) return undefined;
  const populationIndex = populations.findIndex(
    (population) => neuronId >= population.idStart && neuronId < population.idStart + population.count,
  );
  if (populationIndex < 0) return undefined;
  const population = populations[populationIndex];
  return { population, populationIndex, localId: neuronId - population.idStart };
}

export function countSpikesByNeuron(spikes: SpikeDataset, neuronCount: number): Uint32Array {
  const counts = new Uint32Array(neuronCount);
  for (let index = 0; index < spikes.neuronIds.length; index += 1) counts[spikes.neuronIds[index]] += 1;
  return counts;
}

export function collectNeuronSpikeTimes(spikes: SpikeDataset, tickMs: number, neuronId: number): Float32Array {
  let count = 0;
  for (let index = 0; index < spikes.neuronIds.length; index += 1) {
    if (spikes.neuronIds[index] === neuronId) count += 1;
  }
  const times = new Float32Array(count);
  let cursor = 0;
  for (let index = 0; index < spikes.neuronIds.length; index += 1) {
    if (spikes.neuronIds[index] === neuronId) {
      times[cursor] = spikes.times[index] * tickMs;
      cursor += 1;
    }
  }
  return times;
}

export function findVoltageChannel(groups: VoltageGroupDescriptor[], neuronId: number): VoltageChannelMatch | undefined {
  for (const descriptor of groups) {
    const channelIndex = descriptor.channelOrder.indexOf(neuronId);
    if (channelIndex >= 0) return { descriptor, channelIndex };
  }
  return undefined;
}

export function computeRateDomains(dataset: SignalDataset): SignalDomain[] {
  const domains: SignalDomain[] = [];
  for (let channel = 0; channel < dataset.channelCount; channel += 1) {
    const offset = channel * dataset.sampleCount;
    let maximum = 0;
    for (let sample = 0; sample < dataset.sampleCount; sample += 1) {
      maximum = Math.max(maximum, dataset.samples[offset + sample]);
    }
    domains.push({ min: 0, max: maximum > 0 ? maximum * 1.05 : 1 });
  }
  return domains;
}

export function nearestNeuronId(
  x: number,
  y: number,
  xPositions: Float32Array,
  yPositions: Float32Array,
  maximumDistance: number,
  isVisible?: (neuronId: number) => boolean,
): number {
  let nearest = -1;
  let nearestSquared = maximumDistance * maximumDistance;
  for (let neuronId = 0; neuronId < xPositions.length; neuronId += 1) {
    if (isVisible && !isVisible(neuronId)) continue;
    const deltaX = xPositions[neuronId] - x;
    const deltaY = yPositions[neuronId] - y;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (distanceSquared <= nearestSquared) {
      nearest = neuronId;
      nearestSquared = distanceSquared;
    }
  }
  return nearest;
}
