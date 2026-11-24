import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import { ENEMY_TYPES } from '../src/waves.ts';
import { blastDamage } from '../src/combat.ts';
assert.deepEqual(Object.fromEntries(Object.entries(ENEMY_TYPES).map(([k, v]) => [k, v.hp])), {
  ant: 100,
  roach: 400,
  midge: 100,
  guard: 600,
  brute: 1500,
  mosquito: 150,
  rat: 10000,
  spider: 1200,
  spiderling: 10,
});
assert.equal(blastDamage(0, 10), 80);
assert.equal(blastDamage(10, 10), 20);
assert.equal(blastDamage(10.01, 10), 0);
// Direct shells consume their only impact; no splash reaches the neighbour.
const { shellImpact } = await import('../src/combat.ts');
for (const hp of [100, 300, 800]) {
  const hit = shellImpact({ id: 0 }, 0, 100);
  assert.equal(hit.kind, 'direct');
  assert.equal(hit.damage, 200);
  assert.equal(Math.max(0, hp - hit.damage), Math.max(0, hp - 200));
}
assert.equal(shellImpact({ wall: true }, 10, 100).kind, 'inert');
assert.equal(shellImpact({ wall: true }, 100, 100).kind, 'blast');
console.log('PASS: damage scale, direct/safe/obstacle shell classification.');
