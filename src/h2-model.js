import { H2_PARTS } from './meshy-h2-data.js';

const geometryCache = new WeakMap();
export function makeH2(T, scene, color, box, mat) {
  let geometries = geometryCache.get(T);
  if (!geometries) {
    geometries = H2_PARTS.map((part) => {
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
  const rotor = new T.Group();
  const tailRotor = new T.Group();
  model.add(rotor, tailRotor);
  const fixed = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    flatShading: true,
  });
  const paint = mat(color);
  H2_PARTS.forEach((part, i) => {
    const mesh = new T.Mesh(geometries[i], part.paint ? paint : fixed);
    mesh.castShadow = mesh.receiveShadow = true;
    const parent = part.part === 'rotor' ? rotor : part.part === 'tailRotor' ? tailRotor : model;
    if (parent !== model) parent.position.fromArray(part.pivot);
    parent.add(mesh);
  });
  // Preserve the copilot's existing yaw/pitch hierarchy and muzzle coordinates.
  const mount = new T.Group();
  mount.position.set(0, -0.65, -2);
  const pitch = new T.Group();
  mount.add(pitch);
  model.add(mount);
  const barrel = box(0.15, 0, -0.6, 0.12, 0.12, 1.2, '#364439', pitch);
  const muzzle = new T.Object3D();
  muzzle.position.z = -0.6;
  barrel.add(muzzle);
  mount.userData = { pitch, muzzle };
  model.userData = {
    preserveTexture: true,
    turrets: [mount],
    rotor,
    tailRotor,
    prop: new T.Object3D(),
    wing: new T.Object3D(),
  };
  scene.add(model);
  return model;
}
