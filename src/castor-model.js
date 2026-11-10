import { MODEL_DATA } from './meshy-castor-data.js';
import { texturedMeshyParts } from './meshy-texture.js';

// The remodelled Castor is one Meshy mesh whose movable pieces are separate
// islands; scripts/import-meshy-castor.py stores each piece around its pivot.
// Geometry, material and atlas are shared between Castors; pivots are per vehicle.
function piece(T, name) {
  const found = texturedMeshyParts(T, MODEL_DATA).find(({ part }) => part.part === name);
  if (!found) throw Error('Missing Castor piece ' + name);
  const mesh = new T.Mesh(found.geometry, found.material);
  mesh.name = 'meshy-castor-' + name;
  mesh.userData.meshyShared = true;
  mesh.castShadow = mesh.receiveShadow = true;
  return { mesh, pivot: found.part.pivot };
}

function pivotGroup(T, parent, name, origin = [0, 0, 0]) {
  const { mesh, pivot } = piece(T, name);
  const group = new T.Group();
  group.position.set(pivot[0] - origin[0], pivot[1] - origin[1], pivot[2] - origin[2]);
  group.add(mesh);
  parent.add(group);
  return { group, pivot };
}

export const CASTOR_WHEEL_COUNT = 6;

export function makeCastorMeshy(T, scene) {
  const model = new T.Group();
  model.add(piece(T, 'body').mesh);
  const wheels = [];
  for (let i = 0; i < CASTOR_WHEEL_COUNT; i++) wheels.push(pivotGroup(T, model, 'wheel' + i).group);
  const { group: turret, pivot: yawPivot } = pivotGroup(T, model, 'turret');
  const { group: pitch } = pivotGroup(T, turret, 'gun', yawPivot);
  const muzzle = new T.Object3D();
  muzzle.position.fromArray(MODEL_DATA.muzzle);
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
