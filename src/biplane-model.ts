import { BIPLANE_DATA } from './meshy-biplane-data.js';
import { BIPLANE_BOMBER_DATA } from './meshy-biplane-bomber-data.js';
import { buildMeshyRig, gunMount } from './meshy-rig.ts';
import type * as THREE from 'three';
import type { Three } from './types.ts';
import { GEAR_SAG, MODEL_TO_REF } from './plane-physics.ts';

// Wheels (rig-biplane-wheels.mjs): two parts pivoting on their hubs, lifted by the spring
// compression of the aircraft's physics (plane-physics.ts) and spun by the ground speed.
export const WHEEL_RADIUS = 0.285; // model units
export function poseBiplaneWheels(
  model: THREE.Object3D,
  compression: readonly number[],
  spin = 0,
): void {
  const wheels = model.userData.wheels as THREE.Object3D[] | undefined;
  if (!wheels) return;
  wheels.forEach((wheel, i) => {
    wheel.position.y = wheel.userData.restY + (compression[i] ?? 0) / MODEL_TO_REF;
    wheel.rotation.x += spin;
  });
}
/** What an aircraft that nobody simulates here shows: parked springs sag, flying ones extend. */
export const parkedCompression = (landed: boolean): number[] =>
  landed ? [GEAR_SAG, GEAR_SAG] : [0, 0];

// Biplane fighter (M1 slot): propeller and one central machine gun, sculpted on
// the hull, whose muzzle is the single pilot barrel. Damage shows as engine
// smoke, so nothing else is separate.
export function makeBiplane(T: Three, scene: THREE.Object3D): THREE.Group {
  const { root: model, nodes, anchors } = buildMeshyRig(T, BIPLANE_DATA, 'biplane');
  model.userData = {
    preserveTexture: true,
    wing: new T.Object3D(),
    prop: nodes.prop,
    gunMeshes: [],
    pilotMuzzles: anchors.gun,
    vehicleType: 'fighter',
    wheels: [nodes.wheelL, nodes.wheelR],
  };
  for (const wheel of model.userData.wheels as THREE.Object3D[])
    wheel.userData.restY = wheel.position.y;
  scene.add(model);
  return model;
}

// Biplane bomber (B3 slot): one propeller, a pilot and a rear gunner whose
// machine gun yaws and elevates on its ring (backward at rest).
export function makeBiplaneBomber(T: Three, scene: THREE.Object3D): THREE.Group {
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
