import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { MAP, mapScale, ACTOR_UNIT, HUMAN_SCALE, REFERENCE, FLAK } from '../src/scale.js';
import { VEHICLES, vehiclePad, vehicleEntry } from '../src/fleet.js';
import { OFFICE_LAYOUT, RAID_DURATION, raidPosition } from '../src/layout.js';
import { createGraphics } from '../src/graphics.js';
import { createOffice } from '../src/office.js';
import { stepFlight } from '../src/flight.js';
import {
  createRaid,
  spreadDirection,
  fuseRange,
  blastDamage,
  diveIntensity,
} from '../src/combat.js';
import { makeAntiaircraft, AA_STATIONS } from '../src/sortie.js';
import { bodyMotion } from '../src/purgatory-physics.js';
import { localDB } from './local-db.mjs';
import worker from '../worker/index.js';
assert.equal(MAP.ratio, 0.003);
assert.equal(MAP.metres(1.8), 0.0054);
assert.equal(OFFICE_LAYOUT.base.deckY, 0.90005);
for (const n of [1, 2, 3, 100]) {
  const scale = mapScale(n, 1000);
  assert.equal(scale.reference(scale.metres(100)), 100);
}
assert.throws(() => mapScale(-1));
function flight(ratio, type) {
  return {
    q: new T.Quaternion(),
    vel: new T.Vector3(0, 0, -20 * ratio),
    wind: new T.Vector3(),
    omega: new T.Vector3(),
    gas: 1,
    wing: 1,
    engine: 1,
    pitch: 0,
    roll: 0,
    yaw: 0,
    scale: ratio,
    profile: VEHICLES[type],
  };
}
const full = flight(1, 'fighter'),
  small = flight(MAP.ratio, 'fighter'),
  bomber = flight(MAP.ratio, 'bomber');
for (let i = 0; i < 240; i++) {
  stepFlight(T, full, 1 / 120);
  stepFlight(T, small, 1 / 120);
  stepFlight(T, bomber, 1 / 120);
  assert.ok(full.vel.clone().sub(small.vel.clone().divideScalar(MAP.ratio)).length() < 1e-8);
}
assert.ok(bomber.vel.length() < small.vel.length());
assert.ok(VEHICLES.bomber.maxSpeed < VEHICLES.fighter.maxSpeed);
const raid = createRaid(T),
  a = raid.position(0, 20),
  b = raid.position(0, 20.01);
assert.ok(Math.abs(a.distanceTo(b) / 0.01 / MAP.ratio - REFERENCE.enemy) < 0.2);
assert.ok(REFERENCE.enemy < VEHICLES.fighter.maxSpeed / 3);
assert.equal(raid.duration, RAID_DURATION);
const scene = new T.Scene(),
  graphics = createGraphics(T, scene),
  office = createOffice(T, scene, { ...graphics, textLabel: () => new T.Group() });
const human = graphics.humanoid('#fff');
human.scale.setScalar(HUMAN_SCALE);
scene.add(human);
assert.ok(Math.abs(new T.Box3().setFromObject(human).max.y - MAP.metres(1.8)) < 1e-7);
assert.ok(office.colliders.length > 200);
for (const object of office.solidObjects) {
  const box = new T.Box3().setFromObject(object);
  assert.ok(!box.isEmpty());
  assert.ok(office.colliders.some((c) => c.containsBox(box)));
}
const guns = makeAntiaircraft(T, scene, graphics);
for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2])
  for (const pitch of [0, 0.5, 1.2]) {
    const g = guns[0];
    g.userData.yaw.rotation.y = yaw;
    g.userData.pitch.rotation.x = pitch;
    g.updateWorldMatrix(true, true);
    const left = g.userData.muzzles[0].getWorldPosition(new T.Vector3()),
      right = g.userData.muzzles[1].getWorldPosition(new T.Vector3());
    assert.ok(Math.abs(left.distanceTo(right) - 0.72 * MAP.ratio) < 1e-8);
    const actual = new T.Vector3(0, 0, -1).transformDirection(g.userData.pitch.matrixWorld),
      expected = new T.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch),
      );
    assert.ok(actual.distanceTo(expected) < 1e-8);
  }
for (let i = 0; i < 100; i++) {
  const dir = spreadDirection(T, new T.Vector3(0, 0, -1));
  assert.ok(dir.angleTo(new T.Vector3(0, 0, -1)) <= 0.00301);
  assert.ok(Math.abs(dir.length() - 1) < 1e-12);
}
assert.equal(fuseRange(-10), 100);
assert.equal(fuseRange(9999), 1200);
assert.equal(FLAK.interval, 0.7);
assert.equal(blastDamage(MAP.metres(FLAK.radius)), 20);
assert.equal(blastDamage(0), 80);
assert.equal(diveIntensity(70, 0.2, 70), 0);
assert.ok(diveIntensity(70, -0.9, 70) > 0.9);
const DB = localDB();
const realNow = Date.now;
let now = realNow();
Date.now = () => now;
async function api(path, data) {
  const r = await worker.fetch(
    new Request('https://test.local/api/' + path, { method: 'POST', body: JSON.stringify(data) }),
    { DB },
  );
  return { status: r.status, body: await r.json() };
}
const pilots = [];
for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])
  pilots.push((await api('join', { code: 'FLEET', name })).body);
