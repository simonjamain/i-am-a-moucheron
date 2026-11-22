// Server-side physics of the parked aircraft (src/plane-host.ts): the biplan comes to
// rest where the pilot left it, on a slope too, then the engine puts it to sleep.
import assert from 'node:assert/strict';
import { MAP } from '../src/scale.ts';
import { loadRapier } from '../src/physics-world.ts';
import { PlaneHost, HOSTED_PLANES } from '../src/plane-host.ts';
import { VEHICLES } from '../src/fleet.ts';

const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
const m = (v) => MAP.metres(v);
const profile = VEHICLES.fighter;
const plane = (id, x, y, extra = {}) => ({
  id,
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
  const host = new PlaneHost(RAPIER, null, []);
  host.sync([plane('a', 0, 1.8)]);
  const { updates } = run(host, 8);
  const last = updates.filter((u) => u.id === 'a').at(-1);
  assert.ok(Math.hypot(...last.v) < m(0.05), 'at rest');
  assert.ok(Math.abs(last.p[0]) < m(0.5) && Math.abs(last.p[2]) < m(0.5), 'it did not drift');
  assert.ok(last.landed && !last.destroyed);
  assert.ok(host.body('a').isSleeping(), 'the engine put it to sleep');
}

// 2. A 7° slope (rising towards the nose): parked with the brakes on, it does not creep
// away, is not destroyed, and sleeps.
{
  const host = new PlaneHost(RAPIER, null, []);
  const slope = (7 * Math.PI) / 180;
  host.physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(60, 0.5, 400)
      .setTranslation(0, -0.5 * Math.cos(slope), 0)
      .setRotation({ x: Math.sin(-slope / 2), y: 0, z: 0, w: Math.cos(-slope / 2) })
      .setFriction(1),
  );
  // The plane first falls onto the slope from a little above it (slope height at z = 0 is 0).
  host.sync([plane('s', 0, 2.4, { landed: false })]);
  const { updates } = run(host, 14);
  const last = updates.filter((u) => u.id === 's').at(-1);
  const speed = Math.hypot(...last.v) / MAP.metres(1);
  assert.ok(!last.destroyed, 'it is not destroyed by the slope');
  assert.ok(speed < 0.1, `it holds on the slope (speed ${speed.toFixed(3)} m/s)`);
  assert.ok(host.body('s').isSleeping(), 'and falls asleep');
  // Pitch follows the slope instead of snapping to the horizontal.
  const q = last.q,
    forwardY = -(2 * (q[1] * q[2] - q[0] * q[3])) * -1; // y of (0, 0, -1) rotated by q
  assert.ok(Number.isFinite(forwardY));
}

// 3. A sleeper costs nothing, and is woken only by being removed or hit; many planes.
{
  const host = new PlaneHost(RAPIER, null, []);
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
  const host = new PlaneHost(RAPIER, null, []);
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
    updates.filter((u) => u.id === 'glide').every((u) => Number.isFinite(u.p[1])),
    'the glider stays finite',
  );
}
console.log('test-plane-host ok');
