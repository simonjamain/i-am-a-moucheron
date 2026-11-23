import assert from 'node:assert/strict';
import { stepWalker } from '../src/sortie.ts';
import { jumpWalker, WALKER_FALL, WALKER_JUMP_SPEED } from '../src/field-physics.ts';
import * as T from '../vendor/three.module.min.js';
import { createPurgatoryScene } from '../src/purgatory-scene.ts';
import { PURGATORY_FRAME } from '../src/arena-frame.ts';
import { createSoul } from '../src/purgatory-queue.ts';
import { toggleParachute } from '../src/ballistics.ts';
import { advanceBase, OFFICE_RULES } from '../src/base.ts';
import { createWalker } from '../src/walk-arena.ts';
import { MAP } from '../src/scale.ts';
import { airPose, jumpPose, riseOf, isFreeFall, FREE_FALL_LEAN } from '../src/walker-air-pose.ts';
import { WALKER_FREEFALL_SPEED } from '../src/field-physics.ts';
import { OFFICE_LAYOUT } from '../src/layout.ts';

// Office: a walker standing on the deck jumps, rises about 0.6 m, comes back, lands unhurt.
const start = () => ({
  x: 0,
  z: 0,
  vx: 0,
  vz: 0,
  r: 0.3,
  grounded: true,
  y: undefined,
  vy: 0,
  parachute: false,
});
const body = start();
const floors = [{ min: { x: -50, y: -1, z: -50 }, max: { x: 50, y: 0, z: 50 } }];
stepWalker(body, 1 / 60, floors, null);
const ground = body.y;
assert.equal(body.grounded, true);
assert.equal(jumpWalker(body), true);
assert.equal(body.grounded, false);
assert.equal(jumpWalker(body), false, 'no second jump in the air');
let apex = ground,
  damage = 0,
  steps = 0;
while (!body.grounded && steps++ < 600) {
  const impact = stepWalker(body, 1 / 60, floors, null);
  apex = Math.max(apex, body.y);
  if (impact) damage += impact.damage;
}
assert.ok(body.grounded, 'it lands');
assert.equal(damage, 0, 'a jump never hurts');
const height = (apex - ground) / MAP.ratio;
assert.ok(height > 1.1 && height < 1.35, 'apex about 1.2 m (' + height + ')');
assert.ok(steps > 50 && steps < 75, 'about 1 s in the air (' + steps + ' steps)');
assert.equal(jumpWalker(body), true, 'and it can jump again');
// No jump with the canopy out.
const chute = { ...start(), parachute: true };
assert.equal(jumpWalker(chute), false);

// The canopy needs a real fall: a jump's descent never opens it.
const hop = start();
stepWalker(hop, 1 / 60, floors, null);
jumpWalker(hop);
let opened = false;
for (let i = 0; i < 90 && !hop.grounded; i++) {
  stepWalker(hop, 1 / 60, floors, null);
  if (toggleParachute(hop)) opened = true;
}
assert.equal(opened, false, 'a jump does not open the parachute');
const faller = { ...start(), grounded: false, y: 5, vy: -WALKER_FALL.safeImpact };
assert.equal(toggleParachute(faller), true, 'a real fall opens it');
assert.equal(toggleParachute(faller), true, 'and it folds again');
const slow = { ...start(), grounded: false, y: 5, vy: -0.2 * WALKER_FALL.safeImpact };
assert.equal(toggleParachute(slow), false, 'too slow to open');
slow.parachute = true;
assert.equal(toggleParachute(slow), true, 'an open canopy always folds');

// Purgatory: the same walker on Saint Pierre's cloud (src/arena-frame.ts), with the
// cloud's own floor: same take-off, same apex in reference metres, lands on the cloud.
const decor = createPurgatoryScene(T, {
  box: (parent, w, h, d, color, x, y, z) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  },
  shaders: false,
});
const soul = { ...createSoul({ id: 1, entity: 'p', kind: 'player' }, 0, 0), grounded: true };
for (let i = 0; i < 10; i++) stepWalker(soul, 1 / 60, decor.colliders, null, PURGATORY_FRAME);
const floor = soul.y;
assert.ok(
  soul.grounded && Math.abs(floor - PURGATORY_FRAME.originY) < 0.001,
  'stands on the cloud',
);
assert.equal(jumpWalker(soul), true);
let top = floor;
for (let i = 0; i < 200 && (i === 0 || !soul.grounded); i++) {
  stepWalker(soul, 1 / 60, decor.colliders, null, PURGATORY_FRAME);
  top = Math.max(top, soul.y);
}
assert.ok(soul.grounded && Math.abs(soul.y - floor) < 1e-9, 'lands back on the cloud');
assert.ok(
  Math.abs((top - floor) / MAP.ratio - 1.22) < 0.08,
  'same apex as in the office, in reference metres (' + (top - floor) / MAP.ratio + ')',
);

// A running jump keeps the ground's control and speed limit (a real fall has its own air rules).
const at = { x: 0, z: 0 };
const make = () => createWalker({ id: 1, entity: 'p', kind: 'player' }, at, 0, { r: 0.1 });
const run = (state) => {
  const arena = { time: 0, events: [], bodies: [Object.assign(make(), state)] };
  const b = arena.bodies[0];
  b.input = { x: 1, z: 0 };
  for (let t = 0; t < 40; t++) {
    b.inputAt = arena.time;
    advanceBase(arena, arena.time + 50, null);
  }
  return Math.hypot(b.vx, b.vz);
};
const walking = run({ grounded: true });
const jumping = run({ grounded: false, vy: WALKER_JUMP_SPEED * MAP.ratio, y: 1 });
assert.ok(Math.abs(jumping - walking) < 1e-9, 'a jump runs as fast as walking');
assert.ok(OFFICE_RULES.verticalUnit > 0 && OFFICE_LAYOUT.base.deckY !== undefined);
console.log(
  'PASS: the walker jumps (office and purgatory), lands unhurt, keeps control; the canopy needs a fall.',
);
