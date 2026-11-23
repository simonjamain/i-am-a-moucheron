import { MAP } from './scale.ts';
import { createHowitzer } from './howitzer-model.ts';
import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';

/** Placement of a fortification station (scaled reference coordinates). */
export interface FortificationPlacement {
  x: number;
  y: number;
  z: number;
  angle?: number;
}
// The only occupiable fortification is the anti-materiel howitzer (issue #113):
// articulated Meshy model at player scale (shared resources), in the same scaled
// reference coordinates as the fixed DCA.
export function makeFortificationStation(T: Three, st: FortificationPlacement): THREE.Group {
  const root = new T.Group();
  root.position.set(st.x, st.y, st.z);
  root.scale.setScalar(MAP.ratio);
  root.rotation.y = st.angle || 0;
  const howitzer = createHowitzer(T);
  root.add(howitzer.yaw);
  root.userData = {
    yaw: howitzer.yaw,
    pitch: howitzer.pitch,
    muzzles: [howitzer.muzzle, howitzer.muzzle],
    barrel: 0,
    howitzer,
  };
  return root;
}
