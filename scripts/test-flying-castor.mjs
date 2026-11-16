// Castor volant: tandem-rotor logistics helicopter (Meshy model, rotors split
// from the source mesh), one pilot and three passengers who all drop the
// Castor constructions (except LEGO walls) straight below it, turned like it;
// drops fall like the other purchases (now three times slower) and land on the
// first surface below, floor or furniture. Same mobile support as the Castor.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../vendor/three.module.min.js';
import { MODEL_DATA } from '../src/meshy-flying-castor-data.js';
import { createGraphics } from '../src/graphics.js';
import {
  VEHICLES,
  SEAT_NAMES,
  isRotorcraft,
  isSupportVehicle,
  isPassengerSeat,
} from '../src/fleet.js';
import { SHOP } from '../src/equipment.js';
import { SHOP_CATEGORIES } from '../src/shop-catalog.js';
import { canUseWeapon } from '../src/armament.js';
import { fullAmmo, CASTOR_SERVICE_RADIUS } from '../src/logistics.js';
import { CONTRACTS, contractKey } from '../src/contracts.js';
import { withinService } from '../src/paid-service.js';
import { serviceZoneList } from '../src/service-zones.js';
import { stepHelicopter, HELI } from '../src/helicopter.js';
import { DELIVERY_SPEED, deliveryHeightAt } from '../src/delivery.js';
import {
  AIRDROP_KINDS,
  AIRDROP_TAPE,
  airdropCommand,
  airdropSurface,
  headingOf,
} from '../src/airdrop.js';
import { airdropPlacement } from '../src/ground-placement.js';
import { navigationStructures, floorStructures } from '../src/ground-defense-state.js';
import { seatRole } from '../src/seat-icons.js';
import { controlHintItems } from '../src/live-hud.js';
import { Game } from '../server/game.js';
import { OFFICE_SOLIDS } from '../worker/assets.js';

const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) < eps, label + ': ' + a + ' vs ' + b);

// 1. Model: the approved Meshy source, every triangle kept, two rotors split
// around their own vertical axis, resources shared between helicopters.
assert.equal(
  MODEL_DATA.sourceSha256,
  'dfcd21c08858057e13e78849a4156dd2f68c645edcd203f33acb7138806de691',
);
assert.ok(
  readFileSync('scripts/import-meshy-flying-castor.py', 'utf8').includes(MODEL_DATA.sourceSha256),
);
assert.deepEqual(
  MODEL_DATA.parts.map((p) => p.part),
  ['body', 'rotorFront', 'rotorRear'],
);
let triangles = 0;
for (const p of MODEL_DATA.parts) triangles += atob(p.indices).length / 6;
assert.equal(triangles, MODEL_DATA.triangles);
assert.equal(MODEL_DATA.triangles, 2767);
const graphics = createGraphics(T, new T.Scene());
const one = graphics.makeFlyingCastor(),
  two = graphics.makeFlyingCastor();
const meshes = (g) => {
  const list = [];
  g.traverse((o) => o.isMesh && list.push(o));
  return list;
};
meshes(one).forEach((m, i) => assert.equal(m.geometry, meshes(two)[i].geometry, 'shared'));
const [front, rear] = one.userData.rotors;
assert.equal(one.userData.rotor, front);
assert.equal(one.userData.counterRotor, rear);
assert.ok(front.position.z < -1.5 && rear.position.z > 1.5, 'front rotor toward the nose (-Z)');
for (const rotor of one.userData.rotors) {
  assert.ok(rotor.position.y > 2.5, 'rotors above the fuselage');
  // Three blades at 120 degrees: their centroid sits on the spin axis.
  const geometry = rotor.children[0].geometry,
    position = geometry.attributes.position,
    centroid = new T.Vector3();
  for (let k = 0; k < position.count; k++)
    centroid.add(new T.Vector3().fromBufferAttribute(position, k));
  centroid.divideScalar(position.count);
  near(centroid.x, 0, 0.2, 'rotor centred on its axis (x)');
  near(centroid.z, 0, 0.2, 'rotor centred on its axis (z)');
  const box = geometry.boundingBox;
  assert.ok(box.max.x - box.min.x > 2.5, 'three long blades');
}
front.rotation.y = 1;
assert.equal(two.userData.rotor.rotation.y, 0, 'rotors are per helicopter');
const box = new T.Box3().setFromObject(one);
near(box.min.y, -VEHICLES.flyingcastor.gear / VEHICLES.flyingcastor.gear, 1e-3, 'skids at gear');
assert.equal(one.userData.engines.length, 2, 'smoke under each rotor');

