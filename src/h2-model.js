import { H2_DATA } from './meshy-h2-data.js';
import { buildMeshyRig, gunMount } from './meshy-rig.js';

// Remodelled H2: five-blade main rotor (Y axis), tail rotor (X axis) and the
// copilot's nose gun (housing yaws, twin barrels elevate).
export function makeH2(T, scene) {
  const { root: model, nodes, anchors } = buildMeshyRig(T, H2_DATA, 'h2');
  // Keep elevation on the original node; spin only the sculpted tubes around
  // their common longitudinal axis. No geometry or UV is modified.
  const spin = new T.Group();
  spin.position.set(0.0115, -0.0055, 0);
  for (const mesh of [...nodes.gunBarrel.children].filter((o) => o.isMesh)) {
    nodes.gunBarrel.remove(mesh);
    mesh.position.sub(spin.position);
    spin.add(mesh);
  }
  nodes.gunBarrel.add(spin);
  const muzzles = [0.027, -0.038].map((y) => {
    const point = new T.Object3D();
    point.position.set(0, y - spin.position.y, -0.5295);
    spin.add(point);
    return point;
  });
  nodes.gun.userData.muzzles = muzzles;
  let speed = 0;
  model.userData = {
    preserveTexture: true,
    turrets: [gunMount(nodes.gun, nodes.gunBarrel, anchors.muzzle[0])],
    rotor: nodes.rotor,
    tailRotor: nodes.tailRotor,
    prop: new T.Object3D(),
    wing: new T.Object3D(),
    gunSpin: spin,
    animateGun(dt, firing) {
      speed += ((firing ? 60 : 0) - speed) * (1 - Math.exp(-Math.max(0, dt) * (firing ? 12 : 7)));
      spin.rotation.z = (spin.rotation.z + speed * Math.max(0, dt)) % (2 * Math.PI);
      return speed;
    },
  };
  scene.add(model);
  return model;
}
