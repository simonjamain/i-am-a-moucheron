import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { stepFall, stepBallisticVelocity, toggleParachute, HUMAN_AERO } from '../src/ballistics.js';
import { MAP, ACTOR_UNIT } from '../src/scale.js';
import { SHOP, supportedPlacement, upgradedVehicle } from '../src/equipment.js';
import { VEHICLES, vehiclePad, vehicleEntry } from '../src/fleet.js';
import { createSoul, bodyMotion } from '../src/purgatory-physics.js';
import { OFFICE_LAYOUT } from '../src/layout.js';
import { createGraphics } from '../src/graphics.js';
import { createOffice } from '../src/office.js';
import { enemyRoute, enemyRoutePosition, PORTALS } from '../src/routes.js';
import { wavePlan, swarmFrame } from '../src/waves.js';
import { CombatEffects } from '../src/combat.js';
import { localDB } from './local-db.mjs';
import worker from '../worker/index.js';
const reference = new T.Vector3(820, 0, 0),
  small = reference.clone().multiplyScalar(MAP.ratio);
for (let i = 0; i < 120; i++) {
  stepBallisticVelocity(reference, 1 / 120, false, 1);
  stepBallisticVelocity(small, 1 / 120);
}
assert.ok(reference.x < 600 && reference.x > 400);
assert.ok(reference.y < 0);
assert.ok(
  reference.distanceTo(small.clone().divideScalar(MAP.ratio)) < 1e-7,
  'scale invariant drag and gravity',
);
const falling = { y: 100, vy: 0, grounded: false, parachute: false };
for (let i = 0; i < 1200; i++) stepFall(falling, 1 / 60, 1);
assert.ok(Math.abs(falling.vy + HUMAN_AERO.terminal) < 0.2);
const fast = falling.vy;
assert.equal(toggleParachute(falling), true);
for (let i = 0; i < 180; i++) stepFall(falling, 1 / 60, 1);
assert.ok(
  Math.abs(falling.vy + HUMAN_AERO.canopyTerminal) < 0.1,
  'opening canopy at terminal speed must brake stably',
);
assert.equal(toggleParachute(falling), true);
stepFall(falling, 1, 1);
assert.ok(falling.vy < -10);
falling.grounded = true;
assert.equal(toggleParachute(falling), false);
const scene = new T.Scene(),
  graphics = createGraphics(T, scene),
  office = createOffice(T, scene, { ...graphics, textLabel: () => new T.Group() });
assert.ok(supportedPlacement({ x: -1.5, y: 0.90005, z: 1.885 }, office.colliders));
assert.equal(
  supportedPlacement({ x: 0, y: 2, z: 0 }, office.colliders),
  null,
  'no floating installations',
);
const books = office.colliders.filter((b) => Math.abs(b.max.z - 1.405) < 0.01 && b.max.y > 0.95);
assert.ok(books.length);
assert.ok(
  supportedPlacement({ x: -1.02, y: 1.00005, z: 1.23 }, office.colliders),
  'books support a whole gun base',
);
const fx = new CombatEffects(T, scene);
fx.blast(new T.Vector3());
fx.update(1, new T.PerspectiveCamera());
assert.ok(fx.items[0].m.color.getHex() < 0x404040);
assert.equal(fx.items[0].core.visible, false);
assert.ok(fx.items[0].smoke.length >= 8);
fx.update(5, new T.PerspectiveCamera());
assert.equal(fx.items.length, 0);
const rosters = wavePlan('VARIED', 8, 123).roster;
assert.ok(rosters.some((e) => e.ground));
assert.ok(new Set(rosters.filter((e) => !e.ground).map((e) => enemyRoute(e).portal)).size > 1);
const flyingRoutes = rosters.filter((e) => !e.ground);
assert.ok(new Set(flyingRoutes.map((e) => e.routeSeed)).size > 3);
for (const e of rosters) {
  const route = enemyRoute(e),
    end = enemyRoutePosition(e, 1);
  assert.ok(Math.hypot(end[0] - 2.5, end[2] + 2.7) < 1e-8);
  assert.ok(e.duration >= 60);
  for (const { p } of route.samples) {
    assert.ok(p.every(Number.isFinite));
    assert.ok(p[1] >= 0.0006 && p[1] <= 2.81);
  }
}
const DB = localDB(),
  realNow = Date.now;
