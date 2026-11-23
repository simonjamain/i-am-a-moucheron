import { B3_DATA } from './meshy-b3-data.ts';
import { buildMeshyRig, gunMount } from './meshy-rig.ts';
import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';
import { rigWheels } from './aircraft-wheels.ts';

// Remodelled B3: two propellers, detachable-looking wings for damage, and the
// three gunner turrets in seat order (dorsal, tail, ventral). The tail and
// ventral guns keep their sculpted rest pose until a gunner aims them.
export function makeB3(T: Three, scene: THREE.Object3D): THREE.Group {
  const { root: model, nodes, anchors } = buildMeshyRig(T, B3_DATA, 'b3');
  const turrets = ['dorsal', 'tail', 'ventral'].map((name) =>
    gunMount(nodes[name], nodes[name + 'Gun'], anchors[name + 'Muzzle'][0]),
  );
  const props = [nodes.propLeft, nodes.propRight];
  model.userData = {
    preserveTexture: true,
    turrets,
    props,
    prop: props[0],
    wing: nodes.wing,
  };
  rigWheels(model, nodes, 'medbomber');
  scene.add(model);
  return model;
}
