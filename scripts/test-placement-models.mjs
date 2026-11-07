import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { ModelPreview } from '../src/model-preview.js';
import { createGroundModel } from '../src/ground-model.js';
import { makeFortificationStation } from '../src/fortification-model.js';
import { createGraphics } from '../src/graphics.js';
import { placementFacing } from '../src/placement-aim.js';
import { supportedPlacement } from '../src/equipment.js';
import { Game } from '../server/game.js';
import { VEHICLES } from '../src/fleet.js';
import { MAP } from '../src/scale.js';

const scene = new T.Scene();
const graphics = createGraphics(T, scene);
const preview = new ModelPreview(T, scene);
for (const kind of ['sugar', 'fan', 'sentry', 'barricade', 'sticky', 'bunker', 'antitank']) {
  const angle = 1.23;
  const pose = { x: 0.12, y: 0, z: -0.08, angle };
  const shape = {
    kind,
    position: [0, 0],
    a: [-0.06, 0],
    b: [0.06, 0],
    hp: 100,
    radius: 0.15,
    angle: 0,
  };
  const factory = () =>
    ['bunker', 'antitank'].includes(kind)
      ? makeFortificationStation(T, { ...shape, x: 0, y: 0.00005, z: 0 }, graphics)
      : createGroundModel(T, shape);
  const placed = factory();
  const expected = new T.Group();
  expected.add(placed);
  expected.position.set(pose.x, pose.y, pose.z);
  expected.rotation.y = angle;
  preview.show(kind, factory, pose, true);
  const model = preview.root.children[0];
  assert.ok(model);
  const actualBox = new T.Box3().setFromObject(preview.root);
  const expectedBox = new T.Box3().setFromObject(expected);
  assert.ok(actualBox.min.distanceTo(expectedBox.min) < 1e-7, kind + ': same geometry and pose');
  assert.ok(actualBox.max.distanceTo(expectedBox.max) < 1e-7);
  const originalColors = preview.materials.map((m) => m.color.getHex());
  assert.ok(preview.materials.every((m) => m.transparent && !m.depthWrite && m.opacity === 0.45));
  preview.show(kind, () => assert.fail('unchanged model must be reused'), pose, false);
  assert.ok(preview.materials.every((m) => m.color.getHexString() === 'ed665b'));
  preview.show(kind, () => assert.fail('move must reuse geometry'), { ...pose, x: 0.2 }, true);
  assert.deepEqual(
    preview.materials.map((m) => m.color.getHex()),
    originalColors,
  );
  assert.equal(preview.root.children[0], model);
  if (kind === 'sentry') {
    const source = placed.userData.sentry.group.getObjectByName('socle-fixe');
    const ghost = model.userData.sentry.group.getObjectByName('socle-fixe');
    assert.equal(ghost.geometry, source.geometry);
    assert.equal(ghost.material.map, source.material.map);
    assert.notEqual(ghost.material, source.material);
    let disposed = false;
    source.geometry.addEventListener('dispose', () => (disposed = true));
    preview.clear();
    assert.equal(disposed, false, 'cached Meshy geometry survives preview disposal');
  }
}
preview.clear();
assert.equal(preview.root.children.length, 0);
const longWall = createGroundModel(T, { kind: 'barricade', a: [0, 0], b: [0.45, 0], hp: 100 });
assert.equal(longWall.children.length, 3, 'preview uses the same 20 cm segmentation as placement');

const game = new Game();
const joined = game.join({ code: 'ORIENT', name: 'Pose' });
const room = game.rooms.get('ORIENT');
for (const [dx, dz] of [
  [0.1, 0],
  [-0.1, 0],
  [0, 0.1],
  [0, -0.1],
  [0.1, 0.1],
]) {
  const builder = { x: 0, z: 0 };
  const position = { x: dx, y: 0, z: dz };
  const angle = placementFacing(builder, position);
  for (const type of Object.keys(VEHICLES)) {
    const vehicle = game.createVehicle(room, type, 'purchase', { ...position, angle });
    const front = new T.Vector3(0, 0, -1).applyQuaternion(
      new T.Quaternion().fromArray(vehicle.state.q),
    );
    const toward = new T.Vector3(-dx, 0, -dz).normalize();
    assert.ok(front.dot(toward) > 0.999999, type + ': placed nose faces builder');
    assert.equal(vehicle.state.p[1], VEHICLES[type].gear);
  }
}
// Rotated footprint must fit the actual supporting surface.
const type = 'bomber';
const rx = MAP.metres(VEHICLES[type].span / 2 + 1);
const rz = MAP.metres(VEHICLES[type].length / 2 + 1);
assert.notEqual(rx, rz);
const floor = {
  min: { x: -rx - 0.00001, y: -0.1, z: -rz - 0.00001 },
  max: { x: rx + 0.00001, y: 0, z: rz + 0.00001 },
};
assert.ok(supportedPlacement({ x: 0, y: 0, z: 0, angle: 0 }, [floor], [], type));
assert.equal(supportedPlacement({ x: 0, y: 0, z: 0, angle: Math.PI / 2 }, [floor], [], type), null);
console.log(
  'Placement models: real geometry, transparent states, cache ownership, exact poses and rotated footprints OK',
);
