import { M1_DATA } from './meshy-m1-data.js';
import { buildMeshyRig } from './meshy-rig.js';

// Remodelled M1 light fighter: high wing (with its struts), propeller and the
// two sculpted nose machine guns as muzzles.
export function makeM1(T, scene) {
  const { root: model, nodes, anchors } = buildMeshyRig(T, M1_DATA, 'm1');
  model.userData = {
    preserveTexture: true,
    wing: nodes.wing,
    prop: nodes.prop,
    gunMeshes: [],
    pilotMuzzles: anchors.gun,
    vehicleType: 'fighter',
  };
  scene.add(model);
  return model;
}
