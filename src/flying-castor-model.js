import { MODEL_DATA } from './meshy-flying-castor-data.js';
import { texturedMeshyParts } from './meshy-texture.js';

// Castor volant: one Meshy mesh whose two tandem rotors (hub and three blades
// each) are separate islands; scripts/import-meshy-flying-castor.py stores each
// rotor around its vertical axis. Geometry, material and atlas are shared
// between helicopters; the rotor groups are per vehicle. Nose toward -Z.
export const FLYING_CASTOR_ROTORS = Object.freeze(['rotorFront', 'rotorRear']);

export function makeFlyingCastorMeshy(T, scene) {
  const model = new T.Group();
  const rotors = [];
  for (const { part, geometry, material } of texturedMeshyParts(T, MODEL_DATA)) {
    const mesh = new T.Mesh(geometry, material);
    mesh.name = 'meshy-flying-castor-' + part.part;
    mesh.userData.meshyShared = true;
    mesh.castShadow = mesh.receiveShadow = true;
    if (part.part === 'body') {
      model.add(mesh);
      continue;
    }
    const group = new T.Group();
    group.name = part.part;
    group.position.fromArray(part.pivot);
    group.add(mesh);
    model.add(group);
    rotors.push(group);
  }
  if (rotors.length !== FLYING_CASTOR_ROTORS.length) throw Error('Missing Castor volant rotor');
  // Engine smoke under each rotor hub (damage shows as smoke, never as a change of shape).
  const engines = rotors.map((rotor) => {
    const anchor = new T.Object3D();
    anchor.name = 'engine-smoke';
    anchor.position.copy(rotor.position).add(new T.Vector3(0, -0.4, 0));
    model.add(anchor);
    return anchor;
  });
  model.userData = {
    engines,
    preserveTexture: true,
    // Tandem rotors turn in opposite directions (no tail rotor).
    rotor: rotors[0],
    counterRotor: rotors[1],
    rotors,
    prop: new T.Object3D(),
    wing: new T.Object3D(),
  };
  scene.add(model);
  return model;
}