let snap = pilots.at(-1).snapshot;
assert.equal(snap.vehicles.length, 2);
assert.ok(snap.vehicles.every((v) => v.ready));
assert.equal(snap.mapScale.numerator, 3);
const signature = Array.from({ length: 12 }, (_, i) => [
  0.1 + i * 0.05,
  0.5 + Math.sin(i) * 0.1,
  i ? 1 : 0,
]);
async function position(p, world) {
  const reply = await api('sync', { id: p.id, state: p.state });
  snap = reply.body;
  const body = snap.base.bodies.find((x) => x.entity === p.id);
  assert.ok(body);
  Object.assign(body, {
    x: (world.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
    z: (OFFICE_LAYOUT.base.originZ - world.z) / ACTOR_UNIT,
    y: world.y,
    vx: 0,
    vz: 0,
    parachute: false,
  });
  return { epoch: snap.base.epoch, body: bodyMotion(body) };
}
async function select(p, v, seat) {
  const ground = await position(p, vehicleEntry(v));
  const result = await api('vehicle-select', { id: p.id, vehicle: v.id, seat, ground });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return ground;
}
async function sign(p, v, seat, form, ground) {
  return api('vehicle-sign', { id: p.id, vehicle: v.id, seat, form, signature, ground });
}
const [pa, pb, pc, pd, pe] = pilots;
const bomb = snap.vehicles.find((v) => v.type === 'bomber');
const ga = await select(pa, bomb, 'pilot'),
  gd = await select(pd, bomb, 'pilot');
assert.equal((await sign(pa, bomb, 'pilot', 1, ga)).status, 200);
assert.equal((await sign(pd, bomb, 'pilot', 1, gd)).status, 200);
const raced = await Promise.all([sign(pa, bomb, 'pilot', 2, ga), sign(pd, bomb, 'pilot', 2, gd)]);
assert.deepEqual(raced.map((x) => x.status).sort(), [200, 409]);
const pilot = raced[0].status === 200 ? pa : pd,
  loser = pilot === pa ? pd : pa;
for (const [p, seat] of [
  [pb, 'dorsal'],
  [pc, 'tail'],
]) {
  const g = await select(p, bomb, seat);
  assert.equal((await sign(p, bomb, seat, 1, g)).status, 200);
  assert.equal((await sign(p, bomb, seat, 2, g)).status, 200);
}
snap = (await api('sync', { id: pilot.id, state: pilot.state })).body;
const shared = snap.vehicles.find((v) => v.id === bomb.id);
assert.equal(shared.seats.length, 3);
assert.deepEqual(new Set(shared.seats.map((s) => s.seat)), new Set(['pilot', 'dorsal', 'tail']));
pilot.state = {
  ...shared.state,
  p: [shared.state.p[0], shared.state.p[1] + MAP.metres(5), shared.state.p[2] + MAP.metres(30)],
  v: [0, 0, MAP.metres(35)],
  landed: false,
};
snap = (await api('sync', { id: pilot.id, mode: 'flight', state: pilot.state })).body;
assert.equal(snap.vehicles.filter((v) => v.type === 'bomber' && v.ready).length, 1);
assert.equal(snap.vehicles.filter((v) => v.type === 'bomber').length, 2);
assert.deepEqual(snap.vehicles.find((v) => v.id === bomb.id).state.p, pilot.state.p);
const original = snap.vehicles.find((v) => v.id === bomb.id).state.p;
await api('sync', { id: pb.id, mode: 'crew', state: { ...pb.state, p: [999, 999, 999] } });
snap = (await api('sync', { id: pilot.id, mode: 'flight', state: pilot.state })).body;
assert.deepEqual(
  snap.vehicles.find((v) => v.id === bomb.id).state.p,
  original,
  'a gunner cannot replace the shared aircraft pose',
);
const fighter = snap.vehicles.find((v) => v.type === 'fighter'),
  gf = await select(loser, fighter, 'pilot');
for (const form of [1, 2])
  assert.equal((await sign(loser, fighter, 'pilot', form, gf)).status, 200);
loser.state = { ...fighter.state };
// Damage follows the hull, applies once even when the report is retried.
assert.equal(
  (await api('friendly-hit', { id: loser.id, vehicle: bomb.id, shot: 'one' })).status,
  200,
);
await api('friendly-hit', { id: loser.id, vehicle: bomb.id, shot: 'one' });
snap = (await api('sync', { id: pilot.id, mode: 'flight', state: pilot.state })).body;
assert.equal(snap.vehicles.find((v) => v.id === bomb.id).state.hp, 25);
// Initial ten seconds, manual skip, then exactly one automatic transition.
assert.equal((await api('start', { id: pilot.id })).body.wave, 0);
now += 9999;
assert.equal(
  (await api('sync', { id: pilot.id, mode: 'flight', state: pilot.state })).body.wave,
  0,
);
now++;
snap = (await api('sync', { id: pilot.id, mode: 'flight', state: pilot.state })).body;
assert.equal(snap.wave, 1);
assert.equal(snap.phase, 'combat');
for (let i = 0; i < snap.total; i++)
  await api('hit', { id: loser.id, wave: 1, enemy: i, amount: 800 });
snap = (await api('sync', { id: pilot.id, mode: 'flight', state: pilot.state })).body;
assert.equal(snap.phase, 'prep');
assert.equal(snap.next_wave_at, now + 10000);
snap = (await api('start', { id: pilot.id })).body;
assert.equal(snap.wave, 2);
for (let i = 0; i < snap.total; i++)
  await api('hit', { id: loser.id, wave: 2, enemy: i, amount: 800 });
for (const p of pilots)
  await api('sync', {
    id: p.id,
    mode: p === pilot || p === loser ? 'flight' : 'crew',
    state: p.state,
  });
now += 10000;
const automatic = await Promise.all([
  api('sync', { id: pilot.id, mode: 'flight', state: pilot.state }),
  api('sync', { id: loser.id, mode: 'flight', state: loser.state }),
]);
assert.ok(automatic.every((x) => x.body.wave === 3));
// Leaving a flying pilot seat deploys all remaining crew safely.
const exit = await api('vehicle-exit', { id: pilot.id, state: pilot.state });
assert.equal(exit.status, 200);
assert.equal(
  exit.body.vehicles.some((v) => v.id === bomb.id),
  false,
);
assert.ok(
  exit.body.pilots
    .filter((p) => [pilot.id, pb.id, pc.id].includes(p.id))
    .every((p) => p.mode === 'foot' && !p.vehicle_id),
);
assert.ok(
  exit.body.base.bodies
    .filter((b) => [pilot.id, pb.id, pc.id].includes(b.entity))
    .every((b) => !b.parachute && b.grounded === false),
);
// DCA seat can be reached with scaled body coordinates and left nearby.
await DB.prepare('INSERT INTO equipment(room,slot,state,request) VALUES(?,?,?,?)')
  .bind('FLEET', 0, JSON.stringify(AA_STATIONS[0]), 'fixture-dca')
  .run();
const st = AA_STATIONS[0],
  gg = await position(pe, st);
assert.equal((await api('turret', { id: pe.id, station: 0, ground: gg })).status, 409);
assert.equal((await api('equipment-select', { id: pe.id, station: 0, ground: gg })).status, 200);
for (const form of [1, 2])
  assert.equal(
    (await api('equipment-sign', { id: pe.id, station: 0, ground: gg, form, signature })).status,
    200,
  );
const out = await api('turret', { id: pe.id });
assert.equal(out.status, 200);
const body = out.body.base.bodies.find((x) => x.entity === pe.id);
assert.ok(Math.abs(OFFICE_LAYOUT.base.originX + body.x * ACTOR_UNIT - st.x) < MAP.metres(4));
// An expired seat may be reclaimed. Its former owner cannot move the hull.
now += 13000;
await api('sync', { id: pe.id, state: pe.state });
let fleet = (await api('sync', { id: pe.id, state: pe.state })).body.vehicles,
  oldFighter = fleet.find((v) => v.id === fighter.id);
const reclaimed = await select(pe, oldFighter, 'pilot');
for (const form of [1, 2])
  assert.equal((await sign(pe, oldFighter, 'pilot', form, reclaimed)).status, 200);
const before = oldFighter.state.p;
const staleReply = await api('sync', {
  id: loser.id,
  mode: 'flight',
  state: { ...loser.state, p: [3, 2, 3] },
});
assert.equal(staleReply.body.pilots.find((p) => p.id === loser.id).mode, 'foot');
assert.deepEqual(staleReply.body.vehicles.find((v) => v.id === fighter.id).state.p, before);
await api('reset', { id: pilot.id });
Date.now = realNow;
console.log(
  'PASS: SI map ratios, 5.4mm character, scale-invariant flight, slower bomber, constant 60km/h raid, solid decor, true twin muzzles, dispersion, fuse safety, dive siren, exclusive 3-person crew, pilot authority, replacement spawning, deduplicated hull damage, 10s countdown/manual/atomic auto waves, crew parachutes and scaled DCA exit.',
);

let high = 0,
  travelled = 0,
  prev = new T.Vector3().fromArray(raidPosition(0)),
  previousDirection = null;
for (let i = 1; i <= 2000; i++) {
  const p = new T.Vector3().fromArray(raidPosition(i / 2000)),
    delta = p.clone().sub(prev);
  if (p.y > 2.2) high++;
  assert.ok(p.y < 2.9 && Math.abs(p.x) < 4 && Math.abs(p.z) < 3.4, 'tour stays inside room');
  if (previousDirection)
    assert.ok(previousDirection.dot(delta.clone().normalize()) > 0.99, 'smooth turns');
  previousDirection = delta.clone().normalize();
  travelled += delta.length();
  prev = p;
}
assert.ok(high > 1200, 'majority of tour near ceiling');
assert.ok(travelled > 20, 'room tour, not a shortcut to bin');
console.log(
  'PASS: smooth room tour, ceiling dwell, bounded route and constant arc-length progress.',
);
