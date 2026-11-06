import { MODEL_DATA as BODY } from './meshy-castor-body-data.js';
import { MODEL_DATA as TURRET } from './meshy-castor-turret-data.js';
import { MODEL_DATA as WHEEL } from './meshy-castor-wheel-data.js';
import { texturedMeshyParts } from './meshy-texture.js';

// The original UV textures are immutable. Copies share GPU geometry and atlas,
// while each vehicle owns its wheel and gun pivots.
function attach(T, data, parent) {
  for (const { part, geometry, material } of texturedMeshyParts(T, data)) {
    const mesh = new T.Mesh(geometry, material);
    mesh.name = 'meshy-castor-' + part.part;
    mesh.userData.meshyShared = true;
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
  }
}

export function makeCastorMeshy(T, scene) {
  const model = new T.Group();
  attach(T, BODY, model);
  const wheels = [];
  for (const z of [-2.6, 0.3, 2.7]) {
    for (const x of [-2.37, 2.37]) {
      const axle = new T.Group();
      axle.position.set(x, -0.32, z);
      const wheel = new T.Group();
      if (x > 0) wheel.rotation.y = Math.PI;
      attach(T, WHEEL, wheel);
      axle.add(wheel);
      model.add(axle);
      wheels.push(axle);
    }
  }
  const turret = new T.Group();
  turret.position.set(0, 2.2, -1.05);
  const pitch = new T.Group();
  pitch.position.y = 0.2;
  attach(T, TURRET, pitch);
  turret.add(pitch);
  model.add(turret);
  const muzzle = new T.Object3D();
  muzzle.position.set(0, 0, -1.62);
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
