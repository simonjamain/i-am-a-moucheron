import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ACTOR_UNIT, FLAK, MAP } from '../src/scale.ts';
import { FIXED_DCA_AMMO } from '../src/ground-ammo.ts';
import { advancePaidService } from '../src/paid-service.js';
import { newGroundDefense } from '../src/ground-defense-state.js';
import * as T from '../vendor/three.module.min.js';
import { HEAVY } from '../src/armament.ts';
import { stepHeavy } from '../src/heavy-sim.js';
import { shopPrice } from '../src/equipment.ts';
import { heavyDcaMuzzle } from '../src/fixed-dca.ts';
import { makeFixedDca, positionHeavyFlakSight } from '../src/fixed-dca-model.js';
import { OFFICE_LAYOUT } from '../src/layout.ts';
import { makeInstallationCollider } from '../src/station-model.js';
import { colliderContainsXZ } from '../src/oriented-collider.ts';
import { aimGun, stepWalker, stationEntryOffset } from '../src/sortie.js';
import { Game } from '../server/game.js';

const station = { kind: 'refuel', x: 0, y: 0.01, z: 0 };
const gun = { kind: 'dca', x: 0, y: 0.01, z: 0.08, slot: 0, ammo: 0 };
const disconnected = { ...gun, x: 2, z: 2, slot: 1 };
assert.equal(FIXED_DCA_AMMO, 120);
assert.equal(advancePaidService([], [gun], 100).spent, 0);
assert.equal(advancePaidService([], [station, gun], 0).spent, 0);
assert.equal(gun.ammo, 0);
const partial = advancePaidService([], [station, gun], 0.2);
assert.ok(Math.abs(partial.spent - 0.2) < 1e-9);
assert.equal(partial.dollars, 0);
assert.ok(Math.abs(gun.ammo - 2) < 1e-9);
assert.equal(advancePaidService([], [station, disconnected], 10).spent, 0);
assert.equal(disconnected.ammo, 0);
const ground = newGroundDefense();
ground.structures.push({
  id: 'wall',
  kind: 'barricade',
  a: [0, 0],
  b: [0.1, 0],
  hp: 50,
  maxHp: 100,
});
gun.ammo = 0;
const shared = advancePaidService([], [station, gun], 0.2, {}, 1, ground);
assert.ok(Math.abs(shared.spent - 0.2) < 1e-9);
assert.equal(ground.structures[0].hp, 60);
assert.ok(Math.abs(gun.ammo - 1) < 1e-9, 'fair allocation with wall');
const castor = {
  type: 'castor',
  state: { p: [2, 0.2, 2], hp: 100, engine: 1, wing: 1 },
  supplies: { fuel: 300, ammo: { pilot: 500 }, revision: 0 },
};
const mobileGun = { ...disconnected, ammo: 0 };
assert.ok(advancePaidService([castor], [mobileGun], 10).spent > 0);
assert.ok(mobileGun.ammo > 0);

let now = 100000;
const game = new Game({ now: () => now });
const join = game.join({ code: 'DCAFIRE', name: 'Tireur' });
const r = game.rooms.get('DCAFIRE');
const p = r.pilots.get(join.id);
const positioned = { kind: 'dca', x: 0, y: 0.01, z: 0.1, ammo: 2, slot: 0, name: 'Canon' };
r.equipment.push(positioned);
p.mode = 'turret';
p.state.turret = 0;
const fire = (shot, incarnation = p.incarnation) =>
  game.command('DCAFIRE', p.id, 'fixed-dca-fire', { shot, incarnation, station: 0 });
fire('round-1');
assert.equal(positioned.ammo, 1);
fire('round-1');
assert.equal(positioned.ammo, 1, 'same shot cannot debit twice');
assert.throws(() => fire('round-fast'), /recharge/);
assert.equal(positioned.ammo, 1);
now += FLAK.interval * 1000 + 10;
fire('round-2');
assert.equal(positioned.ammo, 0);
now += FLAK.interval * 1000 + 10;
assert.throws(() => fire('round-empty'), /court de munitions/);
assert.equal(positioned.ammo, 0);
p.mode = 'foot';
assert.throws(() => fire('round-unauthorized'), /Occupez/);
assert.equal(positioned.ammo, 0);
console.log(
  'Fixed DCA: finite ammo, charged shot idempotence, cooldown, no remote reload, shared budget OK',
);

const rapid = { ...positioned, kind: 'dcaRapid', ammo: 10 };
r.equipment[0] = rapid;
p.mode = 'turret';
const rapidShot = (n) => p.id + ':rapid:' + n;
const fireRapid = (shots) =>
  game.command('DCAFIRE', p.id, 'fixed-dca-fire', {
    shots,
    incarnation: p.incarnation,
    station: 0,
  }).accepted;
