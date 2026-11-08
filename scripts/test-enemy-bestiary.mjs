import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import {
  ENEMY_TYPES,
  debugSwarmRoster,
  swarmFrame,
  validateDebugSpawn,
  wavePlan,
} from '../src/waves.js';

assert.equal(ENEMY_TYPES.rat.hp, 5000);
assert.equal(ENEMY_TYPES.mosquito.hp, 70);
assert.equal(ENEMY_TYPES.spider.hp, 1200);
assert.equal(ENEMY_TYPES.spider.onDeath.count, 100);
assert.equal(ENEMY_TYPES.spiderling.leak, 1);
assert.throws(() => validateDebugSpawn({ spiderling: 1 }), /invalide/);
for (const w of [1, 2, 3, 10]) {
  const types = wavePlan('BESTIARY', w).roster.map((e) => e.type);
  if (w < 3) assert.ok(!types.includes('mosquito'));
  if (w < 11) assert.ok(!types.includes('spider'));
  if (w < 15) assert.ok(!types.includes('rat'));
  assert.ok(!types.includes('spiderling'));
}
let now = 100000;
const game = new Game({ now: () => now });
const a = game.join({ code: 'BROOD', name: 'Joueur' });
const r = game.rooms.get('BROOD');
const command = (path, b) => game.command('BROOD', a.id, path, b);
// Nobody fires on foot in the office: hits come from a fixed gun operator.
function gunShot() {
  r.pilots.get(a.id).mode = 'turret';
}
// Exact test roster (the in-game manual swarm tool was removed by issue #100).
Object.assign(r, { phase: 'combat', wave: 1, started: now, mission_started: 1, next_wave_at: 0 });
r.upcomingPlan = r.preparation = null;
r.plan = {
  budget: 0,
  roster: debugSwarmRoster(
    { spider: 1, rat: 1, mosquito: 1 },
    { room: r.code, wave: 1, started: now, now, balance: r.balance, firstId: 0, revision: 1 },
  ),
};
r.rosterRevision = 1;
assert.equal(r.plan.roster.length, 3);
const mother = r.plan.roster[0];
assert.deepEqual(swarmFrame(r.plan.roster, 5), swarmFrame(r.plan.roster, 5));
now = r.started + (mother.spawn + mother.entryHold + 1) * 1000;
gunShot();
command('hit', { wave: r.wave, enemy: 0, amount: 800, shot: 'one' });
assert.equal(r.plan.roster.length, 3);
gunShot();
command('hit', { wave: r.wave, enemy: 0, amount: 800, shot: 'two' });
assert.equal(r.plan.roster.length, 103);
assert.equal(r.rosterRevision, 2);
assert.deepEqual(
  r.plan.roster.slice(3).map((e) => e.id),
  Array.from({ length: 100 }, (_, i) => i + 3),
);
assert.ok(
  r.plan.roster
    .slice(3)
    .every((e) => e.type === 'spiderling' && e.leak === 1 && e.offspringOf === 0),
);
gunShot();
command('hit', { wave: r.wave, enemy: 0, amount: 800, shot: 'three' });
assert.equal(r.plan.roster.length, 103);
assert.equal(r.souls.size, 1);
const state = r.pilots.get(a.id);
const snapshot = command('sync', { state: state.state, mode: state.mode });
assert.equal(snapshot.total, 103);
assert.equal(snapshot.rosterRevision, 2);
assert.ok(snapshot.kills.includes(0));
// Every surviving child arrives separately: 100 infestation means defeat.
for (const child of r.plan.roster.slice(3)) child.spawn = -child.duration - 1;
now += 30000000;
game.advance(r);
assert.equal(r.phase, 'lost');
assert.ok(r.infestation >= 100);
console.log('Bestiaire : OK');
