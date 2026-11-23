// Saint Pierre's sky (docs/purgatory-sky.md): the passage through the office's clouds,
// what shots hit up there, and the server's rules: souls freed by a hit, Saint
// Pierre and the guard killed (10 000 life points) and back, souls boarding.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.webgpu.min.js';
import {
  SKY_FLOOR,
  CLOUD_ABOVE_SKY_FLOOR,
  buildableAltitude,
  inSky,
  outOfFlight,
  passageWhiteness,
  purgatorySolids,
  roomEntry,
  skyPassage,
} from '../src/sky-passage.ts';
import { nearestSkyTarget, raySphere, skyBlast } from '../src/sky-targets.ts';
import { OFFICE_CEILING, PURGATORY_FRAME, worldArena } from '../src/arena-frame.ts';
import { LAYOUTS } from '../src/layouts.ts';
import { MAP } from '../src/scale.ts';
import { createPurgatoryScene } from '../src/purgatory-scene.ts';
import {
  STAFF_HP,
  SOUL_ENTRANCE,
  VIP_LANE,
  advancePurgatory,
  createSoul,
  deskOccupant,
  inVipDesk,
} from '../src/purgatory-queue.ts';
import { Game } from '../server/game.js';

const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) < eps, `${label}: ${a} vs ${b}`);
const bounds = { x: 4.15, z: 3.55 };

// ---------------------------------------------------------------- the passage
assert.equal(SKY_FLOOR, OFFICE_CEILING, 'the sky starts at the former flight ceiling');
near(CLOUD_ABOVE_SKY_FLOOR / MAP.ratio, 150, 1e-6, "Saint Pierre's cloud 150 m higher");
assert.ok(inSky(SKY_FLOOR) && !inSky(SKY_FLOOR - 1e-6));
// No ceiling, no side limit in the sky; under it, the room's walls bound flights.
assert.equal(outOfFlight({ x: 0, y: 100, z: 0 }, bounds), false);
assert.equal(outOfFlight({ x: 40, y: 5, z: -40 }, bounds), false);
assert.equal(outOfFlight({ x: 5, y: 3, z: 0 }, bounds), true);
assert.equal(outOfFlight({ x: 1, y: 3, z: 1 }, bounds), false);
// Up: the room point below is remembered; down: back over it, just under the sky.
{
  const p = { x: 1.2, y: SKY_FLOOR + 0.01, z: -0.7 };
  const up = skyPassage(SKY_FLOOR - 0.01, p, null, bounds, { x: 3, z: 2 });
  assert.equal(up.crossed, 'up');
  assert.deepEqual(up.entry, { x: 1.2, z: -0.7 });
  assert.equal(up.moved, false);
  const far = { x: 25, y: SKY_FLOOR - 0.01, z: -30 };
  const down = skyPassage(SKY_FLOOR + 0.02, far, up.entry, bounds, { x: 3, z: 2 });
  assert.equal(down.crossed, 'down');
  assert.ok(down.moved && down.entry === null);
  assert.deepEqual([far.x, far.z], [1.2, -0.7], 'back over the entry');
  assert.ok(!inSky(far.y) && far.y > SKY_FLOOR - 0.02);
  // Never came up from the office (a soul that boarded up there): over the base.
  const lost = { x: -30, y: SKY_FLOOR - 0.001, z: 0 };
  skyPassage(SKY_FLOOR + 0.001, lost, null, bounds, { x: 3, z: 2 });
  assert.deepEqual([lost.x, lost.z], [3, 2]);
  // An entry outside the walls is brought back inside them.
  const inside = roomEntry({ x: 9, z: -9 }, bounds);
  assert.ok(Math.abs(inside.x) < bounds.x && Math.abs(inside.z) < bounds.z);
  // Staying on one side moves nothing.
  const stay = { x: 30, y: 10, z: 0 };
  assert.equal(skyPassage(9, stay, null, bounds, { x: 0, z: 0 }).crossed, null);
  assert.equal(stay.x, 30);
}
// The passage turns white: the office haze thickens to full white at the sky floor,
// then clears into the blue above.
assert.equal(passageWhiteness(SKY_FLOOR), 1);
assert.ok(passageWhiteness(SKY_FLOOR - 0.6) < passageWhiteness(SKY_FLOOR - 0.1));
assert.ok(passageWhiteness(SKY_FLOOR + 0.05) < 1);
assert.equal(passageWhiteness(PURGATORY_FRAME.originY), 0, 'clear at the cloud');
assert.equal(passageWhiteness(1), 0, 'clear in the room');
// Nothing is built in the sky.
assert.ok(buildableAltitude(1) && !buildableAltitude(SKY_FLOOR + 0.1));
// A refuge: the insects' air routes all stay under the sky.
for (const layout of LAYOUTS)
  for (const route of layout.airRoutes)
    for (const point of route.points ?? route)
      if (Array.isArray(point))
        assert.ok(!inSky(point[1]), layout.id + ': air route under the sky');