let now = realNow();
Date.now = () => now;
async function api(path, data) {
  const r = await worker.fetch(
    new Request('https://test.local/api/' + path, { method: 'POST', body: JSON.stringify(data) }),
    { DB },
  );
  return { status: r.status, body: await r.json() };
}
const a = (await api('join', { name: 'A', code: 'ECONOMY' })).body,
  b = (await api('join', { name: 'B', code: 'ECONOMY' })).body;
let snap = (await api('sync', { id: a.id, state: a.state })).body;
assert.equal(snap.dollars, 0);
assert.equal(snap.equipment.length, 0);
assert.equal(snap.vehicles.length, 2);
// Accepted souls credit one shared dollar exactly once, including CAS retries.
await DB.prepare(
  "INSERT INTO souls(room,kind,entity,name,place) VALUES('ECONOMY','enemy','reward','Fourmi',1)",
).run();
const row = await DB.prepare(
  "SELECT * FROM souls WHERE room='ECONOMY' AND entity='reward'",
).first();
const room = await DB.prepare("SELECT purgatory FROM rooms WHERE code='ECONOMY'").first(),
  arena = JSON.parse(room.purgatory),
  soul = createSoul(row, 0, now);
soul.gone = true;
arena.bodies = [soul];
await DB.prepare("UPDATE rooms SET purgatory=? WHERE code='ECONOMY'")
  .bind(JSON.stringify(arena))
  .run();
await Promise.all([
  api('sync', { id: a.id, state: a.state }),
  api('sync', { id: b.id, state: b.state }),
]);
snap = (await api('sync', { id: a.id, state: a.state })).body;
assert.equal(snap.dollars, 1);
assert.equal(
  (await DB.prepare("SELECT COUNT(*) AS n FROM soul_rewards WHERE room='ECONOMY'").first()).n,
  1,
);
// NPC service advances even when no human is currently in purgatory.
await DB.prepare(
  "INSERT INTO souls(room,kind,entity,name,place) VALUES('ECONOMY','enemy','natural','Moucheron',2)",
).run();
const naturalRow = await DB.prepare(
  "SELECT * FROM souls WHERE room='ECONOMY' AND entity='natural'",
).first();
const natural = createSoul(naturalRow, 0, now);
natural.x = 0;
natural.z = -1;
const naturalArena = JSON.parse(
  (await DB.prepare("SELECT purgatory FROM rooms WHERE code='ECONOMY'").first()).purgatory,
);
naturalArena.bodies = [natural];
naturalArena.time = now;
await DB.prepare("UPDATE rooms SET purgatory=? WHERE code='ECONOMY'")
  .bind(JSON.stringify(naturalArena))
  .run();
