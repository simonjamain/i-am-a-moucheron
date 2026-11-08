// Issue #110: the Castor auto-turret is scaled down so its small articulated
// cannon matches the Castor's gun; pivots, muzzle, preview and spacing follow.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createSentryModel, SENTRY_MUZZLE_HEIGHT, SENTRY_SCALE } from '../src/sentry-model.js';
import { makeCastorMeshy } from '../src/castor-model.js';
import { createGroundModel } from '../src/ground-model.js';
import { SENTRY } from '../src/ground-sentry.js';
import { ACTOR_UNIT } from '../src/scale.js';

const size = (o) => new T.Box3().setFromObject(o).getSize(new T.Vector3());
const sentry = createSentryModel(T);
sentry.group.updateMatrixWorld(true);
const barrel = sentry.muzzle
  .getWorldPosition(new T.Vector3())
  .distanceTo(sentry.pitch.getWorldPosition(new T.Vector3()));
const castor = makeCastorMeshy(T, new T.Scene());
castor.scale.setScalar(ACTOR_UNIT);
castor.updateMatrixWorld(true);
const gun = castor.userData.turrets[0];
const castorBarrel = gun.userData.muzzle
  .getWorldPosition(new T.Vector3())
  .distanceTo(gun.userData.pitch.getWorldPosition(new T.Vector3()));
assert.ok(Math.abs(barrel / castorBarrel - 1) < 0.15, `barrel ${barrel} vs Castor ${castorBarrel}`);

// The whole turret shrinks together (about 4.5× smaller than the original
// 6–7.5 cm assembly) and stays within the Castor's own size.
const box = size(sentry.group);
assert.ok(Math.max(box.x, box.y, box.z) < 0.02, 'about 1.5 cm overall');
const truck = size(castor);
assert.ok(box.y < truck.y && box.z < truck.z, 'smaller than the Castor');
assert.equal(sentry.group.scale.x, SENTRY_SCALE, 'one uniform scale keeps pivots coherent');
assert.ok(
  Math.abs(sentry.pitch.getWorldPosition(new T.Vector3()).y - SENTRY_MUZZLE_HEIGHT) < 1e-9,
  'aim origin height matches the elevation pivot',
);
// Elevation still reaches +90° with the barrel clear of the head.
sentry.pitch.rotation.x = Math.PI / 2;
sentry.group.updateMatrixWorld(true);
assert.ok(sentry.muzzle.getWorldPosition(new T.Vector3()).y > SENTRY_MUZZLE_HEIGHT + barrel * 0.9);

// Placement preview and placed models use the same scaled assembly.
const placed = createGroundModel(T, { kind: 'sentry', position: [0, 0], angle: 0, hp: 150 });
assert.ok(Math.max(...size(placed).toArray()) < 0.02);
assert.ok(SENTRY.footprint >= box.x / 2 && SENTRY.footprint < 0.03, 'placement spacing follows');

// Gameplay untouched.
assert.equal(SENTRY.intervalMs, 500);
assert.equal(SENTRY.damage, 30);
assert.equal(SENTRY.range, 0.42);
console.log(
  `Sentry scale: ×${SENTRY_SCALE}, barrel ${(barrel * 1000).toFixed(1)} mm vs Castor ${(castorBarrel * 1000).toFixed(1)} mm.`,
);
