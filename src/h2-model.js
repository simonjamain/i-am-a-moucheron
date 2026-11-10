import { H2_DATA } from './meshy-h2-data.js';
import { buildMeshyRig, gunMount } from './meshy-rig.js';

// Remodelled H2: five-blade main rotor (Y axis), tail rotor (X axis) and the
// copilot's nose gun (housing yaws, twin barrels elevate).
export function makeH2(T, scene) {
  const { root: model, nodes, anchors } = buildMeshyRig(T, H2_DATA, 'h2');
  model.userData = {
    preserveTexture: true,
    turrets: [gunMount(nodes.gun, nodes.gunBarrel, anchors.muzzle[0])],
    rotor: nodes.rotor,
    tailRotor: nodes.tailRotor,
    prop: new T.Object3D(),
    wing: new T.Object3D(),
  };
  scene.add(model);
  return model;
}
