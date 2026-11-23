import { M1_DATA } from './meshy-m1-data.ts';
import { buildMeshyRig } from './meshy-rig.ts';
import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';
import { rigWheels } from './aircraft-wheels.ts';

// Remodelled M1 light fighter: propeller and the two sculpted nose machine
// guns as muzzles. Damage shows as engine smoke, so the wing is not separate.
export function makeM1(T: Three, scene: THREE.Object3D): THREE.Group {
  const { root: model, nodes, anchors } = buildMeshyRig(T, M1_DATA, 'm1');
  model.userData = {
    preserveTexture: true,
    wing: new T.Object3D(),
    prop: nodes.prop,
    gunMeshes: [],
    pilotMuzzles: anchors.gun,
    vehicleType: 'fighter',
  };
  rigWheels(model, nodes, 'lightfighter');
  scene.add(model);
  return model;
}
