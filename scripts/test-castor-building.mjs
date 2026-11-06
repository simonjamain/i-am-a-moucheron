import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { VEHICLES } from '../src/fleet.js';

let now = 100000;
const game = new Game({ now: () => now });
const join = game.join({ code: 'CASTOR', name: 'Constructeur' });
const r = game.rooms.get('CASTOR');
const p = r.pilots.get(join.id);
const v = game.createVehicle(r, 'castor');
v.state.p = [0, VEHICLES.castor.gear, 0];
v.state.landed = true;
v.seats.set('pilot', join.id);
p.mode = 'flight';
p.seat = 'pilot';
p.vehicle_id = v.id;
r.dollars = 15;
const run = (values) =>
  game.command('CASTOR', join.id, 'ground-defense', {
    epoch: r.base.epoch,
    ...values,
  });
let s = run({
  action: 'build', kind: 'barricade', a: [0, 0], b: [0.08, 0], request: 'castor:one',
});
assert.equal(s.dollars, 14);
assert.equal(s.groundDefense.structures.length, 1);
s = run({ action: 'build', kind: 'barricade', a: [0, 0], b: [0.08, 0], request: 'castor:one' });
assert.equal(s.dollars, 14, 'retry must not charge twice');
assert.equal(s.groundDefense.structures.length, 1);
s = run({
  action: 'build', kind: 'barricade', a: [0.08, 0], b: [0.16, 0], request: 'castor:two',
});
assert.equal(s.dollars, 13);
assert.equal(s.groundDefense.structures.length, 2);
assert.throws(
  () => run({ action: 'build', kind: 'sugar', a: [1, 1], request: 'castor:far' }),
  /proximité/,
);
assert.throws(
  () => run({ action: 'build', kind: 'sticky', a: [0, 0], b: [1, 0], request: 'castor:long' }),
  /près/,
);
v.state.landed = false;
assert.throws(
  () => run({ action: 'build', kind: 'fan', a: [0, 0], request: 'castor:air' }),
  /sol/,
);
v.state.landed = true;
const cash = r.dollars;
s = run({ action: 'build', kind: 'sugar', a: [0, 0.2], request: 'castor:sugar' });
assert.equal(s.dollars, cash - 3);
v.state.hp = 0;
assert.throws(
  () => run({ action: 'build', kind: 'fan', a: [0, 0], request: 'castor:dead' }),
  /réservée/,
);
console.log('Castor construction: driver authorization, continuous segments, receipts, distance, floor and destruction OK');

import prettier from 'prettier';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
for (const path of [
  'server/game.js',
  'src/client.js',
  'src/ground-defense-ui.js',
  'docs/code-structure.md',
  'scripts/test-castor-building.mjs',
]) {
  if (path === 'scripts/test-castor-building.mjs') continue;
  const input = readFileSync(path, 'utf8');
  const output = await prettier.format(input, {
    ...(await prettier.resolveConfig(path)),
    filepath: path,
  });
  if (input === output) continue;
  const tmp = mkdtempSync(join(tmpdir(), 'g1b-prettier-'));
  writeFileSync(join(tmp, 'before'), input);
  writeFileSync(join(tmp, 'after'), output);
  try {
    execFileSync('git', ['diff', '--no-index', '--', join(tmp, 'before'), join(tmp, 'after')], {
      encoding: 'utf8',
    });
  } catch (error) {
    console.log('BEGIN G1B FORMAT DIFF ' + path);
    console.log(error.stdout);
    console.log('END G1B FORMAT DIFF ' + path);
  }
}
