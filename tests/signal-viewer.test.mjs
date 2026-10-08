import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeFixedDomains,
  downsampleMinMax,
  focusPlaybackRange,
  getRollingWindow,
  nextEventIndex,
  previousEventIndex,
} from '../src/lib/signal-viewer.ts';

test('keeps rolling windows centered except at recording boundaries', () => {
  assert.deepEqual(getRollingWindow(0, 30_000, 2_000), { startMs: 0, endMs: 2_000 });
  assert.deepEqual(getRollingWindow(15_000, 30_000, 2_000), { startMs: 14_000, endMs: 16_000 });
  assert.deepEqual(getRollingWindow(30_000, 30_000, 2_000), { startMs: 28_000, endMs: 30_000 });
});

test('uses fixed whole-recording domains and pads constant channels', () => {
  const dataset = { channelCount: 2, sampleCount: 4, samples: new Float32Array([-3, 1, 9, 2, 4, 4, 4, 4]) };
  assert.deepEqual(computeFixedDomains(dataset)[0], { min: -3, max: 9 });
  assert.deepEqual(computeFixedDomains(dataset)[1], { min: 3, max: 5 });
});

test('min-max downsampling preserves peaks narrower than a pixel', () => {
  const samples = new Float32Array(100);
  samples[51] = 12;
  samples[52] = -8;
  const envelope = downsampleMinMax({ channelCount: 1, sampleCount: 100, samples }, 0, 1_000, 0, 100, 10);
  assert.equal(Math.max(...envelope.maximums), 12);
  assert.equal(Math.min(...envelope.minimums), -8);
});

test('event navigation and focus ranges respect boundaries', () => {
  const events = [
    { startSample: 100, endSample: 150, startMs: 100, endMs: 150, normalizedPeakPower: 3 },
    { startSample: 500, endSample: 580, startMs: 500, endMs: 580, normalizedPeakPower: 4 },
  ];
  assert.equal(nextEventIndex(events, 0, -1), 0);
  assert.equal(nextEventIndex(events, 100, 0), 1);
  assert.equal(previousEventIndex(events, 500, 1), 0);
  assert.equal(previousEventIndex(events, 500, 0), 0);
  assert.deepEqual(focusPlaybackRange(events[0], 30_000), { startMs: 0, endMs: 400 });
  assert.deepEqual(focusPlaybackRange({ ...events[1], startMs: 29_900, endMs: 29_980 }, 30_000), { startMs: 29_650, endMs: 30_000 });
});
