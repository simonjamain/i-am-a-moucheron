import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import { synthesize, AUDIO_PROFILES } from '../src/game-audio/synth.ts';
import { swarmAudioGroups } from '../src/game-audio/swarm.ts';
for (const kind of Object.keys(AUDIO_PROFILES)) {
  const b = synthesize(kind);
  assert.ok(b.length > 1000);
  assert.ok(b.every(Number.isFinite));
  assert.ok(Math.max(...b) <= 1 && Math.min(...b) >= -1);
  assert.ok(b.some((x) => Math.abs(x) > 0.05));
}
// Ten thousand insects share a bounded number of spatial sound emitters.
const midges = new Map();
for (let i = 0; i < 10000; i++) {
  const x = [0.35, 1.25, -1.45][i % 3] + (i % 7) * 0.0001;
  midges.set(i, { visible: true, position: { x, y: 0.07, z: 0.08 } });
}
const listener = { x: 0, y: 0, z: 0 };
const options = { cellSize: 0.12, maxDistance: 5, maxSources: 5 };
const grouped = swarmAudioGroups(midges, listener, options);
assert.equal(grouped.length, 3);
assert.equal(
  grouped.reduce((n, group) => n + group.count, 0),
  10000,
);
assert.ok(grouped.some((group) => group.position.x < 0));
assert.ok(grouped.some((group) => group.position.x > 0));
assert.ok(grouped.every((group) => group.level <= 1.5));
const keys = new Set(grouped.map((group) => group.key));
midges.delete(0);
const reduced = swarmAudioGroups(midges, listener, {
  ...options,
  preferred: keys,
});
assert.deepEqual(
  new Set(reduced.map((group) => group.key)),
  keys,
  'a removed insect must not restart surviving swarm sounds',
);
assert.equal(
  reduced.reduce((n, group) => n + group.count, 0),
  9999,
);
midges.set('far', { visible: true, position: { x: 100, y: 0, z: 0 } });
midges.set('hidden', { visible: false, position: { x: 0, y: 0, z: 0 } });
midges.set('invalid', { visible: true, position: { x: NaN, y: 0, z: 0 } });
const validGroups = swarmAudioGroups(midges, listener, options);
assert.equal(
  validGroups.reduce((n, group) => n + group.count, 0),
  9999,
);
const twoSources = swarmAudioGroups(midges, listener, { ...options, maxSources: 2 });
assert.equal(twoSources.length, 2);
assert.deepEqual(swarmAudioGroups(new Map(), listener, options), []);
const benchStart = performance.now();
for (let i = 0; i < 20; i++) swarmAudioGroups(midges, listener, options);
console.log(
  JSON.stringify({
    swarmInsects: 10000,
    swarmSources: grouped.length,
    averageCpuMs: +((performance.now() - benchStart) / 20).toFixed(2),
    refreshMs: 100,
    note: 'CPU only, not actual HRTF output',
  }),
);

console.log(
  'PASS: finite procedural mono buffers for every profile; swarms share a bounded, stable set of spatial emitters.',
);
