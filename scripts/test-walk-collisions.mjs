// Issue #135: the walking collision is half as wide (players and furniture),
// players still bump into each other, and shot volumes are unaffected.
import assert from 'node:assert/strict';
import { advanceArena, createSoul, SOUL_RADIUS } from '../src/purgatory-physics.js';
import { BASE_WALK_RADIUS, baseBody, footstepsAudible } from '../src/base.js';
import { stepWalker } from '../src/sortie.js';
import { OFFICE_LAYOUT } from '../src/layout.js';
import { ACTOR_UNIT } from '../src/scale.js';

assert.ok(BASE_WALK_RADIUS <= 0.32 / 2, 'office: at most half the former 0.32');
assert.ok(SOUL_RADIUS <= 0.48 / 2, 'purgatory: at most half the former 0.48');
assert.equal(baseBody({ bay: 0, id: 'a', name: 'A' }, 0).r, BASE_WALK_RADIUS);

// Two players walking past each other 0.6 apart: they used to lock (0.96 > 0.6).
function arena(offset) {
  const a = {
    bodies: [0, 1].map((i) =>
      Object.assign(createSoul({ id: i + 1, entity: 'p' + i, kind: 'player' }, 0, 0), {
        x: 12 + i * offset, // far from the purgatory desk
        z: i ? 7 : 13,
        input: { x: 0, z: i ? 1 : -1 },
      }),
    ),
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    obstacles: [],
    time: 0,
  };
  for (let t = 50; t <= 3000; t += 50) {
    for (const b of a.bodies)
      Object.assign(b, { input: { x: 0, z: b.entity === 'p1' ? 1 : -1 }, inputAt: t });
    advanceArena(a, t);
  }
  return a.bodies;
}
const [p0, p1] = arena(0.6);
assert.ok(p0.z < 9 && p1.z > 11, 'players cross without locking: ' + [p0.z, p1.z]);
assert.ok(Math.abs(p0.x - 12) < 0.1 && Math.abs(p1.x - 12.6) < 0.1, 'no sideways shove');
// Head-on players still collide: never traversable (soft contact keeps ~0.01 %).
const [h0, h1] = arena(0);
assert.ok(Math.hypot(h0.x - h1.x, h0.z - h1.z) >= 2 * SOUL_RADIUS * 0.98, 'players remain solid');

// Office walker beside a crate: blocked only at its new, slimmer reach.
const origin = OFFICE_LAYOUT.base;
const crate = {
  min: { x: origin.originX + 0.5 * ACTOR_UNIT, y: origin.deckY, z: origin.originZ - 1 },
  max: {
    x: origin.originX + 1.5 * ACTOR_UNIT,
    y: origin.deckY + 2 * ACTOR_UNIT,
    z: origin.originZ + 1,
  },
};
const walker = (x) => ({
  x,
  z: 0,
  y: origin.deckY + 0.05 * ACTOR_UNIT,
  vy: 0,
  grounded: true,
  r: BASE_WALK_RADIUS,
});
// 0.2 from the crate: free now (the former 0.32 radius pushed it back to 0.18).
const free = walker(0.3);
stepWalker(free, 1 / 60, [crate]);
near(free.x, 0.3, 1e-9, 'passes beside the crate');
// 0.1 from the crate: still blocked, at the slim radius.
const blocked = walker(0.4);
stepWalker(blocked, 1 / 60, [crate]);
near(blocked.x, 0.5 - BASE_WALK_RADIUS, 1e-9, 'walls still block');
// Footsteps: on the ground only, never falling or under the parachute.
assert.equal(footstepsAudible({ grounded: true, parachute: false }, 2), true);
assert.equal(footstepsAudible({ grounded: true }, 0.3), false, 'too slow');
assert.equal(footstepsAudible({ grounded: false, parachute: false }, 8), false, 'free fall');
assert.equal(footstepsAudible({ grounded: false, parachute: true }, 3), false, 'parachute');
assert.equal(footstepsAudible({ grounded: true, parachute: true }, 3), false, 'canopy collapsing');
const lander = {
  x: 0.3,
  z: 0,
  y: OFFICE_LAYOUT.base.deckY + 2 * ACTOR_UNIT,
  vy: -1,
  grounded: false,
  parachute: true,
  r: BASE_WALK_RADIUS,
};
assert.equal(footstepsAudible(lander, 2), false, 'descending');
for (let i = 0; i < 600 && !lander.grounded; i++) stepWalker(lander, 1 / 60, []);
assert.ok(lander.grounded && !lander.parachute, 'landed');
assert.equal(footstepsAudible(lander, 2), true, 'steps resume after landing');
console.log(
  'Walk collisions: radius ' +
    BASE_WALK_RADIUS +
    ' (office) / ' +
    SOUL_RADIUS +
    ' (purgatory), players cross and stay solid, furniture blocks, footsteps only on the ground.',
);

function near(a, b, eps, label) {
  assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} vs ${b}`);
}