// The same solids for the client's decor and the server's vacant aircraft.
{
  const scene = createPurgatoryScene(T, {
    box: (parent, w, h, d, color, x, y, z) => {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d));
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    },
    shaders: false,
  });
  const solids = purgatorySolids();
  assert.equal(scene.colliders.length, solids.length);
  scene.colliders.forEach((box, i) => {
    near(box.min.y, solids[i].min.y, 1e-12, 'solid min');
    near(box.max.x, solids[i].max.x, 1e-12, 'solid max');
  });
  const cloud = solids[1];
  near(cloud.max.y, PURGATORY_FRAME.originY, MAP.metres(0.2), 'the cloud top is its floor');
  assert.ok(cloud.max.y - cloud.min.y > MAP.metres(4), 'the cloud has a body under it');
  // The scene's place goes into the game's world; its look replaces the office's.
  assert.equal(scene.place.parent, scene.scene);
  assert.ok(scene.look.fog.isFog && scene.look.background.isColor);
}

// ---------------------------------------------------------------- what shots hit
near(raySphere([0, 0, 0], [1, 0, 0], 10, [5, 0, 0], 1), 4, 1e-12, 'sphere ahead');
assert.equal(raySphere([0, 0, 0], [1, 0, 0], 3, [5, 0, 0], 1), null, 'beyond the step');
assert.equal(raySphere([0, 0, 0], [-1, 0, 0], 10, [5, 0, 0], 1), null, 'behind');
assert.equal(raySphere([5, 0, 0], [1, 0, 0], 10, [5, 0, 0], 1), 0, 'inside');
{
  const targets = [
    { kind: 'soul', key: 7, center: [6, 0, 0], radius: 0.5, staff: false },
    { kind: 'staff', key: 'saint', center: [3, 0, 0], radius: 0.5, staff: true },
  ];
  assert.equal(nearestSkyTarget(targets, [0, 0, 0], [1, 0, 0], 10).target.key, 'saint');
  assert.equal(nearestSkyTarget(targets, [0, 0, 0], [0, 1, 0], 10), null);
  const blast = skyBlast(targets, [3, 0, 0], 2);
  assert.deepEqual(
    blast.map((h) => h[1]),
    ['saint'],
    'only what the blast reaches',
  );
  assert.ok(blast[0][2] > 0);
}

// ---------------------------------------------------------------- the server
let now = 100000;
const game = new Game({ now: () => now });
const pilot = game.join({ code: 'SKY', name: 'Pilote' }),
  soulPlayer = game.join({ code: 'SKY', name: 'Âme' });
const room = game.rooms.get('SKY');
const call = (who, path, body = {}) => game.command('SKY', who.id, path, body);
const P = room.pilots.get(pilot.id),
  S = room.pilots.get(soulPlayer.id);
