// Server-side physics of the parked vehicles (src/parked-host.ts): the biplan comes to
// rest where the pilot left it, on a slope too, then the engine puts it to sleep.
import assert from 'node:assert/strict';
import { MAP } from '../src/scale.ts';
import { loadRapier } from '../src/physics-world.ts';
import { ParkedHost, HOSTED_PLANES, HOSTED_GROUND, isHosted } from '../src/parked-host.ts';
import { PLANE_TYPES } from '../src/plane-physics.ts';
import { VEHICLES, vehiclePad } from '../src/fleet.ts';

const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
const m = (v) => MAP.metres(v);
const profile = VEHICLES.fighter;
const plane = (id, x, y, extra = {}, type = 'fighter') => ({
  id,
  type,
  profile,
  state: {
    p: [x, m(y), 0],
    q: [0, 0, 0, 1],
    v: [0, 0, 0],
    omega: [0, 0, 0],
    hp: 100,
    landed: true,
    ...extra,
  },
});
const run = (host, seconds, from = 0) => {
  let t = from,
    updates = [];
  for (; t < from + seconds * 1000; t += 50) updates = updates.concat(host.step(t));
  return { t, updates };
};
assert.ok(HOSTED_PLANES.has('fighter'));

// 1. On the floor: parked, it stays where it is and falls asleep.
{
  const host = new ParkedHost(RAPIER, null, []);
  host.sync([plane('a', 0, 1.8)]);
  const { updates } = run(host, 8);
  const last = updates.filter((u) => u.id === 'a').at(-1);
  assert.ok(Math.hypot(...last.state.v) < m(0.05), 'at rest');
  assert.ok(
    Math.abs(last.state.p[0]) < m(0.5) && Math.abs(last.state.p[2]) < m(0.5),
    'it did not drift',
  );
  assert.ok(last.state.landed && !last.destroyed);
  assert.ok(host.body('a').isSleeping(), 'the engine put it to sleep');
}

// 2. A 7° slope, nose uphill and nose downhill, for every aircraft: parked with the brakes
// on, the aircraft does not creep away, is not destroyed, and sleeps.
for (const type of PLANE_TYPES)
  for (const [name, sign] of [
    ['nose uphill', 1],
    ['nose downhill', -1],
  ]) {
    const host = new ParkedHost(RAPIER, null, []);
    const slope = (7 * Math.PI) / 180;
    // The surface rises towards -z (the nose) for a positive angle about x.
    host.physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(60, 0.5, 400)
        .setTranslation(0, -0.5 * Math.cos(slope), 0)
        .setRotation({
          x: Math.sin((sign * slope) / 2),
          y: 0,
          z: 0,
          w: Math.cos((sign * slope) / 2),
        })
        .setFriction(1),
    );
    host.sync([plane('s', 0, 3, { landed: false }, type)]);
    const { updates } = run(host, 16);
    const last = updates.filter((u) => u.id === 's').at(-1);
    const speed = Math.hypot(...last.state.v) / MAP.metres(1);
    const label = `${type} ${name}`;
    assert.ok(!last.destroyed, label + ': not destroyed by the slope');
    assert.ok(speed < 0.1, `${label}: it holds on the slope (speed ${speed.toFixed(3)} m/s)`);
    assert.ok(host.body('s').isSleeping(), label + ': and falls asleep');
  }

// 3. A sleeper costs nothing, and is woken only by being removed or hit; many planes.
{
  const host = new ParkedHost(RAPIER, null, []);
  const planes = Array.from({ length: 30 }, (_, i) => plane('p' + i, (i - 15) * m(12), 1.8));
  host.sync(planes);
  run(host, 8);
  assert.ok(
    planes.every((p) => host.body(p.id).isSleeping()),
    'all of them fall asleep',
  );
  const start = performance.now();
  run(host, 20, 8000);
  const ms = performance.now() - start;
  assert.ok(ms < 400, `20 s of 30 sleeping aircraft cost ${ms.toFixed(1)} ms`);
  host.sync(planes.slice(0, 10));
  assert.equal(host.size, 10, 'aircraft taken by a pilot leave the world');
}

