import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectNeuronSpikeTimes,
  computeRateDomains,
  countSpikesByNeuron,
  findVoltageChannel,
  identifyNeuron,
  nearestNeuronId,
} from '../src/lib/neuron-inspector.ts';

const populations = [
  { id: 'a', label: 'A pyramidal', region: 'PFC', cellType: 'pyramidal', idStart: 0, count: 2, eventCount: 3 },
  { id: 'b', label: 'B interneuron', region: 'CA1', cellType: 'interneuron', idStart: 2, count: 2, eventCount: 2 },
];

test('identifies a neuron and its population-local ID', () => {
  const identity = identifyNeuron(populations, 3);
  assert.equal(identity?.population.id, 'b');
  assert.equal(identity?.populationIndex, 1);
  assert.equal(identity?.localId, 1);
  assert.equal(identifyNeuron(populations, 4), undefined);
});

test('counts and extracts per-neuron spike histories', () => {
  const spikes = {
    times: new Uint32Array([1, 2, 4, 8, 9]),
    neuronIds: new Uint16Array([0, 1, 0, 3, 0]),
  };
  assert.deepEqual([...countSpikesByNeuron(spikes, 4)], [3, 1, 0, 1]);
  assert.deepEqual([...collectNeuronSpikeTimes(spikes, 0.5, 0)], [0.5, 2, 4.5]);
});

test('maps monitored global neuron IDs to voltage channels', () => {
  const descriptors = [{ channelOrder: [10, 12, 14], id: 'ca1-py' }];
  assert.deepEqual(findVoltageChannel(descriptors, 12), { descriptor: descriptors[0], channelIndex: 1 });
  assert.equal(findVoltageChannel(descriptors, 13), undefined);
});

test('uses fixed nonnegative firing-rate domains', () => {
  const domains = computeRateDomains({
    channelCount: 2,
    sampleCount: 3,
    samples: new Float32Array([0, 2, 4, 0, 0, 0]),
  });
  assert.deepEqual(domains, [{ min: 0, max: 4.2 }, { min: 0, max: 1 }]);
});

test('finds the nearest visible neuron within the hit radius', () => {
  const xs = new Float32Array([0, 10, 20]);
  const ys = new Float32Array([0, 10, 20]);
  assert.equal(nearestNeuronId(11, 10, xs, ys, 4), 1);
  assert.equal(nearestNeuronId(11, 10, xs, ys, 4, (id) => id !== 1), -1);
  assert.equal(nearestNeuronId(30, 30, xs, ys, 4), -1);
});
