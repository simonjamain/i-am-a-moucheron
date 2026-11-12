import { MODEL_DATA as REFUEL } from './meshy-refuel-data.js';
import { MODEL_DATA as RADAR } from './meshy-radar-data.js';
import { texturedMeshyParts } from './meshy-texture.js';

export function makeServiceStation(T, kind) {
  const model = new T.Group();
  for (const { part, geometry, material } of texturedMeshyParts(
    T,
    kind === 'radar' ? RADAR : REFUEL,
  )) {
    const pivot = new T.Group();
    pivot.position.fromArray(part.pivot);
    const mesh = new T.Mesh(geometry, material);
    mesh.name = `meshy-${kind}-${part.part}`;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.meshyShared = true;
    pivot.add(mesh);
    model.add(pivot);
    if (part.part === 'antenna') model.userData.dish = pivot;
  }
  return model;
}
export function animateRadar(model, dt, active = true) {
  if (active && model.userData.dish)
    model.userData.dish.rotation.y = (model.userData.dish.rotation.y + dt) % (2 * Math.PI);
}