const burst = Array.from({ length: 8 }, (_, i) => rapidShot(i));
assert.deepEqual(fireRapid(burst), burst, 'bounded jitter allowance');
assert.equal(rapid.ammo, 2);
assert.deepEqual(fireRapid(burst), burst, 'retry confirms without debiting again');
assert.equal(rapid.ammo, 2);
assert.deepEqual(fireRapid([rapidShot(8)]), []);
const ally = r.pilots.get(game.join({ code: 'DCAFIRE', name: 'Allié' }).id);
function rapidHit(shot) {
  game.command('DCAFIRE', p.id, 'fixed-dca-impacts', { impacts: [{ target: ally.id, shot }] });
}
rapidHit(rapidShot(8));
assert.equal(ally.health, 100, 'a refused round cannot damage an ally');
now += 15;
assert.deepEqual(fireRapid([rapidShot(8)]), [rapidShot(8)]);
rapidHit(rapidShot(8));
assert.equal(ally.health, 25);
rapidHit(rapidShot(8));
assert.equal(ally.health, 25, 'an impact is applied only once');
now += 15;
assert.deepEqual(fireRapid([rapidShot(9), rapidShot(10)]), [rapidShot(9)], 'last partial burst');
assert.equal(rapid.ammo, 0);
assert.equal(r.fixedDcaShots.size, 2, 'rapid fire has its own shot ledger');

const heavy = { ...positioned, kind: 'dcaHeavy', ammo: 2, lastShotAt: undefined };
r.equipment[0] = heavy;
const minimumAim = [0, Math.sin(Math.PI / 36), -Math.cos(Math.PI / 36)];
const launch = (shot, proximity = 5, direction = minimumAim) =>
  game.command('DCAFIRE', p.id, 'heavy-dca-fire', {
    station: 0,
    shot,
    proximity,
    incarnation: p.incarnation,
    direction,
  });
assert.throws(() => launch('below-stop', 5, [0, 0, -1]), /Visée/);
launch('heavy-1', 1000);
assert.equal(heavy.ammo, 1);
assert.equal(r.ordnance.at(-1).proximity, 20, 'same fuse bounds as mobile DCA');
assert.deepEqual(r.ordnance.at(-1).p, heavyDcaMuzzle(heavy, minimumAim));
assert.throws(() => launch('heavy-2'), /recharge/);
now += 1000;
launch('heavy-2');
assert.equal(heavy.ammo, 0);
assert.equal(HEAVY.dcaHeavy.radius, HEAVY.proximity.radius * 3);
assert.equal(HEAVY.dcaHeavy.damage, HEAVY.proximity.damage * 3);
assert.equal(HEAVY.dcaHeavy.edge, HEAVY.proximity.edge * 3);
const record = r.ordnance.at(-1);
heavy.ammo = 1;
now += 1000;
launch('vertical', 5, [0, 1, 0]);
assert.equal(r.ordnance.at(-1).v[1], HEAVY.dcaHeavy.speed);
record.p = [0, 1, 0];
const equivalent = { ...structuredClone(record), weapon: 'proximity' };
const wall = { min: { x: -0.1, y: 0.9, z: -0.7 }, max: { x: 0.1, y: 1.1, z: -0.69 } };
const world = { solids: [wall], frames: () => [], vehicles: [], players: [], equipment: [] };
assert.equal(stepHeavy(record, record.at + 299, world), null, 'fuse stays inert before 0.3 s');
const burstHeavy = stepHeavy(record, record.at + 800, world);
assert.ok(burstHeavy, 'arming followed by detonation near the solid');
assert.equal(stepHeavy(equivalent, equivalent.at + 299, world), null);
assert.deepEqual(burstHeavy, stepHeavy(equivalent, equivalent.at + 800, world));

assert.equal(shopPrice('dcaRapid', 2), 50);
assert.equal(shopPrice('dcaHeavy', 2), 30);
for (const [kind, count] of [
  ['dca', 2],
  ['dcaRapid', 4],
  ['dcaHeavy', 1],
]) {
  const installed = { kind, x: 0.2, y: 0.5, z: -0.3 };
  const model = makeFixedDca(T, installed);
  const direction = new T.Vector3(0.1, 0.7, -1).normalize();
  aimGun(T, model.userData.yaw, direction);
  const mouths = model.userData.muzzles.map((m) => m.getWorldPosition(new T.Vector3()));
  assert.equal(new Set(mouths.map((p) => p.toArray().join(','))).size, count);
  if (kind === 'dcaHeavy')
    assert.ok(
      mouths[0].distanceTo(new T.Vector3(...heavyDcaMuzzle(installed, direction.toArray()))) < 1e-9,
    );
}

