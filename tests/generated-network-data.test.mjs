import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  parseSignalDataset,
  parseSpikeDataset,
  validateEventsDocument,
  validateManifest,
  validateRunCatalog,
} from '../src/lib/network-data.ts';
import { parseCofiringEdges } from '../src/lib/cofiring-highlight.ts';
import { createHash } from 'node:crypto';

const dataRoot = path.resolve('public/data/pfc-hpc');

function asArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

test('committed schema-v2 run catalog and payloads are internally consistent', async () => {
  const catalog = validateRunCatalog(JSON.parse(await readFile(path.join(dataRoot, 'runs.json'), 'utf8')));
  assert.deepEqual(catalog.runs.map((run) => run.id), ['default_sv0', 'exp_25%_150_sv0']);
  assert.deepEqual(catalog.runs.map((run) => run.spwrEventCount), [26, 33]);
  assert.equal(catalog.runs[1].manifestUrl, 'exp_25%25_150_sv0/manifest.json');

  for (const run of catalog.runs) {
    const runRoot = path.join(dataRoot, run.id);
    const manifest = validateManifest(JSON.parse(await readFile(path.join(runRoot, 'manifest.json'), 'utf8')));
    assert.equal(manifest.schemaVersion, 2);
    parseSpikeDataset(asArrayBuffer(await readFile(path.join(runRoot, manifest.spikeFile))), manifest);

    for (const descriptor of manifest.signalGroups ?? []) {
      const parsed = parseSignalDataset(asArrayBuffer(await readFile(path.join(runRoot, descriptor.file))), descriptor);
      assert.equal(parsed.channelCount, descriptor.channelCount);
      assert.equal(parsed.sampleCount, descriptor.sampleCount);
    }
    for (const descriptor of manifest.voltageGroups ?? []) {
      const parsed = parseSignalDataset(asArrayBuffer(await readFile(path.join(runRoot, descriptor.file))), descriptor);
      assert.equal(parsed.channelCount, descriptor.channelCount);
      assert.equal(parsed.sampleCount, descriptor.sampleCount);
    }

    const events = validateEventsDocument(
      JSON.parse(await readFile(path.join(runRoot, manifest.events.file), 'utf8')),
      manifest.events.count,
    );
    assert.equal(events.events.length, run.spwrEventCount);
  }
});

test('disease comparisons contain distinct seed-0 runs with valid, intact payloads and cofiring data', async () => {
  const catalog = validateRunCatalog(JSON.parse(await readFile(path.join(dataRoot, 'disease-runs.json'), 'utf8')));
  assert.deepEqual(catalog.runs.map(run => run.id), [
    'def_ca3a31ca1_min_125_max_135_sv0',
    'exp25%_150_ca3a31ca1_min_125_max_135_sv0',
    'def_ca3a31_20_perc_10_sv0',
    'exp25%_150_ca3a31_20_perc_10_sv0',
  ]);
  assert.deepEqual(catalog.runs.map(run => run.spwrEventCount), [27, 34, 28, 29]);
  const spikeDigests = new Set();
  for (const run of catalog.runs) {
    const runRoot = path.join(dataRoot, run.id);
    assert.equal(decodeURIComponent(run.manifestUrl), `${run.id}/manifest.json`);
    assert.equal(run.seed, 0);
    const manifest = validateManifest(JSON.parse(await readFile(path.join(runRoot, 'manifest.json'), 'utf8')));
    assert.equal(manifest.runId, run.id);
    assert.equal(manifest.condition.seed, 0);
    const spikes = await readFile(path.join(runRoot, manifest.spikeFile));
    parseSpikeDataset(asArrayBuffer(spikes), manifest);
    assert.equal(createHash('sha256').update(spikes).digest('hex'), manifest.sha256);
    spikeDigests.add(manifest.sha256);
    for (const descriptor of [...manifest.signalGroups, ...manifest.voltageGroups]) {
      const payload = await readFile(path.join(runRoot, descriptor.file));
      parseSignalDataset(asArrayBuffer(payload), descriptor);
      assert.equal(createHash('sha256').update(payload).digest('hex'), descriptor.sha256);
    }
    const events = validateEventsDocument(JSON.parse(await readFile(path.join(runRoot, manifest.events.file), 'utf8')), manifest.events.count);
    assert.equal(events.events.length, run.spwrEventCount);
    const cofiring = JSON.parse(await readFile(path.join(runRoot, 'cofiring.json'), 'utf8'));
    const edges = parseCofiringEdges(cofiring, run.id, manifest.populations);
    assert.equal(cofiring.edges.length, 1000);
    assert.equal(edges.length, cofiring.edges.filter(edge => edge.score !== null).length);
  }
  assert.equal(spikeDigests.size, 4);
});