// 2. Fleet, shop, crew and support.
const spec = VEHICLES.flyingcastor;
assert.equal(spec.name, 'Castor volant');
assert.deepEqual(spec.seats, ['pilot', 'passenger1', 'passenger2', 'passenger3']);
assert.ok(isRotorcraft('flyingcastor') && isRotorcraft('helicopter') && !isRotorcraft('castor'));
assert.ok(isSupportVehicle('flyingcastor') && isSupportVehicle('castor'));
assert.ok(!isSupportVehicle('helicopter'));
assert.ok(spec.seats.slice(1).every((s) => isPassengerSeat(s) && SEAT_NAMES[s] === 'Passager'));
assert.equal(seatRole('flyingcastor', 'passenger2'), 'passenger');
assert.equal(SHOP.flyingcastor.cost, 30);
assert.equal(SHOP.flyingcastor.kind, 'vehicle');
assert.ok(SHOP_CATEGORIES.find((c) => c.id === 'air').items.includes('flyingcastor'));
for (const seat of spec.seats) {
  for (const key of ['pilot', 'rocket', 'missile', 'bomb', seat])
    assert.ok(!canUseWeapon('flyingcastor', seat, key), 'unarmed ' + seat);
  for (const context of ['boarding', 'change'])
    assert.ok(CONTRACTS[contractKey(context, seat, 'flyingcastor')]?.length, context + seat);
}
assert.deepEqual(fullAmmo('flyingcastor'), {});
const fleet = [{ id: 'fc', type: 'flyingcastor', state: { p: [0, 1, 0], hp: 200 } }];
assert.equal(serviceZoneList([], fleet)[0].radius, CASTOR_SERVICE_RADIUS);
assert.ok(withinService(fleet[0], [], fleet), 'resupplies itself');
assert.ok(
  withinService({ type: 'fighter', state: { p: [0.3, 1, 0], hp: 100 } }, [], fleet),
  'serves allies within 50 cm',
);

// 3. Keyboard turn (A/E in the vertical view): no mouse direction needed.
const floor = { min: { x: -4, y: -0.1, z: -3 }, max: { x: 4, y: 0, z: 3 } };
const state = { p: [0, 1, 0], q: [0, 0, 0, 1], v: [0, 0, 0], hp: 200, engine: 1, wing: 1 };
for (let i = 0; i < 120; i++)
  stepHelicopter(T, state, { yaw: 1, pitch: 0, roll: 0, direction: null }, [floor], 1 / 120, spec);
const turned = headingOf(state.q);
assert.ok(turned < -0.6 && turned > -HELI.yawRate, 'E turns right, about yawRate rad/s: ' + turned);
assert.ok(Math.abs(state.p[1] - 1) < 0.01, 'turning in place keeps the hover');

// 4. Drop geometry: under the helicopter, turned like it.
const yaw = 0.7;
const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw).toArray();
near(headingOf(q), yaw, 1e-9, 'heading');
const tape = airdropCommand('sticky', { x: 1, z: 2, yaw });
near(Math.hypot(tape.b[0] - tape.a[0], tape.b[1] - tape.a[1]), AIRDROP_TAPE, 1e-12, '10 cm tape');
near((tape.a[0] + tape.b[0]) / 2, 1, 1e-12, 'tape centred');
near(Math.atan2(-(tape.a[0] - tape.b[0]), -(tape.a[1] - tape.b[1])), yaw, 1e-9, 'tape heading');
assert.equal(airdropCommand('sentry', { x: 1, z: 2, yaw }).angle, yaw);
near(Math.abs(airdropCommand('fan', { x: 1, z: 2, yaw }).angle - yaw), Math.PI, 1e-9, 'fan');
assert.deepEqual(AIRDROP_KINDS, ['sugar', 'sticky', 'fan', 'sentry', 'bunker', 'antitank']);
const desk = [-1.8, 1.6]; // office desk top at 0.90 m
near(airdropSurface(OFFICE_SOLIDS, ...desk, 1.3), 0.9, 1e-6, 'desk top');
near(airdropSurface(OFFICE_SOLIDS, ...desk, 0.5), 0, 1e-6, 'under the desk: floor');
assert.match(
  airdropPlacement({
    builder: { x: 0, z: 0, yaw: 0, landingY: 0 },
    mode: 'barricade',
    defense: { structures: [] },
    dollars: 50,
  }).error,
  /mur LEGO/,
);