// Front rim vertices of the two upper sleeves in the supplied GLB, in source
// coordinates. They meet the barrels and must keep the same relative positions
// as the four muzzle anchors through the full range of elevation.
const rapidModel = makeFixedDca(T, { kind: 'dcaRapid' });
const pivot = rapidModel.userData.pitch.position;
const xAxis = new T.Vector3(1, 0, 0);
const upperSleeves = [
  [0.030029, 0.142334, -0.157471],
  [-0.068115, 0.142334, -0.157471],
].map(([x, y, z]) =>
  new T.Vector3(x, y + 0.275635, z).multiplyScalar(5).sub(pivot).applyAxisAngle(xAxis, -0.455),
);
for (const elevation of [Math.PI / 36, 0.455, Math.PI / 2]) {
  aimGun(T, rapidModel.userData.yaw, new T.Vector3(0, Math.sin(elevation), -Math.cos(elevation)));
  const vertices = [];
  rapidModel.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const positions = mesh.geometry.attributes.position;
    for (let index = 0; index < positions.count; index++)
      vertices.push(mesh.localToWorld(new T.Vector3().fromBufferAttribute(positions, index)));
  });
  for (const rim of upperSleeves) {
    const expected = rim
      .clone()
      .applyAxisAngle(xAxis, elevation)
      .add(pivot)
      .multiplyScalar(MAP.ratio);
    assert.ok(
      vertices.some((point) => point.distanceTo(expected) < 1e-7),
      `upper sleeve follows its barrel at elevation ${elevation}`,
    );
  }
}

// Read the first snapshot returned by the second signature, before any sync.
{
  const joined = game.join({ code: 'FLAKSEAT', name: 'Servant' });
  const room = game.rooms.get('FLAKSEAT');
  const pilot = room.pilots.get(joined.id);
  const body = game.base(room, pilot);
  const station = {
    ...heavy,
    x: OFFICE_LAYOUT.base.originX + body.x * ACTOR_UNIT,
    y: body.y,
    z: OFFICE_LAYOUT.base.originZ - body.z * ACTOR_UNIT,
    ammo: 120,
  };
  room.equipment = [station];
  const command = (path, data) => game.command('FLAKSEAT', pilot.id, path, data);
  command('equipment-select', { station: 0 });
  command('equipment-sign', { station: 0, form: 1, signature: true });
  const signed = command('equipment-sign', { station: 0, form: 2, signature: true });
  assert.equal(signed.pilots.find((p) => p.id === pilot.id).mode, 'turret');
  assert.ok(
    !signed.base.bodies.some((b) => b.entity === pilot.id),
    'remove the outside avatar on boarding',
  );
  const exited = command('turret');
  assert.ok(
    exited.base.bodies.some((b) => b.entity === pilot.id),
    'restore the walker on exit',
  );
}

// Run the station portion of the real client update after signing, with the
// previous walking camera still far behind. At vertical aim it must follow the
// barrel, preserve azimuth and stay clear of the muzzle.
const stationClient = readFileSync('src/client.js', 'utf8');
// Insert a rotated Flak through the real client reconciliation before the
// first scene render, when the mesh's parent matrix has not yet updated.
{
  const source = stationClient.slice(
    stationClient.indexOf('const turrets = [];'),
    stationClient.indexOf('function clampTurretPitch('),
  );
  const { originX, originZ, deckY } = OFFICE_LAYOUT.base;
  const flak = {
    kind: 'dcaHeavy',
    slot: 0,
    x: originX + MAP.metres(8),
    y: deckY,
    z: originZ,
    angle: Math.PI / 4,
  };
  const colliders = [];
  runInNewContext(source + 'reconcileEquipment([flak]);', {
    T,
    MAP,
    ACTOR_UNIT,
    scene: new T.Scene(),
    colliders,
    stationRings: [],
    roleEntry: () => new T.Group(),
    humanoid: () => new T.Group(),
    flak,
    makeFixedDca,
    makeInstallationCollider,
    stationEntryOffset,
    isFixedDca: () => true,
    isFortification: () => false,
  });
  const [collision] = colliders;
  assert.ok(collision.oriented);
  assert.ok(colliderContainsXZ(collision, flak.x, flak.z), 'the base remains solid');
  const size = collision.getSize(new T.Vector3());
  assert.ok(size.x < MAP.metres(8) && size.z < MAP.metres(8) && size.y < MAP.metres(2));
  const body = { x: 0, z: 0, y: deckY + 0.05 * ACTOR_UNIT, vx: 0, vz: 0, r: 0.32, grounded: true };
  const deck = new T.Box3(
    new T.Vector3(originX - 1, deckY - 0.1, originZ - 1),
    new T.Vector3(originX + 1, deckY, originZ + 1),
  );
  stepWalker(body, 1 / 60, [deck, collision]);
  assert.equal(body.x, 0, 'Flak beside the spawn must not push the walker');
  assert.equal(body.z, 0);
}

