import type { SignalDataset, SpwrEvent } from './network-data';

export interface SignalDomain {
  min: number;
  max: number;
}

export interface RollingWindow {
  startMs: number;
  endMs: number;
}

export interface MinMaxEnvelope {
  minimums: Float32Array;
  maximums: Float32Array;
}

export function computeFixedDomains(dataset: SignalDataset): SignalDomain[] {
  const domains: SignalDomain[] = [];
  for (let channel = 0; channel < dataset.channelCount; channel += 1) {
    const offset = channel * dataset.sampleCount;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let sample = 0; sample < dataset.sampleCount; sample += 1) {
      const value = dataset.samples[offset + sample];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error('Signal channel contains no finite samples.');
    if (min === max) {
      const padding = Math.max(Math.abs(min) * 0.05, 1);
      min -= padding;
      max += padding;
    }
    domains.push({ min, max });
  }
  return domains;
}

export function getRollingWindow(currentMs: number, durationMs: number, windowMs: number): RollingWindow {
  const width = Math.min(Math.max(windowMs, 1), durationMs);
  const startMs = Math.max(0, Math.min(durationMs - width, currentMs - width / 2));
  return { startMs, endMs: startMs + width };
}

export function downsampleMinMax(
  dataset: SignalDataset,
  channelIndex: number,
  sampleRateHz: number,
  startMs: number,
  endMs: number,
  pixelCount: number,
): MinMaxEnvelope {
  if (!Number.isInteger(channelIndex) || channelIndex < 0 || channelIndex >= dataset.channelCount) throw new Error('Signal channel index is out of range.');
  const width = Math.max(1, Math.floor(pixelCount));
  const startSample = Math.max(0, Math.floor(startMs * sampleRateHz / 1_000));
  const endSample = Math.min(dataset.sampleCount, Math.max(startSample + 1, Math.ceil(endMs * sampleRateHz / 1_000)));
  const span = endSample - startSample;
  const offset = channelIndex * dataset.sampleCount;
  const minimums = new Float32Array(width);
  const maximums = new Float32Array(width);

  for (let pixel = 0; pixel < width; pixel += 1) {
    const bucketStart = startSample + Math.floor(pixel * span / width);
    const bucketEnd = Math.min(endSample, Math.max(bucketStart + 1, startSample + Math.ceil((pixel + 1) * span / width)));
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let sample = bucketStart; sample < bucketEnd; sample += 1) {
      const value = dataset.samples[offset + sample];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    minimums[pixel] = min;
    maximums[pixel] = max;
  }
  return { minimums, maximums };
}

export function previousEventIndex(events: SpwrEvent[], currentMs: number, selectedIndex: number): number {
  if (events.length === 0) return -1;
  if (selectedIndex >= 0) return Math.max(0, selectedIndex - 1);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].startMs < currentMs - 1) return index;
  }
  return 0;
}

export function nextEventIndex(events: SpwrEvent[], currentMs: number, selectedIndex: number): number {
  if (events.length === 0) return -1;
  if (selectedIndex >= 0) return Math.min(events.length - 1, selectedIndex + 1);
  for (let index = 0; index < events.length; index += 1) {
    if (events[index].startMs > currentMs + 1) return index;
  }
  return events.length - 1;
}

export function focusPlaybackRange(event: SpwrEvent, durationMs: number): RollingWindow {
  return {
    startMs: Math.max(0, event.startMs - 250),
    endMs: Math.min(durationMs, event.endMs + 250),
  };
}
