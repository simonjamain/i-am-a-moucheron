import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import { CONTRACTS, ContractBook } from '../src/contracts.ts';
import { RewardQueue } from '../src/rewards.ts';
import { synthesize } from '../src/game-audio/synth.ts';
let count = 0;
const rewards = new RewardQueue(() => count++);
rewards.observe(5);
rewards.tick(0);
assert.equal(count, 0);
rewards.observe(8);
rewards.observe(8);
for (let t = 0; t < 1000; t += 40) rewards.tick(t);
assert.equal(count, 3);
rewards.observe(0, true);
rewards.tick(2000);
assert.equal(count, 3);
assert.ok(synthesize('dollar').some((v) => v !== 0));
let docs = 0;
const book = new ContractBook(() => 0);
for (const [key, forms] of Object.entries(CONTRACTS))
  for (const [i, variants] of forms.entries()) {
    docs++;
    assert.equal(variants.length, 10);
    assert.equal(new Set(variants.map((v) => v.text)).size, 10);
    const first = book.get(key, i, 'first');
    assert.strictEqual(book.get(key, i, 'first'), first);
    assert.notEqual(book.get(key, i, 'second').text, first.text);
    if (key.startsWith('super:'))
      assert.ok(
        first.text.length >
          3 * Math.max(...CONTRACTS['purgatory:soul'].flat().map((v) => v.text.length)),
      );
  }
assert.equal(docs, 81);
console.log('PASS: reward sounds and 810 contract variants.');
const T = await import('../vendor/three.module.min.js');
const { stepVacantAircraft } = await import('../src/vacant-flight.ts');
const { VEHICLES } = await import('../src/fleet.ts');
const { MAP } = await import('../src/scale.ts');
const vacant = {
  p: [0, 2, 0],
  q: [0, 0, 0, 1],
  v: [0, 0, -MAP.metres(30)],
  hp: 100,
  engine: 1,
  wing: 1,
  landed: false,
  gas: 0.65,
};
for (let i = 0; i < 120; i++) stepVacantAircraft(T, vacant, VEHICLES.bomber, [], 1 / 120);
assert.ok(vacant.p[2] < -0.05);
assert.ok(vacant.p[1] < 2);
console.log('PASS: vacant cockpit physics.');
