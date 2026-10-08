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
