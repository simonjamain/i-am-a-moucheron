// The tank's armour-piercing shell goes through enemies (800, then 80 % of the remaining damage per enemy)
// and only stops on the scenery; the HE shell and the mobile AA blast are checked too.
import assert from 'node:assert/strict';
import { stepHeavy } from '../src/heavy-sim.js';
import { HEAVY, TANK_MG, CASTOR_GUN_DAMAGE, AP_PIERCE_KEEP, heavyDamage } from '../src/armament.ts';
import { FLAK, MAP } from '../src/scale.ts';

assert.equal(HEAVY.ap.damage, 800);
assert.equal(AP_PIERCE_KEEP, 0.8);
assert.equal(HEAVY.he.damage, 320);
assert.equal(HEAVY.he.edge, 30);
assert.equal(HEAVY.he.radius, MAP.metres(20));
assert.equal(heavyDamage('he', 0), 320);
assert.equal(heavyDamage('he', MAP.metres(20)), 30);
assert.equal(TANK_MG.pilot.damage, 33);
assert.equal(TANK_MG.coax.damage, 50);
assert.equal(CASTOR_GUN_DAMAGE, 40);
assert.equal(HEAVY.proximity.radius, MAP.metres(FLAK.lightRadius));
assert.equal(HEAVY.proximity.damage, 80);
assert.equal(HEAVY.proximity.edge, 20);

const z = (m) => -MAP.metres(m);
const enemyAt = [z(20), z(40), z(60)];
const roster = enemyAt.map(() => ({ type: 'ant', size: 1 }));
const dead = new Set();
const wall = (at) => ({
  min: { x: -10, y: 0, z: at - 0.01 },
  max: { x: 10, y: 10, z: at },
});
const run = (solids) => {
  const shell = {
    shot: 'ap1',
    weapon: 'ap',
    p: [0, MAP.metres(1), 0],
    v: [0, 0, -HEAVY.ap.speed],
    at: 0,
    updated: 0,
    age: 0,
    bonus: 1,
  };
  const world = {
    solids,
    vehicles: [],
    players: [],
    equipment: [],
    roster,
    killed: (i) => dead.has(i),
    frames: () => enemyAt.map((zz) => ({ p: [0, MAP.metres(1), zz] })),
  };
  const hits = [];
  let impact = null;
  for (let t = 1; t <= 2000 && !shell.done; t++) {
    impact = stepHeavy(shell, t * 10, world) || impact;
    // Reported on contact, while the shell is still flying.
    if (shell.fresh?.length) hits.push(...shell.fresh.splice(0));
  }
  return { impact, hits };
};
const open = run([]);
assert.deepEqual(
  open.hits.map((e) => [e[0], Math.round(e[1])]),
  [
    [0, 800],
    [1, 640],
    [2, 512],
  ],
  'each enemy crossed takes the remaining damage; the shell keeps 80 % per enemy',
);
const walled = run([wall(z(50))]);
assert.deepEqual(
  walled.hits.map((e) => e[0]),
  [0, 1],
  'a wall stops the shell: the enemy behind it is spared',
);
assert.equal(walled.impact.hit.solid, true);
console.log('PASS: tank AP pierces enemies, stops on walls; HE/AA/MG stats updated.');