// 5. Server: pilot and passenger drop, paid at once, built when it lands.
let now = 100000;
const game = new Game({ now: () => now, solids: OFFICE_SOLIDS });
const pilot = game.join({ code: 'FLYING', name: 'Pilote' });
const guest = game.join({ code: 'FLYING', name: 'Passager' });
const r = game.rooms.get('FLYING');
const v = game.createVehicle(r, 'flyingcastor');
const board = (join, seat) => {
  const p = r.pilots.get(join.id);
  v.seats.set(seat, join.id);
  p.mode = seat === 'pilot' ? 'flight' : 'crew';
  p.seat = seat;
  p.vehicle_id = v.id;
};
board(pilot, 'pilot');
board(guest, 'passenger2');
const hover = (x, y, z, heading = 0) => {
  v.state.p = [x, y + spec.gear, z];
  v.state.q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), heading).toArray();
  v.state.landed = false;
};
r.dollars = 100;
// Time passes in small steps, both players staying connected.
const wait = (ms) => {
  let snap;
  for (let left = ms; left > 0; left -= 500) {
    now += Math.min(500, left);
    snap = game.command('FLYING', pilot.id, 'sync', { mode: 'flight', state: v.state });
    game.command('FLYING', guest.id, 'sync', { mode: 'crew', state: v.state });
  }
  return snap;
};
const run = (join, values) =>
  game.command('FLYING', join.id, 'ground-defense', { epoch: r.base.epoch, ...values });
hover(0.5, 0.6, 0.3, yaw);
assert.throws(
  () => run(pilot, { action: 'build', kind: 'barricade', a: [0, 0], b: [0.1, 0] }),
  /LEGO/,
);
let s = run(guest, { action: 'build', kind: 'sentry', a: [3, 3], request: 'air:sentry:1' });
assert.equal(s.dollars, 100 - 9, 'paid when dropped');
assert.equal(s.groundDefense.structures.length, 0, 'still falling');
assert.equal(s.groundDefense.drops.length, 1);
const drop = s.groundDefense.drops[0];
assert.deepEqual(drop.command.a, [0.5, 0.3], 'client coordinates ignored: below the helicopter');
near(drop.angle, yaw, 1e-9, 'turned like the helicopter');
near(drop.fromY, 0.6, 1e-9, 'falls from the helicopter');
assert.equal(drop.landingY, airdropSurface(OFFICE_SOLIDS, 0.5, 0.3, 0.6));
s = run(guest, { action: 'build', kind: 'sentry', a: [3, 3], request: 'air:sentry:1' });
assert.equal(s.dollars, 91, 'retry not charged twice');
const fall = (drop.fromY - drop.landingY) / DELIVERY_SPEED;
s = wait(fall * 1000 * 0.5);
assert.equal(s.groundDefense.structures.length, 0, 'half way down');
near(deliveryHeightAt(drop, now), (drop.fromY + drop.landingY) / 2, 1e-9, 'a third as fast');
s = wait(fall * 1000 * 0.5 + 1);
assert.equal(s.groundDefense.drops, undefined, 'landed');
const sentry = s.groundDefense.structures.find((x) => x.kind === 'sentry');
assert.deepEqual(sentry.position, [0.5, 0.3]);
near(sentry.angle, yaw, 1e-9, 'kept the heading');

