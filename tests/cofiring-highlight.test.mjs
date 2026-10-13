import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { COFIRING_SAMPLE_LOCAL_IDS, COFIRING_THRESHOLD, sampledCofiringNeuronIds, parseCofiringEdges, selectCofiringEdges, buildCofiringPulseTicks, cofiringPulseIntensity } from '../src/lib/cofiring-highlight.ts';
import { parseSpikeDataset, validateManifest } from '../src/lib/network-data.ts';

test('maps all 50 CA1 sample indices using the population offset, not PFC global IDs', () => {
  const ids = sampledCofiringNeuronIds([
    { id: 'pfc-py', idStart: 0, count: 1000 },
    { id: 'ca1-py', idStart: 2350, count: 1000 },
  ]);
  assert.equal(ids.size, 50);
  assert.ok(ids.has(2498)); // CA1 local index 148.
  assert.ok(ids.has(3308)); // CA1 local index 958.
  for (const localId of COFIRING_SAMPLE_LOCAL_IDS) {
    assert.ok(ids.has(2350 + localId));
    assert.ok(!ids.has(localId));
  }
  assert.equal(sampledCofiringNeuronIds([{ id: 'pfc-py', idStart: 0, count: 1000 }]).size, 0);
});

test('loads the real baseline pairs with correct offsets and threshold counts', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/pfc-hpc/default_sv0/cofiring.json', import.meta.url), 'utf8'));
  const populations = [{ id: 'ca1-py', idStart: 2350, count: 1000 }];
  const edges = parseCofiringEdges(data, 'default_sv0', populations);
  assert.equal(data.edges.length, 1000);
  assert.equal(edges.length, 557);
  assert.ok(edges.every((edge) => edge.score > 0));
  assert.deepEqual(edges[0], { sourceId: 2498, targetId: 2703, score: data.edges[0].score });
  assert.deepEqual([2, 3, 4, 5].map((threshold) => selectCofiringEdges(edges, threshold).length), [193, 64, 14, 1]);
  assert.throws(() => parseCofiringEdges(data, 'another-run', populations));
  assert.throws(() => parseCofiringEdges({ ...data, edges: [{ sourceLocalId: 148, targetLocalId: 0, score: 6 }] }, 'default_sv0', populations));
  assert.throws(() => parseCofiringEdges({ ...data, edges: [data.edges[0], data.edges[0]] }, 'default_sv0', populations));
  assert.throws(() => parseCofiringEdges({ ...data, edges: [{ ...data.edges[0], score: -5 }] }, 'default_sv0', populations));
});

test('thresholds are strictly positive and exclude equality and nonfinite scores', () => {
  const edges = [2, 2.001, -5, NaN, Infinity].map((score) => ({ sourceId: 2498, targetId: 2703, score }));
  assert.deepEqual(selectCofiringEdges(edges, 2).map((edge) => edge.score), [2.001]);
  assert.deepEqual(selectCofiringEdges(edges, -10).map((edge) => edge.score), [2, 2.001]);
});

const pulseEdge = { sourceId: 0, targetId: 1, score: 5 };

test('pair pulses include 50 ms and simultaneous spikes, and exclude spikes farther apart', () => {
  const spikes = {
    times: new Uint32Array([0, 1000, 2020, 4000, 4000]),
    neuronIds: new Uint16Array([0, 1, 0, 0, 1]),
  };
  const ticks = buildCofiringPulseTicks([pulseEdge], spikes, 0.05).get(pulseEdge);
  assert.deepEqual([...ticks], [1000, 4000]); // 50 ms qualifies; 51 ms does not.
  assert.equal(cofiringPulseIntensity(pulseEdge, 'paired', new Int32Array([-1, -1]), ticks, 0.05, 49), 0);
  assert.equal(cofiringPulseIntensity(pulseEdge, 'paired', new Int32Array([-1, -1]), ticks, 0.05, 50), 1);
});