// 4. Abandoned in a dive, it hits the floor hard and is destroyed; abandoned in level
// flight it glides down and may land (no controls, gentle sink rate).
{
  const pitch = -1.1,
    q = [Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)];
  const host = new ParkedHost(RAPIER, null, []);
  host.sync([
    plane('dive', 0, 40, { q, v: [0, -m(35), -m(20)], landed: false }),
    plane('glide', m(30), 60, { v: [0, 0, -m(40)], landed: false }),
  ]);
  const { updates } = run(host, 25);
  assert.ok(
    updates.some((u) => u.id === 'dive' && u.destroyed),
    'the dive ends in a crash',
  );
  assert.ok(
    updates.filter((u) => u.id === 'glide').every((u) => Number.isFinite(u.state.p[1])),
    'the glider stays finite',
  );
}
// 4b. A ground vehicle at rest reports no motion. The solver leaves a residue on a parked
// vehicle (a few tenths of a metre per second upwards, a slight spin); clients carry a vehicle
// on at its reported velocity, so a stale residue made a bought Castor or DCA truck creep
// upwards in the display (and a bought tank, a little less).
{
  for (const type of HOSTED_GROUND) {
    const host = new ParkedHost(RAPIER, null, []);
    host.physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(60, 0.5, 60).setTranslation(0, -0.5, 0),
    );
    const pad = { ...plane('g', 0, 0, {}, type), profile: VEHICLES[type] };
    pad.state.p = [0, VEHICLES[type].gear, 0];
    host.sync([pad]);
    const { updates } = run(host, 6);
    const mine = updates.filter((u) => u.id === 'g');
    const last = mine.at(-1).state;
    assert.ok(host.asleep('g'), type + ' fell asleep');
    assert.deepEqual(last.v, [0, 0, 0], type + ' asleep: no velocity reported');
    assert.deepEqual(last.omega ?? [0, 0, 0], [0, 0, 0], type + ' asleep: no spin reported');
    // While it settles and the solver's residue is small, the report is already zero.
    const calm = mine.filter((u) => Math.hypot(...u.state.v) === 0);
    assert.ok(calm.length > 0, type + ' reports rest before it is put to sleep');
    // The body itself carries no velocity either: waking it later starts from rest.
    const v = host.body('g').linvel(),
      w = host.body('g').angvel();
    assert.equal(Math.hypot(v.x, v.y, v.z, w.x, w.y, w.z), 0, type + ' body at rest');
  }
}
// 4c. A vehicle added to a world that has already stepped is simulated like the others. A bought
// Castor or DCA truck is added to the room's world, which has been stepping since the starter
// vehicles were born, exactly at its resting height (placed on the floor); a vehicle someone
// leaves is added the same way. Its suspension was updated before Rapier had stepped the new
// body, which left the body disabled for good: frozen where it was created, with the velocity
// of its first step (the display then carried it upwards).
{
  const bornAt = (id, type, dx) => {
    const pad = vehiclePad(type);
    return {
      id,
      type,
      profile: VEHICLES[type],
      state: { ...pad, p: [pad.p[0] + dx, pad.p[1], pad.p[2]], v: [0, 0, 0], omega: [0, 0, 0] },
    };
  };
  for (const type of ['castor', 'flaktruck', 'tank'])
    for (const settleSeconds of [0.25, 4]) {
      const host = new ParkedHost(RAPIER, null, []);
      const first = bornAt('first', 'tank', -0.3);
      host.sync([first]);
      const { t } = run(host, settleSeconds);
      const late = bornAt('late', type, 0.3);
      host.sync([first, late]);
      const { updates } = run(host, 6, t);
      const label = `${type} added after ${settleSeconds} s of stepping`;
      assert.ok(host.body('late').isEnabled(), label + ': the body is simulated, not disabled');
      const last = updates.filter((u) => u.id === 'late').at(-1).state;
      assert.notEqual(last.p[1], late.state.p[1], label + ': its suspension settled it');
      assert.ok(host.asleep('late'), label + ': it comes to rest and sleeps');
      assert.deepEqual(last.v, [0, 0, 0], label + ': no velocity once at rest');
    }
}
// 5. The ground vehicles share the world with the aircraft: each settles where it was left
// (a few millimetres above the floor), brakes on, is not destroyed, and is put to sleep; on a
// 7° slope too, uphill or downhill, never creeping away.
{
  assert.deepEqual([...HOSTED_GROUND].sort(), ['castor', 'flaktruck', 'tank']);
  assert.ok(
    isHosted('tank') && isHosted('spitfire') && isHosted('helicopter') && isHosted('flyingcastor'),
  );
  for (const type of HOSTED_GROUND)
    for (const [name, sign] of [
      ['flat', 0],
      ['nose uphill', 1],
      ['nose downhill', -1],
    ]) {
      const host = new ParkedHost(RAPIER, null, []);
      const slope = (7 * Math.PI) / 180;
      if (sign)
        host.physics.world.createCollider(
          RAPIER.ColliderDesc.cuboid(60, 0.5, 400)
            .setTranslation(0, -0.5 * Math.cos(slope), 0)
            .setRotation({
              x: Math.sin((sign * slope) / 2),
              y: 0,
              z: 0,
              w: Math.cos((sign * slope) / 2),
            })
            .setFriction(1),
        );
      const height = VEHICLES[type].gear + 0.002;
      host.sync([
        {
          id: 'g',
          type,
          profile: VEHICLES[type],
          state: {
            p: [0, height + (sign ? 0.004 : 0), 0],
            q: [0, 0, 0, 1],
            v: [0, 0, 0],
            omega: [0, 0, 0],
            hp: 100,
            landed: false,
          },
        },
      ]);
      const { updates } = run(host, 16);
      const last = updates.filter((u) => u.id === 'g').at(-1);
      const label = `${type} ${name}`;
      assert.ok(last && !last.destroyed, label + ': not destroyed');
      const speed = Math.hypot(last.state.v[0], last.state.v[2]) / MAP.metres(1);
      assert.ok(speed < 0.2, `${label}: at rest (${speed.toFixed(3)} m/s)`);
      assert.ok(host.asleep('g'), label + ': asleep');
    }
  // Planes and ground vehicles in the same world.
  const mixed = new ParkedHost(RAPIER, null, []);
  mixed.sync([
    plane('p', m(40), 1.8),
    { ...plane('t', -m(40), 1.8, {}, 'tank'), profile: VEHICLES.tank },
  ]);
  run(mixed, 8);
  assert.equal(mixed.size, 2);
}
console.log('test-parked-host ok');
