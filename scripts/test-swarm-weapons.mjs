import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { wavePlan, waveBudget, swarmFrame } from '../src/waves.js';
import { MAP, ACTOR_UNIT } from '../src/scale.js';
import { createGraphics } from '../src/graphics.js';
import { makeAntiaircraft, aimGun, gunnerView, AA_STATIONS } from '../src/sortie.js';
import { makeTracer, updateTracer } from '../src/tracers.js';
import { vehicleEntry } from '../src/fleet.js';
import { bodyMotion } from '../src/purgatory-physics.js';
import { OFFICE_LAYOUT } from '../src/layout.js';
import { localDB } from './local-db.mjs';
import worker from '../worker/index.js';
for (const wave of [1, 2, 3, 5, 10, 30, 100, 1000]) {
  const plan = wavePlan('SWARM', wave, 1234);
  assert.equal(
    plan.roster.reduce((s, e) => s + e.cost, 0),
    waveBudget(wave),
  );
  assert.ok(plan.roster.length <= 180);
  assert.deepEqual(plan, wavePlan('SWARM', wave, 1234));
  if (wave > 1) assert.ok(plan.budget >= waveBudget(wave - 1));
}
assert.equal(wavePlan('SWARM', 1, 1).roster.length, 8);
assert.notDeepEqual(wavePlan('SWARM', 8, 1).roster, wavePlan('SWARM', 8, 2).roster);
const plan = wavePlan('SWARM', 10, 1),
  frame = swarmFrame(plan.roster, 100),
  next = swarmFrame(plan.roster, 100.01);
assert.deepEqual(frame, swarmFrame(plan.roster, 100));
for (let i = 0; i < frame.length; i++)
  if (frame[i] && next[i]) {
    assert.ok(frame[i].p.every(Number.isFinite));
    const a = new T.Vector3().fromArray(frame[i].p),
      b = new T.Vector3().fromArray(next[i].p);
    assert.ok(a.distanceTo(b) / 0.01 < MAP.metres(90), 'bounded traversal speed on later routes');
  }
const scene = new T.Scene(),
  graphics = createGraphics(T, scene),
  bomber = graphics.makeBomber('#ccc');
bomber.scale.setScalar(ACTOR_UNIT);
bomber.quaternion.setFromEuler(new T.Euler(0.1, 0.7, 0.2));
for (const mount of bomber.userData.turrets) {
  assert.ok(mount.userData.muzzle && mount.userData.pitch);
  for (const dir of [
    new T.Vector3(0, 0, -1),
    new T.Vector3(1, 0.3, 0.5).normalize(),
    new T.Vector3(-0.3, 0.7, 1).normalize(),
    new T.Vector3(0.1, 0.99, 0.1).normalize(),
  ]) {
    aimGun(T, mount, dir, bomber.quaternion);
    const actual = new T.Vector3(0, 0, -1).transformDirection(mount.userData.pitch.matrixWorld);
    assert.ok(actual.dot(dir) > 0.999999);
    const view = gunnerView(
      T,
      mount,
      dir,
      new T.Vector3(0, 1, 0).applyQuaternion(bomber.quaternion),
    );
    assert.ok(view.eye.distanceTo(view.muzzle) > MAP.metres(2));
    const sideways = view.eye.clone().sub(view.muzzle).cross(dir).length();
    assert.ok(sideways > MAP.metres(0.5), 'offset view must reveal tracer path');
  }
}
for (const gun of makeAntiaircraft(T, scene, graphics)) {
  gun.userData.yaw.userData.pitch = gun.userData.pitch;
  for (const dir of [
    new T.Vector3(0, 0.7, -0.7).normalize(),
    new T.Vector3(1, 0.3, 0.1).normalize(),
  ]) {
    aimGun(T, gun.userData.yaw, dir);
    const actual = new T.Vector3(0, 0, -1).transformDirection(gun.userData.pitch.matrixWorld);
    assert.ok(actual.dot(dir) > 0.999999);
    const left = gun.userData.muzzles[0].getWorldPosition(new T.Vector3()),
      right = gun.userData.muzzles[1].getWorldPosition(new T.Vector3());
    assert.ok(Math.abs(left.distanceTo(right) - MAP.metres(0.72)) < 1e-9);
  }
}
const tracer = makeTracer(T, scene, new T.Vector3(0, 1, -1), new T.Vector3(0, 0, -1), '#ffcc64');
assert.equal(tracer.children.length, 2);
assert.ok(tracer.userData.length >= MAP.metres(10));
assert.equal(tracer.userData.core.material.isMeshBasicMaterial, true);
assert.equal(tracer.userData.halo.material.depthWrite, false);
const camera = new T.PerspectiveCamera(60, 1, 0.00005, 40);
updateTracer(T, tracer, new T.Vector3(0, 0, -1), camera);
assert.ok(tracer.scale.x >= 1 && tracer.scale.x <= 8);
tracer.userData.dispose();
scene.remove(tracer);
const DB = localDB();
async function api(path, data) {
  const r = await worker.fetch(
    new Request('https://test.local/api/' + path, { method: 'POST', body: JSON.stringify(data) }),
    { DB },
  );
  return { status: r.status, body: await r.json() };
}
const p = (await api('join', { name: 'Armurier', code: 'ARSENAL' })).body,
  q = (await api('join', { name: 'Concurrent', code: 'ARSENAL' })).body;
