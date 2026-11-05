import { M1_DATA } from './meshy-m1-data.js';
import { texturedMeshyParts } from './meshy-texture.js';

export function makeM1(T, scene, color, box, mat) {
  const model = new T.Group();
  const wing = new T.Group();
  const prop = new T.Group();
  model.add(wing, prop);
  for (const { part, geometry, material } of texturedMeshyParts(T, M1_DATA)) {
    const mesh = new T.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    const parent = part.part === 'wing' ? wing : part.part === 'prop' ? prop : model;
    if (part.part === 'prop') prop.position.fromArray(part.pivot);
    parent.add(mesh);
  }
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
  model.userData = {
    preserveTexture: true,
    wing,
    prop,
    gunMeshes,
    pilotMuzzles,
    vehicleType: 'fighter',
  };
  scene.add(model);
  return model;
}
