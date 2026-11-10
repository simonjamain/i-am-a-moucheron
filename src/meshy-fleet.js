import { MODEL_DATA as STUKA } from './meshy-stuka-data.js';
import { texturedMeshyParts } from './meshy-texture.js';

// Spitfire, T3, D2, H2 and B3 are articulated rigs (meshy-rig.js); only the
// Stuka hull still uses this static import.
const models = { stuka: STUKA };
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