async function ground(player, world) {
  const snap = (await api('sync', { id: player.id, state: player.state })).body,
    body = snap.base.bodies.find((b) => b.entity === player.id);
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
const signature = Array.from({ length: 12 }, (_, i) => [
  0.1 + i * 0.05,
  0.5 + Math.sin(i) * 0.1,
  i ? 1 : 0,
]);
await DB.prepare('INSERT INTO equipment(room,slot,state,request) VALUES(?,?,?,?)')
  .bind('ARSENAL', 0, JSON.stringify(AA_STATIONS[0]), 'fixture-dca')
  .run();
const pg = await ground(p, AA_STATIONS[0]),
  qg = await ground(q, AA_STATIONS[0]);
assert.equal((await api('turret', { id: p.id, station: 0, ground: pg })).status, 409);
assert.equal(
  (await api('equipment-sign', { id: p.id, station: 0, form: 2, signature, ground: pg })).status,
  409,
);
for (const [player, g] of [
  [p, pg],
  [q, qg],
]) {
  assert.equal(
    (await api('equipment-select', { id: player.id, station: 0, ground: g })).status,
    200,
  );
  assert.equal(
    (await api('equipment-sign', { id: player.id, station: 0, form: 1, signature, ground: g }))
      .status,
    200,
  );
}
const claims = await Promise.all(
  [
    [p, pg],
    [q, qg],
  ].map(([player, g]) =>
    api('equipment-sign', { id: player.id, station: 0, form: 2, signature, ground: g }),
  ),
);
assert.deepEqual(claims.map((x) => x.status).sort(), [200, 409]);
const gunner = claims[0].status === 200 ? p : q;
await DB.prepare("UPDATE rooms SET phase='combat',wave=8,started=? WHERE code='ARSENAL'")
  .bind(Date.now())
  .run();
const state = (await api('sync', { id: gunner.id, state: gunner.state })).body;
const heavy = state.roster.find((e) => e.hp >= 400);
assert.ok(heavy);
const first = { id: gunner.id, wave: 8, enemy: heavy.id, amount: 10, shot: 'same' };
await Promise.all([api('hit', first), api('hit', first)]);
let reply = (await api('sync', { id: gunner.id, state: gunner.state })).body;
assert.equal(reply.enemyDamage[heavy.id], 10);
assert.ok(!reply.kills.includes(heavy.id));
for (let i = 1; i < Math.ceil(heavy.hp / 10); i++)
  await api('hit', { ...first, shot: 'round-' + i });
reply = (await api('sync', { id: gunner.id, state: gunner.state })).body;
assert.ok(reply.kills.includes(heavy.id));
assert.equal(
  (
    await DB.prepare("SELECT COUNT(*) AS n FROM souls WHERE room='ARSENAL' AND entity=?")
      .bind('8:' + heavy.id)
      .first()
  ).n,
  1,
);
// Each entry requires fresh equipment forms, including re-entry to a DCA.
assert.equal((await api('turret', { id: gunner.id })).status, 200);
const again = await ground(gunner, AA_STATIONS[0]);
assert.equal((await api('turret', { id: gunner.id, station: 0, ground: again })).status, 409);
assert.equal(
  (await api('equipment-select', { id: gunner.id, station: 0, ground: again })).status,
  200,
);
assert.equal(
  (await api('equipment-sign', { id: gunner.id, station: 0, form: 2, ground: again, signature }))
    .status,
  409,
);
console.log(
  'PASS: exact rising budgets, seeded varied rosters, bounded deterministic flock flow, visible tracer geometry, gun mount directions and offset views, mandatory equipment papers, exclusive DCA claims, elite health, deduplicated damage and single soul.',
);

for (const mount of bomber.userData.turrets) {
  const up = new T.Vector3(0, 1, 0).applyQuaternion(bomber.quaternion),
    dir = up
      .clone()
      .multiplyScalar(0.95)
      .add(new T.Vector3(0, 0, -0.2))
      .normalize();
  aimGun(T, mount, dir, bomber.quaternion);
  const view = gunnerView(T, mount, dir, up),
    origin = mount.getWorldPosition(new T.Vector3());
  assert.ok(
    view.eye.clone().sub(origin).dot(up) > MAP.metres(1.1),
    'looking upward must not lower the gunner camera into the aircraft',
  );
}
