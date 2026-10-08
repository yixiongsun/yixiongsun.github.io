import assert from 'node:assert/strict';
import test from 'node:test';

import {
  lowerBound,
  parseSignalDataset,
  parseSpikeDataset,
  validateEventsDocument,
  validateManifest,
  validateRunCatalog,
} from '../src/lib/network-data.ts';

const manifest = {
  schemaVersion: 1,
  runId: 'fixture',
  label: 'Fixture',
  durationMs: 10,
  tickMs: 0.05,
  neuronCount: 2,
  eventCount: 3,
  spikeFile: 'spikes.bin',
  spikeEncoding: 'test',
  sha256: '',
  populations: [
    { id: 'a', label: 'A', region: 'PFC', cellType: 'pyramidal', idStart: 0, count: 2, eventCount: 3 },
  ],
};

function fixtureBuffer() {
  const buffer = new ArrayBuffer(8 + manifest.eventCount * 6);
  new Uint8Array(buffer, 0, 4).set([78, 83, 86, 49]);
  new DataView(buffer).setUint32(4, manifest.eventCount, true);
  new Uint32Array(buffer, 8, 3).set([1, 2, 5]);
  new Uint16Array(buffer, 20, 3).set([0, 1, 0]);
  return buffer;
}

test('validates and parses NSV1 data', () => {
  const checked = validateManifest(manifest);
  const data = parseSpikeDataset(fixtureBuffer(), checked);
  assert.deepEqual([...data.times], [1, 2, 5]);
  assert.deepEqual([...data.neuronIds], [0, 1, 0]);
});

test('rejects malformed data and population coverage', () => {
  const broken = fixtureBuffer();
  new Uint8Array(broken)[0] = 0;
  assert.throws(() => parseSpikeDataset(broken, manifest), /signature/);
  assert.throws(() => validateManifest({ ...manifest, populations: [] }), /population/i);
});

test('accepts schema version 2 with optional scientific data descriptors', () => {
  const versionTwo = {
    ...manifest,
    schemaVersion: 2,
    condition: { category: 'baseline', seed: 0 },
    signalGroups: [{
      id: 'currents',
      file: 'currents.bin',
      encoding: 'NSG2',
      sampleRateHz: 1000,
      sampleCount: 10,
      channelCount: 2,
      channelOrder: ['a', 'b'],
      channels: [
        { id: 'a', label: 'A', unit: 'arbitrary model-current units' },
        { id: 'b', label: 'B', unit: 'arbitrary model-current units' },
      ],
      semanticRole: 'model-current',
    }],
    events: { file: 'events.json', count: 1, sampleRateHz: 1000, semanticRole: 'spwr-detections' },
    voltageGroups: [],
  };
  assert.equal(validateManifest(versionTwo).schemaVersion, 2);
  assert.throws(
    () => validateManifest({ ...versionTwo, signalGroups: [{ ...versionTwo.signalGroups[0], channelOrder: ['a'] }] }),
    /channel order/i,
  );
});

test('requires connectivity provenance to match the exact run and seed', () => {
  const versionTwo = {
    ...manifest,
    schemaVersion: 2,
    condition: { category: 'baseline', seed: 0 },
    connectivity: {
      schemaVersion: 1,
      runId: 'fixture',
      seed: 0,
      provenance: 'live-brian2-synapses',
      indexFile: 'connectivity/connectivity.json',
      projections: [{
        id: 'a-a', label: 'A to A', file: 'connectivity/a-a.bin', edgeCount: 0,
        sourcePopulationId: 'a', targetPopulationId: 'a', synapseType: 'excitatory',
        weightUnit: 'nS', encoding: 'NCX1',
      }],
    },
  };
  assert.equal(validateManifest(versionTwo).schemaVersion, 2);
  assert.equal(validateManifest({ ...versionTwo, connectivity: { ...versionTwo.connectivity, provenance: 'synthetic-ui-fixture' } }).schemaVersion, 2);
  assert.throws(() => validateManifest({ ...versionTwo, connectivity: { ...versionTwo.connectivity, seed: 4 } }), /seed/i);
});

test('parses channel-major little-endian NSG2 signal data', () => {
  const buffer = new ArrayBuffer(12 + 4 * 4);
  new Uint8Array(buffer, 0, 4).set([78, 83, 71, 50]);
  const view = new DataView(buffer);
  view.setUint32(4, 2, true);
  view.setUint32(8, 2, true);
  [1, 2, 3, 4].forEach((value, index) => view.setFloat32(12 + index * 4, value, true));
  const parsed = parseSignalDataset(buffer, { channelCount: 2, sampleCount: 2 });
  assert.deepEqual([...parsed.samples], [1, 2, 3, 4]);

  assert.throws(() => parseSignalDataset(buffer.slice(0, -4), { channelCount: 2, sampleCount: 2 }), /length/i);
  assert.throws(() => parseSignalDataset(buffer, { channelCount: 1, sampleCount: 4 }), /dimensions/i);
});

test('validates ordered optional SPW-R events', () => {
  const document = {
    schemaVersion: 1,
    detector: { name: 'ripple_detection.SWR', sampleRateHz: 1000 },
    events: [
      { startSample: 10, endSample: 20, startMs: 10, endMs: 20, normalizedPeakPower: 3.2 },
      { startSample: 30, endSample: 50, startMs: 30, endMs: 50, normalizedPeakPower: 4.1 },
    ],
  };
  assert.equal(validateEventsDocument(document, 2).events.length, 2);
  assert.throws(() => validateEventsDocument({ ...document, events: [document.events[1], document.events[0]] }), /ordered/i);
  assert.throws(() => validateEventsDocument(document, 1), /count/i);
});

test('validates an extensible run catalog', () => {
  const catalog = {
    schemaVersion: 1,
    runs: [
      { id: 'default_sv0', label: 'Baseline', conditionCategory: 'baseline', seed: 0, manifestUrl: 'default_sv0/manifest.json' },
      { id: 'exp_25%_150_sv0', label: 'Experience strengthened', conditionCategory: 'experience-strengthened', seed: 0, manifestUrl: 'exp_25%_150_sv0/manifest.json' },
    ],
  };
  assert.equal(validateRunCatalog(catalog).runs.length, 2);
  assert.throws(() => validateRunCatalog({ ...catalog, runs: [catalog.runs[0], catalog.runs[0]] }), /duplicate/i);
});

test('finds event positions for seeking', () => {
  const values = new Uint32Array([1, 2, 2, 7]);
  assert.equal(lowerBound(values, 0), 0);
  assert.equal(lowerBound(values, 2), 1);
  assert.equal(lowerBound(values, 3), 3);
  assert.equal(lowerBound(values, 8), 4);
});
