// The physics view (src/physics-debug.ts): every rig describes its colliders, springs and
// forces; the overlay turns them into coloured world-space lines.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { loadRapier } from '../src/physics-world.ts';
import { DEBUG_COLORS, PhysicsOverlay } from '../src/physics-debug.ts';
import { PlaneRig } from '../src/plane-physics.ts';
import { TankRig } from '../src/tank-physics.ts';
import { CastorRig } from '../src/castor-physics.ts';
import { TruckRig } from '../src/truck-physics.ts';
import { VEHICLES } from '../src/fleet.ts';

const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
const collect = (rig) => {
  const lines = [];
  rig.debugDraw((a, b, color) => {
    assert.ok([...a, ...b].every(Number.isFinite), 'finite coordinates');
    lines.push({ a, b, color });
  });
  return lines;
};
const colorsOf = (lines) => new Set(lines.map((l) => l.color));
const state = (y = 0.02) => ({
  p: [0, y, 0],
  q: [0, 0, 0, 1],
  v: [0, 0, 0],
  hp: 100,
  gas: 0,
  landed: true,
});

// Aeroplane: collider outline, three gear springs, forces and the centre of mass.
{
  const rig = new PlaneRig(RAPIER);
  const s = { ...state(0.0055), omega: [0, 0, 0] };
  for (let i = 0; i < 30; i++)
    rig.step(s, { pitch: 0, roll: 0, yaw: 0 }, [], 1 / 60, VEHICLES.fighter);
  const lines = collect(rig);
  const c = colorsOf(lines);
  for (const key of ['collider', 'rest', 'compressed', 'load', 'gravity', 'centre'])
    assert.ok(c.has(DEBUG_COLORS[key]), 'plane draws ' + key);
  assert.equal(lines.filter((l) => l.color === DEBUG_COLORS.rest).length, 3, 'three gear springs');
}
// Ground vehicles: the hull and one spring per wheel with its rest length and travel.
for (const [name, Rig, wheels] of [
  ['tank', TankRig, 12],
  ['castor', CastorRig, 6],
  ['truck', TruckRig, 10],
]) {
  const rig = new Rig(RAPIER);
  const lines = collect(rig);
  const c = colorsOf(lines);
  assert.ok(c.has(DEBUG_COLORS.collider), name + ' draws its hull');
  assert.ok(
    lines.filter((l) => l.color === DEBUG_COLORS.rest).length >= Math.min(wheels, 4),
    name + ' springs',
  );
  assert.ok(c.has(DEBUG_COLORS.travel), name + ' shows the maximum travel');
}
// Overlay: hidden when off, lines in world units when on.
{
  const scene = new T.Scene();
  const overlay = new PhysicsOverlay(T, scene);
  const rig = new PlaneRig(RAPIER);
  overlay.update([rig], false);
  assert.equal(overlay.lines.visible, false);
  overlay.update([rig], true);
  assert.equal(overlay.lines.visible, true);
  const n = overlay.lines.geometry.getAttribute('position').count;
  assert.ok(n > 40 && n % 2 === 0, 'segments drawn (' + n + ' vertices)');
  overlay.update([], false);
  assert.equal(overlay.lines.visible, false);
}
console.log('test-physics-debug ok');
