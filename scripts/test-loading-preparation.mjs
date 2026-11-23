import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from '../vendor/three.module.min.js';
import { MIDGE } from '../src/midge-model.ts';
import { WALKERS, WalkerBatch } from '../src/walker-batch.js';
import { MidgeBatch } from '../src/midge-batch.js';
import { CreatureBatch, prepareCreatureVat } from '../src/creature-batch.ts';

let ticks = 0;
const heartbeat = setInterval(() => ticks++, 1);
const start = performance.now();
const scene = new T.Scene();
const prepared = {};
try {
  for (const [type, creature] of [
    ['midge', MIDGE],
    ...Object.entries(WALKERS).map(([type, w]) => [type, w.creature]),
  ]) {
    const before = ticks;
    let started = false,
      completed = false,
      midBakeYields = 0;
    const observed = {
      ...creature,
      *bakeSteps(...args) {
        started = true;
        const result = yield* creature.bakeSteps(...args);
        completed = true;
        return result;
      },
    };
    prepared[type] = await prepareCreatureVat(T, observed, {
      yieldControl: async () => {
        if (started && !completed) midBakeYields++;
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
    });
    assert.ok(midBakeYields > 0, type + ': yields within the bake, not just before/after it');
    assert.ok(ticks > before, type + ': browser tasks can run during preparation');
    // Bit-for-bit equivalence of the real packed animations, including normals.
    const sync = new CreatureBatch(T, scene, creature);
    assert.deepEqual(
      prepared[type].texture.image.data,
      sync.vat.texture.image.data,
      type + ': animation unchanged',
    );
    sync.dispose();
  }
} finally {
  clearInterval(heartbeat);
}
const midge = new MidgeBatch(T, scene, { vat: prepared.midge });
const walkers = new WalkerBatch(T, scene, { vats: prepared });
assert.equal(
  midge.detail.vat,
  prepared.midge,
  'constructor consumes prepared animation without rebaking',
);
for (const type of Object.keys(WALKERS)) assert.equal(walkers.batches[type].vat, prepared[type]);
const client = await readFile(new URL('../src/client.js', import.meta.url), 'utf8');
assert.match(client, /await prepareCreatureVat\(T, MIDGE\)/);
assert.match(client, /await prepareCreatureVat\(T, walker.creature\)/);
assert.match(client, /vat: midgeVat/);
assert.match(client, /vats: walkerVats/);
assert.ok(
  client.indexOf('await prepareCreatureVat') < client.indexOf('requestAnimationFrame(frame)'),
  'main loop starts after preparation',
);
console.log(
  JSON.stringify({
    animationOpportunities: ticks,
    totalWithReferenceBakesMs: +(performance.now() - start).toFixed(1),
    scope: 'CPU lifecycle and exact animation data, not GPU frame time',
  }),
);
