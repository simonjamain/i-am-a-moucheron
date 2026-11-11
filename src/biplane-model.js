import { BIPLANE_DATA } from './meshy-biplane-data.js';
import { BIPLANE_BOMBER_DATA } from './meshy-biplane-bomber-data.js';
import { buildMeshyRig, gunMount } from './meshy-rig.js';

// Biplane fighter (M1 slot): propeller and one central machine gun, sculpted on
// the hull, whose muzzle is the single pilot barrel. Damage shows as engine
// smoke, so nothing else is separate.
export function makeBiplane(T, scene) {
  const { root: model, nodes, anchors } = buildMeshyRig(T, BIPLANE_DATA, 'biplane');
  model.userData = {
    preserveTexture: true,
    wing: new T.Object3D(),
    prop: nodes.prop,
    gunMeshes: [],
    pilotMuzzles: anchors.gun,
    vehicleType: 'fighter',
  };
  scene.add(model);
  return model;
}

// Biplane bomber (B3 slot): one propeller, a pilot and a rear gunner whose
// machine gun yaws and elevates on its ring (backward at rest).
export function makeBiplaneBomber(T, scene) {
  const { root: model, nodes, anchors } = buildMeshyRig(T, BIPLANE_BOMBER_DATA, 'biplane-bomber');
  const turrets = [gunMount(nodes.dorsal, nodes.dorsalGun, anchors.dorsalMuzzle[0])];
  model.userData = {
    preserveTexture: true,
    turrets,
    props: [nodes.prop],
    prop: nodes.prop,
    wing: new T.Object3D(),
  };
  scene.add(model);
  return model;
}
