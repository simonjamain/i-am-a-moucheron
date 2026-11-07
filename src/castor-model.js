import { MODEL_DATA as BODY } from './meshy-castor-body-data.js';
import { MODEL_DATA as TURRET } from './meshy-castor-turret-data.js';
import { MODEL_DATA as WHEEL } from './meshy-castor-wheel-data.js';
import { texturedMeshyParts } from './meshy-texture.js';

// Meshy already sculpted six wheels into the hull. The separate textured wheel
// model is needed for animation, so the embedded wheel triangles must not render
// as a second set. Only side-facing low wheel regions are masked: the cabin,
// undercarriage, supply bed and original UV/color data remain untouched.
const WHEEL_Z = [-2.05, 0.55, 1.7];
const WHEEL_X = [-1.01, 1.01];
const WHEEL_Y = -0.24;
const WHEEL_RADIUS = 0.64;
const WHEEL_MODEL_SCALE = 0.65;
const cleanedHulls = new WeakMap();

function inOriginalWheel(x, y, z) {
  if (Math.abs(x) <= 0.65) return false;
  return WHEEL_Z.some(
    (centerZ) =>
      ((y - WHEEL_Y) / WHEEL_RADIUS) ** 2 +
        ((z - centerZ) / WHEEL_RADIUS) ** 2 <
      1,
  );
}

function hullWithoutOriginalWheels(T, original) {
  let geometry = cleanedHulls.get(original);
  if (geometry) return geometry;
  const positions = original.getAttribute('position');
  const index = original.getIndex();
  const remaining = [];
  let removed = 0;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    const x = (positions.getX(a) + positions.getX(b) + positions.getX(c)) / 3;
    const y = (positions.getY(a) + positions.getY(b) + positions.getY(c)) / 3;
    const z = (positions.getZ(a) + positions.getZ(b) + positions.getZ(c)) / 3;
    if (inOriginalWheel(x, y, z)) {
      removed++;
      continue;
    }
    remaining.push(a, b, c);
  }
  geometry = new T.BufferGeometry();
  // Immutable attributes (including original Meshy UVs) remain shared.
  for (const [name, attribute] of Object.entries(original.attributes))
    geometry.setAttribute(name, attribute);
  geometry.setIndex(new T.BufferAttribute(new Uint16Array(remaining), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.embeddedWheelTrianglesRemoved = removed;
  cleanedHulls.set(original, geometry);
  return geometry;
}

// Share materials, UV atlases and meshes between Castors; keep moving pivots
// per vehicle. Do not recolor the body: identification is a floating disk.
function attach(T, data, parent, kind) {
  for (const { part, geometry, material } of texturedMeshyParts(T, data)) {
    const mesh = new T.Mesh(
      kind === 'body' ? hullWithoutOriginalWheels(T, geometry) : geometry,
      material,
    );
    mesh.name = 'meshy-castor-' + part.part;
    mesh.userData.meshyShared = true;
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
  }
}

export function makeCastorMeshy(T, scene) {
  const model = new T.Group();
  attach(T, BODY, model, 'body');
  const wheels = [];
  for (const z of WHEEL_Z) {
    for (const x of WHEEL_X) {
      const axle = new T.Group();
      axle.position.set(x, WHEEL_Y, z);
      const wheel = new T.Group();
      wheel.scale.setScalar(WHEEL_MODEL_SCALE);
      if (x > 0) wheel.rotation.y = Math.PI;
      attach(T, WHEEL, wheel, 'wheel');
      axle.add(wheel);
      model.add(axle);
      wheels.push(axle);
    }
  }
  const turret = new T.Group();
  turret.position.set(0, 2.2, -1.05);
  const pitch = new T.Group();
  pitch.position.y = 0.2;
  attach(T, TURRET, pitch, 'turret');
  turret.add(pitch);
  model.add(turret);
  const muzzle = new T.Object3D();
  muzzle.position.set(0, 0, -1.62);
  pitch.add(muzzle);
  turret.userData = { pitch, muzzle, coaxMuzzle: muzzle };
  model.userData = {
    preserveTexture: true,
    wheels,
    turrets: [turret],
    pilotMuzzles: [muzzle],
    muzzles: [muzzle],
    prop: new T.Object3D(),
    wing: new T.Object3D(),
  };
  scene.add(model);
  return model;
}