// Over a desk: lands on the desk top, out of reach of floor walkers.
hover(desk[0], 1.3, desk[1]);
for (const [kind, request] of [
  ['bunker', 'air:bunker:1'],
  ['sticky', 'air:tape:1'],
])
  run(pilot, { action: 'build', kind, request });
s = wait(10000);
const bunker = s.groundDefense.structures.find((x) => x.kind === 'bunker');
near(bunker.y, 0.9, 1e-6, 'bunker on the desk');
const station = r.equipment.find((x) => x.kind === 'bunker');
near(station.y, 0.9, 1e-6, 'its post too');
assert.equal(navigationStructures(s.groundDefense.structures).length, 0, 'no floor blocking');
assert.equal(
  floorStructures(s.groundDefense.structures).filter((x) => x.kind === 'sticky').length,
  0,
  'tape on furniture does not catch floor walkers',
);
// Same spot on the floor below is free: only the same surface collides.
hover(desk[0], 0.4, desk[1]);
run(pilot, { action: 'build', kind: 'sugar', request: 'air:sugar:1' });
s = wait(10000);
assert.ok(
  s.groundDefense.structures.some((x) => x.kind === 'sugar' && !x.y),
  'sugar on the floor',
);

// Two drops on the same spot: the second is refunded when it lands.
hover(-0.5, 0.5, -0.5);
const cash = r.dollars;
run(pilot, { action: 'build', kind: 'sentry', request: 'air:sentry:2' });
run(guest, { action: 'build', kind: 'sentry', request: 'air:sentry:3' });
near(r.dollars, cash - 18, 0.011, 'both drops paid');
s = wait(10000);
// (Some fuel is bought meanwhile by the support service.)
near(r.dollars, cash - 9, 0.3, 'taken spot refunded');
assert.equal(
  s.groundDefense.structures.filter(
    (x) => x.kind === 'sentry' && x.position[0] === -0.5 && x.position[1] === -0.5,
  ).length,
  1,
);

// Repair / remove from the helicopter, within reach.
const target = s.groundDefense.structures.find((x) => x.kind === 'sugar');
hover(target.position[0] + 0.5, 0.5, target.position[1]);
assert.throws(() => run(pilot, { action: 'remove', target: target.id }), /Approchez/);
hover(target.position[0] + 0.1, 0.5, target.position[1]);
s = run(guest, { action: 'remove', target: target.id });
assert.ok(!s.groundDefense.structures.some((x) => x.id === target.id), 'removed from the air');
v.state.hp = 0;
assert.throws(() => run(pilot, { action: 'build', kind: 'fan' }), /réservée|purgatoire/);

// 6. Client wiring: V vertical view for every seat, keyboard-only flight,
// A/E turn, hull hidden over the drop point, falling drops drawn.
const client = readFileSync('src/client.js', 'utf8');
assert.match(client, /interactionKey === 'KeyV' && myVehicle\?\.type === 'flyingcastor'/);
assert.match(
  client,
  /yaw: keyboardOnly && active \? Number\(!!keys\.KeyE\) - Number\(!!keys\.KeyA\)/,
);
assert.match(client, /if \(airView\(\)\) return; \/\/ vertical view: keyboard only/);
assert.match(client, /hull\.visible = !\(airView\(\) && myVehicle\?\.id === v\.id\)/);
const ui = readFileSync('src/ground-defense-ui.js', 'utf8');
assert.match(ui, /renderDrops\(snap\)/);
assert.match(ui, /deliveryHeightAt\(drop, now\)/);
assert.ok(
  controlHintItems({ vehicle: { type: 'flyingcastor' }, seat: 'passenger1', build: true }).some(
    (h) => /larguer/.test(h),
  ),
);
assert.ok(
  controlHintItems({ building: { mode: 'sentry', air: true } }).includes(
    'V : vue verticale · A/E : tourner',
  ),
);
console.log(
  'Castor volant: Meshy model with split counter-rotating rotors, 30 $ unarmed pilot + 3 passengers, mobile support, keyboard turn, airdrops paid at once, falling 3x slower and built under the helicopter on floor or furniture, refunds, reach.',
);
