import assert from 'node:assert/strict';
import { Game, initialStation } from '../server/game.js';
import { PISTOL_CAPACITY } from '../src/ground-ammo.js';
import { advancePaidService } from '../src/paid-service.js';
import { newGroundDefense } from '../src/ground-defense-state.js';

let now = 100000;
const game = new Game({ now: () => now });
const joined = game.join({ code: 'PISTOL', name: 'Tireuse' });
const r = game.rooms.get('PISTOL'), p = r.pilots.get(joined.id);
assert.equal(PISTOL_CAPACITY, 120);
assert.equal(p.pistolAmmo, PISTOL_CAPACITY);
const trigger = (shot) =>
  game.command('PISTOL', p.id, 'pistol-trace', {
    shot, incarnation: p.incarnation, origin: [0, 0, 0], direction: [0, 0, -1],
  });
trigger('first');
assert.equal(p.pistolAmmo, PISTOL_CAPACITY - 1);
trigger('first');
assert.equal(p.pistolAmmo, PISTOL_CAPACITY - 1, 'retry does not consume ammo');
assert.equal(game.pistolImpact(r, p, 'first'), true);
assert.equal(game.pistolImpact(r, p, 'first'), false);
assert.throws(() => game.pistolImpact(r, p, 'forged'), /non validé/);
p.pistolAmmo = 0;
assert.throws(() => trigger('empty'), /court de munitions/);
p.pistolAmmo = 1;
const away = {
  pilot: p, position: [3, 0, 3],
};
const near = {
  pilot: p, position: [0.02, 0, 0.02],
};
assert.equal(advancePaidService([], [initialStation()], 1, {}, 1, newGroundDefense(), [away]).spent, 0);
const station = { kind: 'refuel', x: 0, y: 0, z: 0 };
const supplied = advancePaidService([], [station], 0.004, {}, 1, null, [near]);
assert.equal(supplied.dollars, 0);
assert.ok(Math.abs(p.pistolAmmo - 5) < 1e-8, 'four rounds supplied for 0.004 $');
assert.equal(advancePaidService([], [station], -1, {}, 1, null, [near]).spent, 0);
p.pistolAmmo = 0;
const castor = {
  type: 'castor', state: { hp: 100, engine: 1, wing: 1, p: [0, 0.3, 0] },
  supplies: { fuel: 300, ammo: { pilot: 500 }, revision: 0 },
};
assert.ok(advancePaidService([castor], [], 1, {}, 1, null, [near]).spent > 0);
assert.ok(p.pistolAmmo > 0, 'Castor recharges a pedestrian inside the sphere');
game.kill(r, p, p.incarnation);
assert.equal(p.pistolAmmo, PISTOL_CAPACITY, 'new purgatory incarnation has finite fresh stock');
assert.equal(p.life, 'dead');
const purg = advancePaidService([], [station], 1, {}, 1, null, [{ pilot: p, position: [0,0,0] }]);
assert.equal(purg.spent, 0, 'dead characters cannot refill from office service');
game.command('PISTOL', p.id, 'enter-purgatory', { incarnation: p.incarnation });
trigger('purgatory-first');
assert.equal(p.pistolAmmo, PISTOL_CAPACITY - 1);
const before = p.incarnation;
game.command('PISTOL', p.id, 'reset', { epoch: r.base.epoch });
assert.equal(p.incarnation, before + 1);
assert.equal(p.pistolAmmo, PISTOL_CAPACITY);
console.log('Pistol: finite magazine, idempotence, impact receipts, paid infantry service, afterlife/reset OK');

import prettier from 'prettier';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pathJoin } from 'node:path';
import { execFileSync } from 'node:child_process';
const fmtPath = 'server/game.js';
const beforeFormat = readFileSync(fmtPath, 'utf8');
const afterFormat = await prettier.format(beforeFormat, {
  ...(await prettier.resolveConfig(fmtPath)), filepath: fmtPath,
});
if (beforeFormat !== afterFormat) {
  const dir = mkdtempSync(pathJoin(tmpdir(), 'pistol-prettier-'));
  writeFileSync(pathJoin(dir, 'before'), beforeFormat);
  writeFileSync(pathJoin(dir, 'after'), afterFormat);
  try {
    execFileSync('git', ['diff', '--no-index', '--', pathJoin(dir, 'before'), pathJoin(dir, 'after')], { encoding: 'utf8' });
  } catch (error) {
    console.log('BEGIN PISTOL FORMAT DIFF');
    console.log(error.stdout);
    console.log('END PISTOL FORMAT DIFF');
  }
}