assert.deepEqual(room.staff.saint, { hp: STAFF_HP, down: false });
assert.equal(game.snapshot(room).staff.guard.hp, STAFF_HP);
// A soul in the queue (the second player dies and enters the purgatory).
game.kill(room, S, S.incarnation);
call(S, 'enter-purgatory', { incarnation: S.incarnation });
assert.throws(
  () => call(S, 'purgatory-hit', { shot: 'x', targets: [['staff', 'saint', 50]] }),
  /âmes ne tirent pas/,
  'souls are unarmed',
);
// An insect's soul hit from the sky is freed at once and pays the team.
const insect = game.soul(room, 'enemy', 'e1', 'Moucheron', 'purgatory', 'midge');
game.arena(room, 'purgatory');
const dollars = room.dollars;
call(P, 'purgatory-hit', { shot: 's1', targets: [['soul', insect.id, 1]] });
assert.equal(insect.status, 'gone');
assert.ok(room.dollars > dollars, 'the freed soul pays');
const paid = room.dollars;
call(P, 'purgatory-hit', { shot: 's1', targets: [['soul', insect.id, 1]] });
assert.equal(room.dollars, paid, 'one shot frees once');
// Players' souls are never hurt.
const playerSoul = [...room.souls.values()].find(
  (s) => s.entity === S.id && s.status === 'waiting',
);
call(P, 'purgatory-hit', { shot: 's2', targets: [['soul', playerSoul.id, 999]] });
assert.equal(playerSoul.status, 'waiting');
// The guard: 10 000 life points; killed, his soul queues and the VIP lane closes.
call(P, 'purgatory-hit', { shot: 'g1', targets: [['staff', 'guard', 6000]] });
call(P, 'purgatory-hit', { shot: 'g1', targets: [['staff', 'guard', 6000]] });
assert.equal(room.staff.guard.hp, 4000, 'each shot counts once');
call(P, 'purgatory-hit', { shot: 'g2', targets: [['staff', 'guard', 6000]] });
assert.ok(room.staff.guard.down);
game.arena(room, 'purgatory');
assert.equal(room.purgatory.vipClosed, true);
const guardSoul = [...room.souls.values()].find((s) => s.enemy_type === 'guard');
assert.equal(guardSoul.status, 'waiting');
assert.ok(
  room.purgatory.bodies.some((b) => b.id === guardSoul.id),
  'his soul walks the queue',
);
room.dollars = 100;
assert.throws(
  () =>
    call(S, 'vip-pass', {
      signature: true,
      epoch: room.base.epoch,
      incarnation: S.incarnation,
    }),
  /vigile est mort/,
);
// Freed (served or killed in the queue), he goes back to his post, unhurt.
const before = room.dollars;
call(P, 'purgatory-hit', { shot: 'g3', targets: [['soul', guardSoul.id, STAFF_HP]] });
assert.equal(guardSoul.status, 'gone');
assert.deepEqual(room.staff.guard, { hp: STAFF_HP, down: false });
assert.equal(room.dollars, before, 'the guard is no insect: no reward');
// Saint Pierre killed: nobody is served, nobody signs.
call(P, 'purgatory-hit', { shot: 'p1', targets: [['staff', 'saint', STAFF_HP]] });
assert.ok(room.staff.saint.down);
game.arena(room, 'purgatory');
assert.equal(room.purgatory.saintDown, true);
assert.equal(deskOccupant(room.purgatory), null, 'nobody is served');
const body = room.purgatory.bodies.find((b) => b.entity === S.id);
Object.assign(body, { x: 0, z: 1.1 });
assert.throws(
  () =>
    call(S, 'sign', { form: 1, signature: true, ground: { epoch: room.purgatory.epoch, body } }),
  /Saint Pierre est mort/,
);
// His soul must be killed again in the queue (10 000 more); then he is back.
const saintSoul = [...room.souls.values()].find((s) => s.enemy_type === 'saint');
call(P, 'purgatory-hit', { shot: 'p2', targets: [['soul', saintSoul.id, STAFF_HP / 2]] });
assert.equal(saintSoul.status, 'waiting', 'half his life: still waiting');
call(P, 'purgatory-hit', { shot: 'p3', targets: [['soul', saintSoul.id, STAFF_HP / 2]] });
assert.equal(saintSoul.status, 'gone');
assert.deepEqual(room.staff.saint, { hp: STAFF_HP, down: false });
game.arena(room, 'purgatory');
assert.equal(room.purgatory.saintDown, false);

