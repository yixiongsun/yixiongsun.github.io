import type { SignalDataset, SpwrEvent } from './network-data';
import type { SignalDomain } from './signal-viewer';

export type ComparisonAlignment = 'absolute' | 'event';

export function computeUnionDomains(datasets: SignalDataset[], zeroFloor = false): SignalDomain[] {
  if (datasets.length === 0) return [];
  const channelCount = datasets[0].channelCount;
  if (datasets.some((dataset) => dataset.channelCount !== channelCount)) {
    throw new Error('Comparison signal groups must have matching channel counts.');
  }
  const domains: SignalDomain[] = [];
  for (let channel = 0; channel < channelCount; channel += 1) {
    let minimum = zeroFloor ? 0 : Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const dataset of datasets) {
      const offset = channel * dataset.sampleCount;
      for (let sample = 0; sample < dataset.sampleCount; sample += 1) {
        const value = dataset.samples[offset + sample];
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
    }
    if (zeroFloor) minimum = 0;
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
      domains.push({ min: 0, max: 1 });
      continue;
    }
    if (minimum === maximum) {
      const padding = Math.max(1, Math.abs(minimum) * 0.05);
      domains.push({ min: zeroFloor ? 0 : minimum - padding, max: maximum + padding });
      continue;
    }
    const padding = (maximum - minimum) * 0.04;
    domains.push({ min: zeroFloor ? 0 : minimum - padding, max: maximum + padding });
  }
  return domains;
}

export function defaultComparableEventIndex(events: SpwrEvent[], durationMs: number, halfWindowMs = 500): number {
  if (events.length === 0) return -1;
  const index = events.findIndex(
    (event) => event.startMs >= halfWindowMs && event.startMs + halfWindowMs <= durationMs,
  );
  return index >= 0 ? index : 0;
}

export function actualTimeForAlignment(
  alignment: ComparisonAlignment,
  sharedTimeMs: number,
  durationMs: number,
  selectedEvent?: SpwrEvent,
): number {
  const value = alignment === 'event' && selectedEvent
    ? selectedEvent.startMs + sharedTimeMs
    : sharedTimeMs;
  return Math.max(0, Math.min(durationMs, value));
}

export function comparisonTimeBounds(
  alignment: ComparisonAlignment,
  durationMs: number,
  windowMs: number,
): { minMs: number; maxMs: number } {
  return alignment === 'event'
    ? { minMs: -windowMs / 2, maxMs: windowMs / 2 }
    : { minMs: 0, maxMs: durationMs };
}

export function alignedTraceWindow(
  alignment: ComparisonAlignment,
  sharedTimeMs: number,
  durationMs: number,
  windowMs: number,
  selectedEvent?: SpwrEvent,
): { startMs: number; endMs: number } {
  if (alignment === 'event' && selectedEvent) {
    return {
      startMs: Math.max(0, selectedEvent.startMs - windowMs / 2),
      endMs: Math.min(durationMs, selectedEvent.startMs + windowMs / 2),
    };
  }
  const half = windowMs / 2;
  let startMs = sharedTimeMs - half;
  let endMs = sharedTimeMs + half;
  if (startMs < 0) {
    endMs -= startMs;
    startMs = 0;
  }
  if (endMs > durationMs) {
    startMs -= endMs - durationMs;
    endMs = durationMs;
  }
  return { startMs: Math.max(0, startMs), endMs };
}
