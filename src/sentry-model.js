import { MODEL_DATA as SOCLE } from './meshy-t01-socle-data.js';
import { MODEL_DATA as TETE } from './meshy-t01-tete-data.js';
import { MODEL_DATA as CANON } from './meshy-t01-canon-data.js';
import { MODEL_DATA as CAPTEUR } from './meshy-t01-capteur-data.js';
import { texturedMeshyParts } from './meshy-texture.js';

// Approved G1 Castor T-01: four independent Meshy textured modules, preserved UVs.
// Original meshes use different front axes; normalize them at the assembly pivots.
export const SENTRY_MIN_ELEVATION = (-10 * Math.PI) / 180;
export const SENTRY_MAX_ELEVATION = Math.PI / 2;
// Issue #110: the assembled T-01 was ~4.6× too big. One uniform scale on the
// root keeps pivots, axes, muzzle and textures coherent, and calibrates the
// barrel (pivot→muzzle 41 mm unscaled) on the Castor's gun (~9 mm).
export const SENTRY_SCALE = 0.22;
// Elevation pivot height (yaw 14 mm + pitch 22 mm unscaled), in office metres.
export const SENTRY_MUZZLE_HEIGHT = 0.036 * SENTRY_SCALE;

export function sentryAimAngles(origin, target) {
  if (
    !Array.isArray(origin) ||
    !Array.isArray(target) ||
    origin.length !== 3 ||
    target.length !== 3 ||
    !origin.every(Number.isFinite) ||
    !target.every(Number.isFinite)
  )
    throw new Error('Sentry aim requires finite 3D positions');
  const dx = target[0] - origin[0];
  const dy = target[1] - origin[1];
  const dz = target[2] - origin[2];
  // The assembled cannon points along local -Z at zero elevation.
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.max(
    SENTRY_MIN_ELEVATION,
    Math.min(SENTRY_MAX_ELEVATION, Math.atan2(dy, Math.hypot(dx, dz))),
  );
  return { yaw, pitch };
}

export function sentryAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

// Geometry + materials are shared by all T-01 instances, but these groups and
// their animated pivots are distinct for each installed sentry.
function addMeshy(T, data, parent, name, size, rotation, position) {
  const parts = texturedMeshyParts(T, data);
  if (parts.length !== 1) throw new Error(`Unexpected Meshy T-01 part count for ${name}`);
  const { geometry, material } = parts[0];
  const mesh = new T.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.setScalar(size);
  mesh.rotation.y = rotation;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.meshyShared = true;
  parent.add(mesh);
  return mesh;
}

export function createSentryModel(T) {
  const group = new T.Group();
  group.name = 't01';
  group.scale.setScalar(SENTRY_SCALE);
  // The Meshy base lies horizontally in X/Z, and is deliberately not animated.
  addMeshy(T, SOCLE, group, 'socle-fixe', 0.059, 0, [0, 0.0068, 0]);

  const yaw = new T.Group();
  yaw.name = 'rotation-horizontale';
  yaw.position.y = 0.014;
  group.add(yaw);
  // Head faces +X in the original, so +90° Y turns it toward game -Z.
  addMeshy(T, TETE, yaw, 'tete-meshy', 0.054, Math.PI / 2, [0, 0.0162, 0]);

  const pitch = new T.Group();
  pitch.name = 'elevation-canon';
  pitch.position.set(0, 0.022, -0.005);
  yaw.add(pitch);
  // Cannon's source barrel faces -X; -90° Y makes that game -Z.
  addMeshy(T, CANON, pitch, 'canon-unique', 0.052, -Math.PI / 2, [0, 0, -0.015]);
  const muzzle = new T.Group();
  muzzle.name = 'bouche-canon';
  muzzle.position.set(0, 0, -0.041);
  pitch.add(muzzle);

  // Separate optical/radar module faces +Z in Meshy; 180° Y makes -Z.
  // Mount to the side of the gun: at +90° elevation the barrel clears the radar.
  const radar = new T.Group();
  radar.name = 'radar-independant';
  radar.position.set(0.019, 0.042, 0.006);
  yaw.add(radar);
  addMeshy(T, CAPTEUR, radar, 'capteur-meshy', 0.024, Math.PI, [0, 0, 0]);
  // Small support under the offset sensor; not a recoloring of its Meshy atlas.
  const support = new T.Mesh(
    new T.BoxGeometry(0.004, 0.01, 0.004),
    new T.MeshStandardMaterial({ color: '#35393d', roughness: 0.8 }),
  );
  support.name = 'support-capteur';
  support.position.set(0, -0.009, 0);
  radar.add(support);
  // Ammo status is a tiny independent light; Meshy textures stay unchanged.
  const led = new T.Mesh(
    new T.SphereGeometry(0.0018, 6, 4),
    new T.MeshBasicMaterial({ color: '#1ecbd9' }),
  );
  led.name = 'temoin-munitions';
  led.position.set(0.005, -0.003, -0.01);
  radar.add(led);
  return { group, yaw, pitch, radar, lens: led, muzzle };
}