// A soul boards an aircraft standing in the sky, and lives again in it.
const office = game.createVehicle(room, 'fighter', 'purchase');
office.state.p = [0, 1, 0];
assert.throws(() => call(S, 'soul-board', { vehicle: office.id }), /hors du ciel/);
const parked = game.createVehicle(room, 'fighter', 'purchase');
parked.state.p = [0, PURGATORY_FRAME.originY + 0.01, 0];
assert.throws(() => call(P, 'soul-board', { vehicle: parked.id }), /Seule une âme/);
call(S, 'soul-board', { vehicle: parked.id });
assert.equal(S.life, 'alive');
assert.equal(S.vehicle_id, parked.id);
assert.equal(S.seat, 'pilot');
assert.equal(playerSoul.status, 'gone', 'the soul left the queue');
// Stepping out on the cloud is joining the queue (no life or death up there): one
// stands where one stepped out, and signing at Saint Pierre's desk leads back down.
parked.state.landed = true;
parked.state.v = [0, 0, 0];
call(S, 'vehicle-exit', {});
assert.equal(S.life, 'dead');
assert.equal(S.state.awaitingPurgatory, false, 'no death passage: straight into the queue');
game.arena(room, 'purgatory');
const stepped = room.purgatory.bodies.find((b) => b.entity === S.id && b.kind === 'player');
const where = worldArena(PURGATORY_FRAME, parked.state.p[0], parked.state.p[2]);
assert.ok(stepped && Math.hypot(stepped.x - where.x, stepped.z - where.z) < 4, 'by the aircraft');
// Players who die appear by the sofa on the VIP side, from where both queues show.
game.kill(room, P, P.incarnation);
call(P, 'enter-purgatory', { incarnation: P.incarnation });
game.arena(room, 'purgatory');
const arrived = room.purgatory.bodies.find((b) => b.entity === P.id && b.kind === 'player');
assert.ok(arrived.x > 6.5, 'right of the VIP lane');
assert.ok(Math.abs(arrived.z - SOUL_ENTRANCE.z) < 2.5);

// Saint Pierre's soul takes the VIP lane, through its gate, to the empty VIP window.
{
  const saint = createSoul(
    { id: 900, entity: 'staff:saint', kind: 'enemy', enemy_type: 'saint' },
    0,
    0,
  );
  Object.assign(saint, { ...SOUL_ENTRANCE, enemyType: 'saint' });
  const arena = {
    bodies: [saint],
    time: 0,
    events: [],
    eventSeq: 0,
    obstacles: VIP_LANE,
    saintDown: true,
  };
  for (let t = 0; t < 30000; t += 100) advancePurgatory(arena, arena.time + 100);
  assert.ok(inVipDesk(saint), 'he waits at the VIP window: ' + [saint.x, saint.z]);
  assert.equal(deskOccupant(arena), null, 'and nobody serves him');
}
// Nothing is built in the sky.
P.life = 'alive';
P.state.awaitingPurgatory = false;
P.mode = 'foot';
P.vehicle_id = null;
game.base(room);
const walker = room.base.bodies.find((b) => b.entity === P.id);
walker.y = PURGATORY_FRAME.originY;
assert.throws(
  () =>
    call(P, 'ground-defense', {
      epoch: room.base.epoch,
      action: 'build',
      kind: 'sugar',
      x: 0,
      z: 0,
    }),
  /ciel de Saint Pierre/,
);
console.log(
  'Purgatory sky: passage up and back over the entry, whiteness, refuge, solids; souls freed by a hit; guard and Saint Pierre killed and back; souls board; nothing built.',
);