test('either mode fires with one endpoint; paired mode waits for the other endpoint', () => {
  const spikes = { times: new Uint32Array([100, 130, 190]), neuronIds: new Uint16Array([0, 1, 0]) };
  const ticks = buildCofiringPulseTicks([pulseEdge], spikes, 1).get(pulseEdge);
  assert.deepEqual([...ticks], [130]);
  const last = new Int32Array([100, -1_000_000_000]);
  assert.equal(cofiringPulseIntensity(pulseEdge, 'either', last, ticks, 1, 100), 1);
  assert.equal(cofiringPulseIntensity(pulseEdge, 'paired', last, ticks, 1, 100), 0);
  last.set([190, 130]);
  assert.equal(cofiringPulseIntensity(pulseEdge, 'either', last, ticks, 1, 190), 1);
  // An unmatched later source spike does not erase a prior paired glow.
  assert.equal(cofiringPulseIntensity(pulseEdge, 'paired', last, ticks, 1, 190), Math.exp(-60 / 72));
  assert.ok(cofiringPulseIntensity(pulseEdge, 'paired', last, ticks, 1, 430) > 0);
  assert.equal(cofiringPulseIntensity(pulseEdge, 'paired', last, ticks, 1, 431), 0);
  // Backward seeks never use a future match.
  assert.equal(cofiringPulseIntensity(pulseEdge, 'paired', last, ticks, 1, 120), 0);
});

test('no spikes or one silent endpoint never creates a paired pulse', () => {
  const ticks = buildCofiringPulseTicks([pulseEdge], { times: new Uint32Array([20, 30]), neuronIds: new Uint16Array([0, 0]) }, 1).get(pulseEdge);
  assert.equal(ticks.length, 0);
  assert.equal(cofiringPulseIntensity(pulseEdge, 'paired', new Int32Array([30, -1]), ticks, 1, 30), 0);
  assert.equal(cofiringPulseIntensity(pulseEdge, 'either', new Int32Array([-1, -1]), ticks, 1, 0), 0);
});

test('comparison runs use their own scores and spike times at the fixed threshold', async () => {
  assert.equal(COFIRING_THRESHOLD, 3);
  for (const [runId, expectedCount] of [['default_sv0', 64], ['exp_25%_150_sv0', 119]]) {
    const base = new URL(`../public/data/pfc-hpc/${encodeURIComponent(runId)}/`, import.meta.url);
    const manifest = validateManifest(JSON.parse(await readFile(new URL('manifest.json', base), 'utf8')));
    const data = JSON.parse(await readFile(new URL('cofiring.json', base), 'utf8'));
    const edges = selectCofiringEdges(parseCofiringEdges(data, runId, manifest.populations), COFIRING_THRESHOLD);
    assert.equal(edges.length, expectedCount);
    const buffer = await readFile(new URL(manifest.spikeFile, base));
    const spikes = parseSpikeDataset(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), manifest);
    const pulses = buildCofiringPulseTicks(edges, spikes, manifest.tickMs);
    const times = new Map();
    for (const edge of edges) {
      times.set(edge.sourceId, []);
      times.set(edge.targetId, []);
    }
    for (let i = 0; i < spikes.times.length; i++) times.get(spikes.neuronIds[i])?.push(spikes.times[i]);
    let matched = 0;
    for (const edge of edges) {
      const source = times.get(edge.sourceId);
      const target = times.get(edge.targetId);
      // Independently enumerate every endpoint spike with a preceding partner
      // within 50 ms, rather than relying on the renderer's last spike state.
      const expected = [...new Set([
        ...source.filter((tick) => target.some((other) => other <= tick && tick - other <= 50 / manifest.tickMs)),
        ...target.filter((tick) => source.some((other) => other <= tick && tick - other <= 50 / manifest.tickMs)),
      ])].sort((a, b) => a - b);
      assert.deepEqual([...pulses.get(edge)], expected);
      matched += expected.length;
    }
    assert.ok(matched > 0);
    assert.throws(() => parseCofiringEdges(data, runId === 'default_sv0' ? 'exp_25%_150_sv0' : 'default_sv0', manifest.populations));
  }
});
