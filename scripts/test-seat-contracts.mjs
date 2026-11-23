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
  }
assert.equal(docs, 76);
assert.ok(
  !Object.keys(CONTRACTS).some((key) => key.startsWith('super:')),
  'no super purgatory forms',
);
console.log('PASS: reward sounds and 760 contract variants.');
