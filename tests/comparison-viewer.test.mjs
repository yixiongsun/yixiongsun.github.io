import assert from 'node:assert/strict';
import test from 'node:test';

import {
  actualTimeForAlignment,
  alignedTraceWindow,
  comparisonTimeBounds,
  computeUnionDomains,
  defaultComparableEventIndex,
} from '../src/lib/comparison-viewer.ts';

test('computes shared per-channel domains from both conditions', () => {
  const first = { channelCount: 2, sampleCount: 2, samples: new Float32Array([-2, 3, 0, 4]) };
  const second = { channelCount: 2, sampleCount: 2, samples: new Float32Array([-5, 2, 0, 8]) };
  assert.deepEqual(computeUnionDomains([first, second]), [
    { min: -5.32, max: 3.32 },
    { min: -0.32, max: 8.32 },
  ]);
  assert.deepEqual(computeUnionDomains([first, second], true), [
    { min: 0, max: 3.12 },
    { min: 0, max: 8.32 },
  ]);
});

test('chooses the first event with a complete default alignment window', () => {
  const events = [
    { startMs: 300, endMs: 350 },
    { startMs: 700, endMs: 750 },
  ];
  assert.equal(defaultComparableEventIndex(events, 30_000), 1);
  assert.equal(defaultComparableEventIndex(events.slice(0, 1), 30_000), 0);
  assert.equal(defaultComparableEventIndex([], 30_000), -1);
});

test('maps shared absolute and event-relative time to underlying run time', () => {
  const event = { startMs: 1_000 };
  assert.equal(actualTimeForAlignment('absolute', 250, 2_000, event), 250);
  assert.equal(actualTimeForAlignment('event', -250, 2_000, event), 750);
  assert.equal(actualTimeForAlignment('event', -1_500, 2_000, event), 0);
});

test('provides absolute and event-aligned playback bounds and trace windows', () => {
  assert.deepEqual(comparisonTimeBounds('absolute', 30_000, 1_000), { minMs: 0, maxMs: 30_000 });
  assert.deepEqual(comparisonTimeBounds('event', 30_000, 1_000), { minMs: -500, maxMs: 500 });
  assert.deepEqual(alignedTraceWindow('absolute', 200, 30_000, 1_000), { startMs: 0, endMs: 1_000 });
  assert.deepEqual(
    alignedTraceWindow('event', 0, 30_000, 1_000, { startMs: 2_000 }),
    { startMs: 1_500, endMs: 2_500 },
  );
});
