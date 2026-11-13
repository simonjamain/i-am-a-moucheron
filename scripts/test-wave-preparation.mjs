import { rayCollider } from '../src/oriented-collider.js';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import {
  prepareRoster,
  forecast,
  directorBudget,
  packSize,
  PACKS,
} from '../server/wave-preparation.js';
import { DEFAULT_BALANCE } from '../src/balance.js';
import { ENEMY_TYPES } from '../src/waves.js';

for (const wave of [1, 2, 5, 10, 15, 100])
  for (const draw of [() => 0, (n) => n - 1, undefined]) {
    const plan = prepareRoster(wave, DEFAULT_BALANCE, draw);
    assert.equal(
      plan.roster.reduce((sum, e) => sum + ENEMY_TYPES[e.type].cost, 0),
      directorBudget(wave),
    );
    assert.ok(plan.roster.length <= 900);
    // Each announced group is one pack, whose members leave one after the other.
    for (const group of forecast(plan.roster)) {
      const members = plan.roster.filter(
        (e) =>
          e.type === group.type &&
          e.portalIndex === group.portalIndex &&
          e.routeSeed === group.routeSeed &&
          e.branch === group.branch &&
          e.spawn >= group.spawn,
      );
      assert.ok(members.length >= group.count);
      assert.equal(members.find((e) => e.spawn === group.spawn).spawn, group.spawn);
    }
    // Crowds are big, strong species walk alone, and nobody leaves on top of a packmate.
    const groups = forecast(plan.roster);
    for (const g of groups) {
      if (g.type === 'midge') assert.ok(g.count >= PACKS.midge.min, 'midge swarm ' + g.count);
      if (g.type === 'ant') assert.ok(g.count >= PACKS.ant.min, 'ant pack ' + g.count);
      if (['spider', 'rat'].includes(g.type)) assert.equal(g.count, 1, g.type + ' alone');
      if (g.type === 'brute') assert.ok(g.count <= 2);
      assert.ok(g.count <= PACKS[g.type].max + PACKS[g.type].min, g.type + ' pack size');
    }
    assert.ok(groups.length <= 60, 'few groups: ' + groups.length);
    for (const e of plan.roster)
      if (e.ground) {
        const mates = plan.roster.filter((o) => o.group === e.group && o.id < e.id);
        if (mates.length) assert.ok(e.spawn > mates.at(-1).spawn, 'staggered departures');
      }
  }
// Ants are more numerous every wave; midge swarms reach the hundreds.
const ants = (wave) =>
  prepareRoster(wave, DEFAULT_BALANCE, () => 0).roster.filter((e) => e.type === 'ant').length;
assert.ok(ants(1) >= 8 && ants(5) > ants(1) && ants(10) > ants(5), 'ants grow');
assert.ok(
  prepareRoster(10, DEFAULT_BALANCE, (n) => n - 1).roster.filter((e) => e.type === 'midge')
    .length >= 300,
  'swarms of hundreds of midges',
);
// Pack sizes: cheap crowds up to hundreds, the stronger the species the smaller the pack.
const sizes = Object.keys(PACKS).map((t) => packSize(t, 2400, (n) => n - 1));
assert.deepEqual(
  sizes,
  [...sizes].sort((a, b) => b - a),
  'bigger species, smaller packs',
);
assert.equal(packSize('rat', 2400), 1);
let now = 100000;
const game = new Game({ now: () => now }),
  a = game.join({ code: 'PREP' }),
  b = game.join({ code: 'PREP' });
const room = game.rooms.get('PREP');
const request = (id, path, body = {}) => {
  for (const p of room.pilots.values()) p.seen = now;
  return game.command(room.code, id, path, body);
};
let snap = request(a.id, 'start'),
  prep = snap.preparation;
