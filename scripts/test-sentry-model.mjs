import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { GroundDefenseUI } from '../src/ground-defense-ui.js';
import {
  createSentryModel,
  sentryAimAngles,
  sentryAngleDelta,
  SENTRY_MIN_ELEVATION,
  SENTRY_MAX_ELEVATION,
  SENTRY_MUZZLE_HEIGHT,
} from '../src/sentry-model.js';

const origin = [0, SENTRY_MUZZLE_HEIGHT, 0];
const vertical = sentryAimAngles(origin, [0, 2, 0]);
assert.equal(vertical.pitch, Math.PI / 2, 'the gun can point straight up');
assert.equal(SENTRY_MAX_ELEVATION, Math.PI / 2);
assert.ok(Math.abs(sentryAimAngles(origin, [0, 0, -1]).yaw) < 1e-6);
assert.ok(Math.abs(sentryAimAngles(origin, [1, 0, 0]).yaw + Math.PI / 2) < 1e-6);
assert.equal(sentryAimAngles(origin, [1, -1, 0]).pitch, SENTRY_MIN_ELEVATION);
assert.ok(Math.abs(sentryAngleDelta(3.13, -3.13)) < 0.1, 'short turn through 180°');
assert.throws(() => sentryAimAngles([0, 0, NaN], [0, 1, 0]), /finite/);

const { group, yaw, pitch, radar, lens, muzzle } = createSentryModel(T);
assert.equal(yaw.parent, group, 'yaw is independent of the static plinth');
assert.equal(pitch.parent, yaw, 'gun elevation follows yaw');
assert.equal(radar.parent, yaw, 'sensor is separate from the elevating barrel');
assert.equal(lens.material.color.getHexString(), '1ecbd9');
const world = new T.Group();
world.add(group);
world.updateMatrixWorld(true);
const initial = muzzle.getWorldPosition(new T.Vector3());
pitch.rotation.x = Math.PI / 2;
world.updateMatrixWorld(true);
const raised = muzzle.getWorldPosition(new T.Vector3());
assert.ok(raised.y > initial.y + 0.03, 'barrel visibly elevates to 90°');
assert.equal(
  group.getObjectByName('canon-unique')?.parent,
  pitch,
  'a single barrel is mounted under the pitch pivot',
);
let triangles = 0;
group.traverse((part) => {
  if (!part.isMesh) return;
  const index = part.geometry.getIndex();
  triangles += (index?.count || part.geometry.attributes.position.count) / 3;
});
assert.ok(triangles < 3500, 'low polygon fallback, with separate pivot nodes');
console.log('T-01: autonomous yaw, -10°..+90° pitch, single barrel and low-poly hierarchy OK');


// Animation instances should survive snapshot revisions for ammunition/shots.
const ui = Object.create(GroundDefenseUI.prototype);
ui.T = T;
ui.models = new T.Group();
ui.sentries = new Map();
ui.lastSentryFrame = 0;
const placed = { id: 't01', kind: 'sentry', position: [0, 0], ammo: 180, hp: 150 };
ui.rebuild([placed]);
const first = ui.sentries.get('t01');
assert.equal(ui.models.children.length, 1);
ui.rebuild([{ ...placed, ammo: 179, aimTarget: [0, 1, 0] }]);
assert.equal(ui.sentries.get('t01'), first, 'preserve turret mesh and articulation across shots');
assert.equal(ui.models.children.length, 1, 'do not duplicate turret geometries');
for (let i = 0; i < 25; i++) {
  ui.lastSentryFrame = performance.now() - 50;
  ui.updateSentryAim({
    groundDefense: { structures: [{ ...placed, aimTarget: [0, 2, 0] }] },
  });
}
assert.ok(first.pitch.rotation.x > 1.4, 'visible pivot nearly vertical after smoothing');
ui.rebuild([]);
assert.equal(ui.models.children.length, 0);
assert.equal(ui.sentries.size, 0, 'remove retired turrets');
