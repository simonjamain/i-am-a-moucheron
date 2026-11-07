import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import {
  prepareRoster,
  forecast,
  directorBudget,
  resolveVote,
  purchaseBlueprint,
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
    for (const group of forecast(plan.roster)) {
      const arrivals = plan.roster.filter(
        (e) =>
          e.type === group.type &&
          e.spawn === group.spawn &&
          e.portalIndex === group.portalIndex &&
          e.routeSeed === group.routeSeed &&
          e.branch === group.branch,
      );
      assert.equal(arrivals.length, group.count);
    }
  }
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
now += 15000;
request(a.id, 'wave-vote', { preparation: prep.id, card: prep.cards[1] });
request(a.id, 'wave-vote', { preparation: prep.id, card: prep.cards[0] });
assert.equal(request(b.id, 'start', { preparation: prep.id }).phase, 'prep');
snap = request(b.id, 'wave-vote', { preparation: prep.id, card: prep.cards[0] });
assert.equal(snap.phase, 'prep');
assert.equal(snap.next_wave_at - now, 45000);
assert.equal(snap.preparation.winner, prep.cards[0]);
assert.deepEqual(snap.blueprintLevels, { [prep.cards[0]]: 1 });
const late = game.join({ code: 'PREP' });
assert.deepEqual(late.snapshot.preparation, snap.preparation);
snap = request(late.id, 'start', { preparation: prep.id });
assert.deepEqual(forecast(snap.roster), prep.groups);
assert.equal(request(b.id, 'start', { preparation: prep.id }).wave, 1);
assert.throws(
  () => request(b.id, 'wave-vote', { preparation: prep.id, card: prep.cards[1] }),
  /clos/,
);
for (const e of room.plan.roster) room.kills.add(e.id);
snap = request(a.id, 'sync', { state: a.state, mode: 'foot' });
prep = snap.preparation;
now = snap.next_wave_at;
snap = request(a.id, 'start', { preparation: prep.id });
assert.equal(snap.wave, 2);
assert.deepEqual(forecast(snap.roster), prep.groups);
assert.equal(
  Object.values(snap.blueprintLevels).reduce((a, b) => a + b),
  2,
);
for (const pick of [0, 1]) {
  const tie = {
    pilots: new Map([
      ['a', {}],
      ['b', {}],
    ]),
    blueprintLevels: {},
    preparation: { cards: ['lure', 'piercing', 'reinforced'], votes: { a: 'lure', b: 'piercing' } },
  };
  resolveVote(tie, false, () => pick);
  assert.equal(tie.preparation.winner, tie.preparation.cards[pick]);
  resolveVote(tie, true, () => 1 - pick);
  assert.deepEqual(tie.blueprintLevels, { [tie.preparation.cards[pick]]: 1 });
}
const sugar = { id: 's', kind: 'sugar', radius: 0.15 };
const vehicle = { id: 'v', type: 'fighter', state: { hp: 100 } };
const fixture = {
  blueprintLevels: { lure: 1, piercing: 1 },
  dollars: 5,
  groundDefense: { revision: 0, structures: [sugar] },
  vehicles: new Map([['v', vehicle]]),
};
purchaseBlueprint(fixture, { blueprint: 'lure', level: 1 });
assert.equal(sugar.radius, 0.25);
assert.throws(() => purchaseBlueprint(fixture, { blueprint: 'lure', level: 1 }));
purchaseBlueprint(fixture, { blueprint: 'piercing', level: 1 });
assert.equal(fixture.dollars, 0);
assert.deepEqual(vehicle.blueprints, ['piercing']);
assert.deepEqual(fixture.activeBlueprints, { lure: 1, piercing: 1 });
assert.equal(request(a.id, 'reset', { epoch: room.base.epoch }).blueprints.length, 0);
console.log(
  'Forecast, budget, tie, silence, early and deadline start, team plans, repeat purchases and reset passed.',
);

// Use the live projectile step against three aligned sphere hitboxes. A wall must
// stop a piercing round, and a round that survives a step cannot hit its first target again.
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
      pierce: 2,
      owned: true,
      baseDamage: 100,
      wave: 1,
      travelled: 0,
    },
  ];
  const colliders = wall ? [new T.Box3(new T.Vector3(1.8, -1, -1), new T.Vector3(1.9, 1, 1))] : [];
  runInNewContext(step + ';stepProjectileSlice(.5);stepProjectileSlice(3);', {
    T,
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
  assert.deepEqual(
    hits,
    wall
      ? [
          [0, 100],
          [1, 50],
        ]
      : [
          [0, 100],
          [1, 50],
          [2, 25],
        ],
  );
}
