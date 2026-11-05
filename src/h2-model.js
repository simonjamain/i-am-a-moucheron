import { H2_DATA } from './meshy-h2-data.js';
import { texturedMeshyParts } from './meshy-texture.js';

export function makeH2(T, scene, color, box, mat) {
  const model = new T.Group();
  const rotor = new T.Group();
  const tailRotor = new T.Group();
  model.add(rotor, tailRotor);
  for (const { part, geometry, material } of texturedMeshyParts(T, H2_DATA)) {
    const mesh = new T.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    const parent = part.part === 'rotor' ? rotor : part.part === 'tailRotor' ? tailRotor : model;
    if (parent !== model) parent.position.fromArray(part.pivot);
    parent.add(mesh);
  }
  // Preserve the copilot's yaw/pitch hierarchy and muzzle coordinates.
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
