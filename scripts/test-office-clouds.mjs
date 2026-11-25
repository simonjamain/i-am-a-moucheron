import assert from 'node:assert/strict';
import * as T from '../vendor/three.webgpu.min.js';
import { createOffice } from '../src/office.ts';
import { createGraphics } from '../src/graphics.ts';
import { OFFICE_LAYOUT } from '../src/layout.ts';
import {
  OFFICE_HAZE,
  officeFogOpacity,
  fogOpticalDepth,
  installOfficeFog,
  applyOfficeFog,
} from '../src/office-fog.ts';
import { stepHelicopter } from '../src/helicopter.ts';
import { VEHICLES, vehiclePad } from '../src/fleet.ts';
import { LAYOUTS, LAYOUT_ROOM } from '../src/layouts.ts';

const scene = new T.Scene();
createOffice(T, scene, createGraphics(T, scene));
scene.updateMatrixWorld(true);
// The room is closed by pack wall modules on all four sides (no backdrop box):
// every horizontal view at insect height meets a wall, south included.
const walls = [];
scene.traverse((o) => o.isMesh && walls.push(o));
const origin = new T.Vector3(0, 0.95, 0);
for (const [x, z] of [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [0.7, 0.7],
  [-0.7, 0.7],
]) {
  const hit = new T.Raycaster(origin, new T.Vector3(x, 0, z).normalize()).intersectObjects(
    walls,
  )[0];
  assert.ok(hit, `a wall closes direction ${x},${z}`);
  assert.ok(hit.distance < 6.2, `wall at ${hit.distance} m in direction ${x},${z}`);
}
assert.equal(
  scene.getObjectByName('office-fog-ceiling'),
  undefined,
  'no coloured backdrop box around the room',
);
const { x: X, z: Z, wall: H } = LAYOUT_ROOM;
for (const layout of LAYOUTS) {
  const south = layout.props.filter((p) => p.model === 'Wall' && p.z > Z);
  assert.equal(south.length, 7, layout.id + ': seven south wall modules');
  assert.ok(
    layout.shellSolids.some((b) => b.min.z === Z && b.max.y === H && b.min.x < -X && b.max.x > X),
    layout.id + ': south wall solid on the room boundary',
  );
  assert.equal(
    layout.props.filter((p) => p.model === 'Wall_Corner').length,
    4,
    layout.id + ': four corners',
  );
}
assert.equal(OFFICE_HAZE, '#ffffff', 'background above the walls is the haze itself');
assert.equal(OFFICE_LAYOUT.bounds.ceiling, 3.95, 'one room metre above the former flight limit');
assert.equal(officeFogOpacity(2), 0, 'layer does not move down');
assert.ok(officeFogOpacity(2.8) > 0.1, 'layer does not move up with the flight limit');
assert.equal(officeFogOpacity(3.8), 0.65, 'haze remains above the former ceiling');
assert.ok(fogOpticalDepth(3.2, 3.2, 1) > 9, 'new flyable space stays inside the clouds');
installOfficeFog(T);
// The haze is the scene's fog node, evaluated per fragment from world positions.
const hazy = new T.Scene();
hazy.fog = new T.FogExp2('#ffffff', 0.018);
applyOfficeFog(T, hazy);
assert.ok(hazy.fogNode?.isNode, 'cloud layer installed as a fog node');
const plain = new T.Scene();
applyOfficeFog(T, plain);
assert.equal(plain.fogNode, undefined, 'no exponential fog, no cloud layer');
// No flight ceiling any more: above the clouds lies Saint Pierre's sky
// (src/sky-passage.ts), boundless; under it, the room's walls still bound flights.
for (const [height, alive, x = 0] of [
  [3.2, true],
  [3.94, true],
  [3.96, true],
  [12, true, 30],
  [3.2, false, 5],
]) {
  for (const type of ['helicopter']) {
    const state = { ...vehiclePad(type), p: [x, height, 0], q: [0, 0, 0, 1], v: [0, 0, 0] };
    stepHelicopter(T, state, {}, null, 1 / 120, VEHICLES[type]);
    assert.equal(state.hp > 0, alive, `${type} at ${height} m, x ${x}`);
  }
}
console.log(
  'Clouds: room closed on four sides, haze background, fixed cloud height, the sky above the clouds',
);