const stationUpdate = stationClient.slice(
  stationClient.indexOf('  for (let index = 0; index < turrets.length; index++)'),
  stationClient.indexOf('function fireRapidDca('),
);
const sightGun = makeFixedDca(T, { kind: 'dcaHeavy', x: 0.2, y: 0.5, z: -0.3 });
const sightCamera = new T.PerspectiveCamera();
sightGun.userData.person = new T.Object3D();
const pitchAxis = new T.Vector3(1, 0, 0);
const heavyBreech = new T.Vector3(-0.027588, -0.021729 + 0.288818, -0.047119)
  .multiplyScalar(6.7)
  .sub(sightGun.userData.pitch.position)
  .applyAxisAngle(pitchAxis, -0.37);
for (const elevation of [Math.PI / 36, Math.PI / 2]) {
  sightCamera.position.set(-2, 1, 3);
  const direction = new T.Vector3(0, Math.sin(elevation), -Math.cos(elevation));
  runInNewContext('function updateVehicles(dt) {\n' + stationUpdate + '\nupdateVehicles(0);', {
    T,
    MAP,
    aimGun,
    positionHeavyFlakSight,
    isFixedDca: (kind) => kind === 'dcaHeavy',
    FIXED_DCA: { dcaHeavy: { interval: 1 } },
    FORTIFICATIONS: {},
    stations: [{ kind: 'dcaHeavy', ammo: 0 }],
    turrets: [sightGun],
    turretIndex: 0,
    id: 'servant',
    snap: { pilots: [{ id: 'servant', life: 'alive', mode: 'turret', state: { turret: 0 } }] },
    turretDirection: () => direction,
    controlFocus: { active: false },
    uiWeaponFire: false,
    camera: sightCamera,
    wearAppearance: () => {},
  });
  const muzzle = sightGun.userData.muzzles[0].getWorldPosition(new T.Vector3());
  assert.ok(
    sightCamera.position.distanceTo(muzzle.clone().addScaledVector(direction, MAP.metres(0.15))) <
      1e-8,
  );
  assert.ok(sightCamera.getWorldDirection(new T.Vector3()).distanceTo(direction) < 1e-8);
  assert.equal(sightGun.userData.person.visible, false);

  const expected = sightGun.userData.pitch.localToWorld(heavyBreech.clone());
  const vertices = [];
  sightGun.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const positions = mesh.geometry.attributes.position;
    for (let index = 0; index < positions.count; index++)
      vertices.push(mesh.localToWorld(new T.Vector3().fromBufferAttribute(positions, index)));
  });
  assert.ok(
    vertices.some((point) => point.distanceTo(expected) < 1e-7),
    'the heavy breech follows the tube',
  );
}

// Vehicle orders deploy by parachute and must initialise the same reserve.
for (const [item, expectedPrice, ammo] of [
  ['dcaRapid', 50, 1000],
  ['dcaHeavy', 30, 120],
]) {
  const buyer = game.join({ code: 'DCABUY', name: 'Acheteur' });
  const room = game.rooms.get('DCABUY'),
    pilot = room.pilots.get(buyer.id);
  const carrier = [...room.vehicles.values()][0];
  const command = (path, data) => game.command('DCABUY', pilot.id, path, data);
  Object.assign(pilot, { mode: 'flight', vehicle_id: carrier.id });
  room.dollars = 50;
  command('purchase-sign', {
    item,
    expectedPrice,
    request: 'order-' + item,
    signature: true,
    epoch: room.base.epoch,
    incarnation: pilot.incarnation,
  });
  assert.equal(room.dollars, 50 - expectedPrice);
  assert.equal(room.deliveries.at(-1).item, item);
  now += 12000;
  game.advanceDeliveries(room, now);
  assert.equal(room.equipment.at(-1).kind, item);
  assert.equal(room.equipment.at(-1).ammo, ammo);
}
console.log(
  'Fixed DCA variants: price, rapid fire acceptance, heavy cadence, proximity and muzzle alignment OK',
);