for (let i = 0; i < 40; i++) {
  now += 100;
  await api('sync', { id: a.id, state: a.state });
}
assert.equal(
  (await api('sync', { id: a.id, state: a.state })).body.dollars,
  2,
  'natural Saint Peter service earns one dollar',
);
async function ground(player, w, grounded = true) {
  const snap = (await api('sync', { id: player.id, state: player.state })).body,
    body = snap.base.bodies.find((b) => b.entity === player.id);
  Object.assign(body, {
    x: (w.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
    z: (OFFICE_LAYOUT.base.originZ - w.z) / ACTOR_UNIT,
    y: w.y,
    vx: 0,
    vz: 0,
    grounded,
    parachute: false,
  });
  return { epoch: snap.base.epoch, body: bodyMotion(body) };
}
const position = { x: -1.5, y: 0.90005, z: 1.885 },
  g = await ground(a, { x: -1.5, y: 0.90005, z: 1.9 });
assert.equal(
  (await api('buy', { id: a.id, item: 'dca', request: 'insufficient', position, ground: g }))
    .status,
  409,
);
await DB.prepare("UPDATE rooms SET dollars=100 WHERE code='ECONOMY'").run();
const purchase = { id: a.id, item: 'dca', request: 'one-deployment', position, ground: g };
const bought = await Promise.all([api('buy', purchase), api('buy', purchase)]);
assert.ok(
  bought.every((r) => r.status === 200),
  JSON.stringify(bought),
);
snap = (await api('sync', { id: a.id, state: a.state })).body;
assert.equal(snap.dollars, 96);
assert.equal(snap.equipment.length, 1);
assert.equal((await api('buy', { ...purchase, request: 'overlap-duplicate' })).status, 409);
assert.equal(
  (await api('buy', { id: a.id, item: 'interceptor', request: 'new-aircraft' })).status,
  200,
);
snap = (await api('sync', { id: a.id, state: a.state })).body;
assert.equal(snap.dollars, 84);
assert.equal(snap.vehicles.filter((v) => v.type === 'interceptor').length, 1);
assert.equal(
  (await api('buy', { id: a.id, item: 'interceptor', request: 'new-aircraft' })).status,
  200,
); // exact retry
await DB.prepare("UPDATE rooms SET dollars=4 WHERE code='ECONOMY'").run();
const upgradeRace = await Promise.all([
  api('buy', { id: a.id, item: 'engine', request: 'upgrade-race-a' }),
  api('buy', { id: b.id, item: 'engine', request: 'upgrade-race-b' }),
]);
assert.deepEqual(upgradeRace.map((x) => x.status).sort(), [200, 409]);
snap = (await api('sync', { id: a.id, state: a.state })).body;
assert.equal(snap.dollars, 0);
assert.equal(snap.upgrades.engine, 1);
assert.ok(upgradedVehicle(VEHICLES.fighter, snap.upgrades).thrust > VEHICLES.fighter.thrust);
// Every airborne exit is free fall, including a fast bomber gunner. No canopy appears automatically.
const bomber = snap.vehicles.find((v) => v.type === 'bomber'),
  entry = vehicleEntry(bomber),
  boarding = await ground(a, entry);
assert.equal(
  (await api('vehicle-select', { id: a.id, vehicle: bomber.id, seat: 'tail', ground: boarding }))
    .status,
  200,
);
for (const form of [1, 2])
  assert.equal(
    (
      await api('vehicle-sign', {
        id: a.id,
        vehicle: bomber.id,
        seat: 'tail',
        ground: boarding,
        form,
        signature: true,
      })
    ).status,
    200,
  );
await DB.prepare('UPDATE vehicles SET state=? WHERE id=?')
  .bind(
    JSON.stringify({
      ...bomber.state,
      p: [entry.x, 1.8, entry.z],
      v: [MAP.metres(30), 0, 0],
      landed: false,
    }),
    bomber.id,
  )
  .run();
const exited = await api('vehicle-exit', { id: a.id });
assert.equal(exited.status, 200);
const body = exited.body.base.bodies.find((b) => b.entity === a.id);
assert.equal(body.parachute, false);
assert.equal(body.grounded, false);
assert.equal(body.vx, MAP.metres(30) / ACTOR_UNIT);
await api('reset', { id: a.id });
snap = (await api('sync', { id: a.id, state: a.state })).body;
assert.equal(snap.dollars, 0);
assert.deepEqual(snap.upgrades, {});
assert.equal(snap.equipment.length, 0);
assert.ok(!snap.vehicles.some((v) => v.type === 'interceptor'));
Date.now = realNow;
console.log(
  'PASS: stable drag/ballistics, terminal free fall, manual canopy, physical placement on books, persistent flak cleanup, multi-source paths, shared exact-once rewards, idempotent spending, purchase races, unlocks/upgrades, signature acknowledgements, freefall exits and economy reset.',
);
