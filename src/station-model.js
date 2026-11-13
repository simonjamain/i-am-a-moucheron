import { orientedBox } from './oriented-collider.js';
import { MODEL_DATA as REFUEL } from './meshy-refuel-data.js';
import { MODEL_DATA as RADAR } from './meshy-radar-data.js';
import { texturedMeshyParts } from './meshy-texture.js';

export function makeServiceStation(T, kind) {
  const model = new T.Group();
  for (const { part, geometry, material } of texturedMeshyParts(
    T,
    kind === 'radar' ? RADAR : REFUEL,
  )) {
    const pivot = new T.Group();
    pivot.position.fromArray(part.pivot);
    if (kind === 'refuel') {
      pivot.position.multiplyScalar(3);
      pivot.scale.setScalar(3);
    }
    const mesh = new T.Mesh(geometry, material);
    mesh.name = `meshy-${kind}-${part.part}`;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.meshyShared = true;
    pivot.add(mesh);
    model.add(pivot);
    if (part.part === 'antenna') model.userData.dish = pivot;
  }
  return model;
}
export function animateRadar(model, dt, active = true) {
  if (active && model.userData.dish)
    model.userData.dish.rotation.y = (model.userData.dish.rotation.y + dt) % (2 * Math.PI);
}

export function makeRefuelCollider(T, model) {
  model.updateWorldMatrix(true, true);
  const inverse = model.matrixWorld.clone().invert();
  const bounds = new T.Box3();
  model.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry) return;
    mesh.geometry.computeBoundingBox();
    bounds.union(
      mesh.geometry.boundingBox
        .clone()
        .applyMatrix4(new T.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)),
    );
  });
  const scale = new T.Vector3().setFromMatrixScale(model.matrixWorld);
  bounds.min.multiply(scale);
  bounds.max.multiply(scale);
  const position = model.getWorldPosition(new T.Vector3());
  bounds.min.y += position.y;
  bounds.max.y += position.y;
  const angle = new T.Euler().setFromQuaternion(
    model.getWorldQuaternion(new T.Quaternion()),
    'YXZ',
  ).y;
  const broad = bounds
    .clone()
    .applyMatrix4(new T.Matrix4().makeRotationY(angle).setPosition(position.x, 0, position.z));
  return orientedBox(T, broad, {
    x: position.x,
    z: position.z,
    c: Math.cos(angle),
    s: Math.sin(angle),
    bounds,
  });
}
