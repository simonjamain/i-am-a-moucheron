import { M1_PARTS } from './meshy-m1-data.js';

const geometryCache = new WeakMap();
export function makeM1(T, scene, color, box, mat) {
  let geometries = geometryCache.get(T);
  if (!geometries) {
    geometries = M1_PARTS.map((part) => {
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(part.positions, 3));
      if (part.colors) geometry.setAttribute('color', new T.Float32BufferAttribute(part.colors, 3));
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    });
    geometryCache.set(T, geometries);
  }
  const model = new T.Group();
  const wing = new T.Group();
  const prop = new T.Group();
  model.add(wing, prop);
  const fixed = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    flatShading: true,
  });
  // The paint material remains compatible with the existing per-vehicle livery.
  const paint = mat(color);
  M1_PARTS.forEach((part, i) => {
    const mesh = new T.Mesh(geometries[i], part.paint ? paint : fixed);
    mesh.castShadow = mesh.receiveShadow = true;
    const parent = part.part === 'wing' ? wing : part.part === 'prop' ? prop : model;
    if (part.part === 'prop') prop.position.fromArray(part.pivot);
    parent.add(mesh);
  });
  const gunMeshes = [];
  const pilotMuzzles = [];
  for (const x of [-0.48, 0.48]) {
    const barrel = box(x, -0.05, -1.5, 0.075, 0.075, 0.55, '#334a3b', model);
    const muzzle = new T.Object3D();
    muzzle.position.z = -0.275;
    barrel.add(muzzle);
    gunMeshes.push(barrel);
    pilotMuzzles.push(muzzle);
  }
  model.userData = { wing, prop, gunMeshes, pilotMuzzles, vehicleType: 'fighter' };
  scene.add(model);
  return model;
}