assert.equal(snap.next_wave_at, now + 60000);
assert.equal(snap.dollars, 0);
const loan = snap.bank.slots[0];
assert.ok(
  request(a.id, 'bank-sign', {
    epoch: room.base.epoch,
    slot: 0,
    serial: loan.serial,
    signature: true,
  }).dollars >= 12,
);
assert.equal(
  prep.groups.reduce((sum, g) => sum + g.count, 0),
  32,
);
// No vote and no cards: the preparation only announces the wave.
for (const key of ['cards', 'votes', 'winner']) assert.equal(prep[key], undefined, key);
for (const key of ['blueprints', 'blueprintLevels', 'activeBlueprints'])
  assert.equal(snap[key], undefined, key);
const late = game.join({ code: 'PREP' });
assert.deepEqual(late.snapshot.preparation, snap.preparation);
// Any player launches early; a stale or repeated launch starts nothing more.
now += 15000;
snap = request(b.id, 'start', { preparation: prep.id });
assert.equal(snap.wave, 1);
assert.equal(snap.phase, 'combat');
assert.deepEqual(forecast(snap.roster), prep.groups);
assert.equal(request(late.id, 'start', { preparation: prep.id }).wave, 1);
for (const e of room.plan.roster) room.kills.add(e.id);
snap = request(a.id, 'sync', { state: a.state, mode: 'foot' });
prep = snap.preparation;
assert.equal(snap.next_wave_at - now, 60000, 'one-minute countdown');
// Without anybody launching, the countdown starts the announced wave.
now = snap.next_wave_at;
snap = request(a.id, 'sync', { state: a.state, mode: 'foot' });
assert.equal(snap.wave, 2);
assert.deepEqual(forecast(snap.roster), prep.groups);
assert.equal(request(a.id, 'reset', { epoch: room.base.epoch }).wave, 0);
assert.throws(() => request(a.id, 'wave-vote', { preparation: prep.id }));
assert.throws(() => request(a.id, 'wave-buy', { blueprint: 'lure', level: 1 }));
console.log(
  'Forecast, budget, early start by any player, countdown start, no vote, no team plans, reset passed.',
);

// Use the live projectile step against three aligned sphere hitboxes: a round
// stops at the first insect (no piercing bonus any more).
const { readFileSync } = await import('node:fs');
const { runInNewContext } = await import('node:vm');
const T = await import('../vendor/three.module.min.js');
const { nearestInsectHit } = await import('../src/insect-hits.js');
const src = readFileSync('src/client.js', 'utf8');
const step = src.slice(
  src.indexOf('function stepProjectileSlice('),
  src.indexOf('// Fixed timestep flight:'),
);
for (const wall of [false, true]) {
  const scene = new T.Scene(),
    insects = new Map(),
    hits = [];
  for (let index = 0; index < 3; index++) {
    const object = new T.Object3D();
    object.userData.sphereRadius = 0.12;
    object.position.x = index + 0.5;
    scene.add(object);
    insects.set(index, object);
  }
  const model = new T.Object3D();
  model.userData.dispose = () => {};
  const trails = [
    {
      m: model,
      v: new T.Vector3(1, 0, 0),
      life: 5,
      owned: true,
      baseDamage: 100,
      wave: 1,
      travelled: 0,
    },
  ];
  const colliders = wall ? [new T.Box3(new T.Vector3(1.8, -1, -1), new T.Vector3(1.9, 1, 1))] : [];
  runInNewContext(step + ';stepProjectileSlice(.5);stepProjectileSlice(3);', {
    T,
    rayCollider,
    scene,
    trails,
    colliders,
    insects,
    nearestInsectHit,
    insectIndex: null,
    camera: null,
    stepBallisticVelocity() {},
    updateTracer() {},
    sound: { play() {} },
    hitEffects: { burst() {} },
    respawnAt: 0,
    snap: { wave: 1 },
    localKills: new Set(),
    damageEnemy(id, amount) {
      hits.push([id, amount]);
    },
  });
  assert.deepEqual(hits, [[0, 100]]);
}
