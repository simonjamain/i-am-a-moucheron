import { MODEL_DATA as STUKA } from './meshy-stuka-data.js';
import { MODEL_DATA as SPITFIRE } from './meshy-spitfire-data.js';
import { MODEL_DATA as TANK } from './meshy-tank-data.js';
import { MODEL_DATA as TRUCK } from './meshy-flaktruck-data.js';
import { texturedMeshyParts } from './meshy-texture.js';

const models = { stuka: STUKA, spitfire: SPITFIRE, tank: TANK, flaktruck: TRUCK };
// Hull colors come exclusively from Meshy. The random identification color is
// shown by the floating marker attached in paintVehicle, not in this model.
export function addFleetHull(T, name, parents) {
  for (const { part, geometry, material } of texturedMeshyParts(T, models[name])) {
    const mesh = new T.Mesh(geometry, material);
    mesh.name = `meshy-${name}-${part.part}`;
    mesh.castShadow = mesh.receiveShadow = true;
    parents[part.part].add(mesh);
  }
}
