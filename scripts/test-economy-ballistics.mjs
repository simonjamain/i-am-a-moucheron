import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.webgpu.min.js';
import { stepFall, stepBallisticVelocity, toggleParachute, HUMAN_AERO } from '../src/ballistics.ts';
import { MAP } from '../src/scale.ts';
import { supportedPlacement } from '../src/equipment.ts';
import { OFFICE_LAYOUT } from '../src/layout.ts';
import { createGraphics } from '../src/graphics.js';
import { createOffice } from '../src/office.ts';
import { enemyRoute, enemyRoutePosition, PORTALS } from '../src/routes.ts';
import { wavePlan, swarmFrame } from '../src/waves.js';
import { CombatEffects } from '../src/combat.ts';
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
assert.ok(supportedPlacement({ x: -2.5, y: 0.74005, z: 1.5 }, office.colliders), 'on a desk top');
assert.equal(
  supportedPlacement({ x: 0, y: 2, z: 0 }, office.colliders),
  null,
  'no floating installations',
);
// Archive boxes of the office pack (0.28 m high), next to the photocopier.
const cartons = office.colliders.filter(
  (b) => Math.abs(b.max.y - 0.275) < 0.01 && b.max.x - b.min.x < 1,
);
assert.ok(cartons.length);
assert.ok(
  supportedPlacement({ x: 2.75, y: 0.27505, z: 0.2 }, office.colliders),
  'cartons support a whole gun base',
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
  assert.ok(Math.hypot(end[0] - OFFICE_LAYOUT.bin.x, end[2] - OFFICE_LAYOUT.bin.z) < 1e-8);
  // Ground insects walk directly to the bin (issue #97); flights keep long lanes.
  assert.ok(e.ground ? e.duration > 0 : e.duration >= 60);
  for (const { p } of route.samples) {
    assert.ok(p.every(Number.isFinite));
    assert.ok(p[1] >= 0.0006 && p[1] <= 2.81);
  }
}
console.log(
  'PASS: stable drag/ballistics, terminal free fall, manual canopy, physical placement on books, persistent flak cleanup and multi-source paths.',
);
