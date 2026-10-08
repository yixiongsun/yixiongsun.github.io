import type {
  ConnectivityDataset,
  ConnectivityProjectionDescriptor,
  SynapseType,
} from './network-data';

export type ConnectivityDirection = 'incoming' | 'outgoing' | 'both';

export interface DisplayedConnection {
  sourceId: number;
  targetId: number;
  weight: number;
  delayMs: number;
  projectionId: string;
  projectionLabel: string;
  synapseType: SynapseType;
  weightUnit: string;
}

export interface LoadedProjection {
  descriptor: ConnectivityProjectionDescriptor;
  dataset: ConnectivityDataset;
}

export function projectionAppliesToSelection(
  descriptor: ConnectivityProjectionDescriptor,
  selectedPopulationId: string,
  direction: ConnectivityDirection,
): boolean {
  return (direction !== 'incoming' && descriptor.sourcePopulationId === selectedPopulationId)
    || (direction !== 'outgoing' && descriptor.targetPopulationId === selectedPopulationId);
}

export function selectConnections(
  projections: LoadedProjection[],
  selectedNeuronId: number,
  options: {
    direction: ConnectivityDirection;
    projectionId?: string;
    synapseType?: SynapseType;
    limit?: number;
  },
): { edges: DisplayedConnection[]; matchedCount: number; truncated: boolean } {
  const matches: DisplayedConnection[] = [];
  for (const { descriptor, dataset } of projections) {
    if (options.projectionId && descriptor.id !== options.projectionId) continue;
    if (options.synapseType && descriptor.synapseType !== options.synapseType) continue;
    for (let index = 0; index < dataset.edgeCount; index += 1) {
      const incoming = dataset.targetIds[index] === selectedNeuronId;
      const outgoing = dataset.sourceIds[index] === selectedNeuronId;
      if ((options.direction === 'incoming' && !incoming) || (options.direction === 'outgoing' && !outgoing) || (options.direction === 'both' && !incoming && !outgoing)) continue;
      matches.push({
        sourceId: dataset.sourceIds[index],
        targetId: dataset.targetIds[index],
        weight: dataset.weights[index],
        delayMs: dataset.delaysMs[index],
        projectionId: descriptor.id,
        projectionLabel: descriptor.label,
        synapseType: descriptor.synapseType,
        weightUnit: descriptor.weightUnit,
      });
    }
  }
  matches.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  const limit = Math.max(1, Math.min(200, options.limit ?? 200));
  return { edges: matches.slice(0, limit), matchedCount: matches.length, truncated: matches.length > limit };
}

export function transmissionPulseProgress(
  edge: Pick<DisplayedConnection, 'sourceId' | 'delayMs'>,
  lastSpikeTicks: Int32Array,
  tickMs: number,
  currentMs: number,
  travelWindowMs = 120,
): number | undefined {
  const spikeTick = lastSpikeTicks[edge.sourceId];
  if (spikeTick === undefined || spikeTick < 0) return undefined;
  const elapsed = currentMs - spikeTick * tickMs;
  if (elapsed < 0 || elapsed > edge.delayMs + travelWindowMs) return undefined;
  if (edge.delayMs <= 0) return elapsed <= travelWindowMs ? 1 : undefined;
  return Math.min(1, elapsed / edge.delayMs);
}
