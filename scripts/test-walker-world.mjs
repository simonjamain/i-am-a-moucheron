// Walking through the room with Rapier's character controller (src/walker-world.ts):
// steps are climbed, walls slide, ledges are walked off, ceilings stop a jump, and the spawn
// at floor level is lifted onto the surface.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.webgpu.min.js';
import { ACTOR_UNIT as U } from '../src/scale.ts';
import { stepWalker } from '../src/sortie.ts';
import { jumpWalker } from '../src/field-physics.ts';
import { OFFICE_FRAME } from '../src/base.ts';
import { walkerWorld } from './walker-harness.mjs';

const f = OFFICE_FRAME;
const box = (x0, y0, z0, x1, y1, z1) =>
  new T.Box3(new T.Vector3(x0, y0, z0), new T.Vector3(x1, y1, z1));
// Arena units (x right, z mirrored) <-> the world, as the frame does.
const at = (x, z, y = 0.05 * U) => ({
  x,
  z,
  y,
  vx: 0,
  vy: 0,
  vz: 0,
  r: 0.35,
  grounded: true,
});
const worldX = (b) => f.originX + b.x * f.unit;
const run = (body, world, steps, push) => {
  for (let i = 0; i < steps; i++) {
    push(body);
    stepWalker(body, 1 / 60, world, f);
  }
};

// Spawned at floor level, a walker is set on the floor at its hover height.
{
  const body = { ...at(0, 0, 0) };
  stepWalker(body, 1 / 60, walkerWorld([box(10, 10, 10, 11, 11, 11)]), f);
  assert.ok(Math.abs(body.y - 0.05 * U) < 0.02 * U, `floor level: ${body.y / U}`);
  assert.ok(body.grounded);
}

// A low step (0.1 actor units) is climbed, a wall (2 units) is not, and the walker slides along it.
{
  const step = box(
    f.originX + 3 * U,
    0,
    f.originZ - 5 * U,
    f.originX + 6 * U,
    0.1 * U,
    f.originZ + 5 * U,
  );
  const wall = box(
    f.originX + 10 * U,
    0,
    f.originZ - 5 * U,
    f.originX + 11 * U,
    2 * U,
    f.originZ + 5 * U,
  );
  const world = walkerWorld([step, wall]);
  const body = at(0, 0);
  run(body, world, 90, (b) => (b.x += 0.1));
  assert.ok(body.grounded, 'still standing after the step');
  assert.ok(body.x > 9 * 0.9, `climbed on: ${body.x}`);
  // Pushing into the wall: stopped before it, and the push is no longer speed.
  body.vx = 5;
  run(body, world, 60, (b) => (b.x += 0.1));
  assert.ok(worldX(body) < wall.min.x, 'stopped by the wall');
  assert.ok(wall.min.x - worldX(body) < 0.6 * U, 'right against it');
  // Sliding along a wall: z keeps moving while x is blocked.
  const z0 = body.z;
  run(body, world, 30, (b) => {
    b.x += 0.1;
    b.z += 0.1;
  });
  assert.ok(body.z > z0 + 1, 'slides along the wall');
}

// Off a ledge it falls; landing gives an impact; a ceiling stops a jump.
{
  const ledge = box(
    f.originX - 50 * U,
    0,
    f.originZ - 50 * U,
    f.originX + 2 * U,
    2 * U,
    f.originZ + 50 * U,
  );
  const world = walkerWorld([ledge]);
  const body = at(0, 0, 2 * U + 0.05 * U);
  run(body, world, 20, (b) => (b.x += 0.3));
  assert.equal(body.grounded, false, 'walked off the ledge');
  let impact = null;
  for (let i = 0; i < 600 && !impact; i++) impact = stepWalker(body, 1 / 60, world, f);
  assert.ok(impact && body.grounded, 'landed on the floor');
  assert.ok(Math.abs(body.y - 0.05 * U) < 0.02 * U, 'at floor height ' + body.y / U);
}
{
  const ceiling = box(f.originX - 5, 2 * U, f.originZ - 5, f.originX + 5, 2.5 * U, f.originZ + 5);
  const world = walkerWorld([ceiling]);
  const body = at(0, 0);
  stepWalker(body, 1 / 60, world, f);
  assert.ok(jumpWalker(body));
  let top = 0;
  for (let i = 0; i < 90; i++) {
    stepWalker(body, 1 / 60, world, f);
    top = Math.max(top, body.y);
  }
  // The capsule's top is 1.655 units over the reference point (1.7 minus hover plus skin).
  assert.ok(top + 1.655 * U <= 2 * U + 0.06 * U, `head stays under the ceiling: ${top / U}`);
  assert.ok(top > 0.15 * U, `but it did jump: ${top / U}`);
}
console.log(
  'Walker world: steps climbed, walls slide, ledges fall, ceilings stop jumps, spawn lifted.',
);
