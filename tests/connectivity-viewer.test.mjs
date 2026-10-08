import assert from 'node:assert/strict';
import test from 'node:test';

import { parseConnectivityDataset } from '../src/lib/network-data.ts';
import {
  projectionAppliesToSelection,
  selectConnections,
  transmissionPulseProgress,
} from '../src/lib/connectivity-viewer.ts';

const descriptor = {
  id: 'pfc-ca1',
  label: 'PFC to CA1',
  file: 'connectivity/pfc-ca1.bin',
  edgeCount: 3,
  sourcePopulationId: 'pfc-py',
  targetPopulationId: 'ca1-py',
  synapseType: 'excitatory',
  weightUnit: 'nS',
  encoding: 'NCX1',
};

function fixture() {
  const buffer = new ArrayBuffer(8 + 3 * 12);
  new Uint8Array(buffer, 0, 4).set([78, 67, 88, 49]);
  const view = new DataView(buffer);
  view.setUint32(4, 3, true);
  [1, 2, 1].forEach((value, index) => view.setUint16(8 + index * 2, value, true));
  [10, 10, 11].forEach((value, index) => view.setUint16(14 + index * 2, value, true));
  [0.5, 3, 2].forEach((value, index) => view.setFloat32(20 + index * 4, value, true));
  [4, 5, 6].forEach((value, index) => view.setFloat32(32 + index * 4, value, true));
  return buffer;
}

test('parses exact NCX1 projection data', () => {
  const data = parseConnectivityDataset(fixture(), descriptor, 20);
  assert.deepEqual([...data.sourceIds], [1, 2, 1]);
  assert.deepEqual([...data.targetIds], [10, 10, 11]);
  assert.deepEqual([...data.delaysMs], [4, 5, 6]);
  assert.throws(() => parseConnectivityDataset(fixture().slice(0, -1), descriptor, 20), /length/i);
});

test('loads relevant projections and returns strongest one-hop edges', () => {
  assert.equal(projectionAppliesToSelection(descriptor, 'ca1-py', 'incoming'), true);
  assert.equal(projectionAppliesToSelection(descriptor, 'ca1-py', 'outgoing'), false);
  const dataset = parseConnectivityDataset(fixture(), descriptor, 20);
  const result = selectConnections([{ descriptor, dataset }], 10, { direction: 'incoming', limit: 1 });
  assert.equal(result.matchedCount, 2);
  assert.equal(result.truncated, true);
  assert.equal(result.edges[0].sourceId, 2);
  assert.equal(result.edges[0].weight, 3);
});

test('uses presynaptic spikes and exported delay for pulse timing', () => {
  const ticks = new Int32Array(20);
  ticks.fill(-1);
  ticks[2] = 100;
  assert.equal(transmissionPulseProgress({ sourceId: 2, delayMs: 5 }, ticks, 0.05, 7.5), 0.5);
  assert.equal(transmissionPulseProgress({ sourceId: 2, delayMs: 5 }, ticks, 0.05, 10), 1);
  assert.equal(transmissionPulseProgress({ sourceId: 3, delayMs: 5 }, ticks, 0.05, 10), undefined);
});
