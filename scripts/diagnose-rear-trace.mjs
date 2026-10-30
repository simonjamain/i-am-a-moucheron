import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { makeShotTrace } from '../src/tracers.js';
import { MAP } from '../src/scale.js';
const scene = new T.Scene(),
  origin = new T.Vector3(0, 0.9, 0),
  direction = new T.Vector3(0, 0, -1);
const trace = makeShotTrace(T, scene, origin, direction, '#ffe48d');
trace.updateWorldMatrix(true, true);
const core = trace.userData.core;
const centre = core.getWorldPosition(new T.Vector3());
const signedDistance = centre.clone().sub(origin).dot(direction);
console.log(
  JSON.stringify({ centreAlongShot: signedDistance, referenceMetres: signedDistance / MAP.ratio }),
);
// The generic moving tracer is a rear-facing trail. A static pistol effect must
// offset its head forward before displaying this shape; the fixed helper does.
assert.ok(
  signedDistance > 0,
  'static pistol streak is behind the muzzle, reproducing the reported backward shot',
);
