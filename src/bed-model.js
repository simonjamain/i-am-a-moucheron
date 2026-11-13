import { MODEL_DATA } from './meshy-bed-data.js';
import { texturedMeshyParts } from './meshy-texture.js';

// One static, open drawer bed. Its original geometry and atlas are shared by
// placed beds, placement previews and purchase thumbnails.
export function makeBed(T) {
  const root = new T.Group();
  for (const { part, geometry, material } of texturedMeshyParts(T, MODEL_DATA)) {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.fromArray(part.pivot);
    mesh.name = 'meshy-drawer-bed';
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.meshyShared = true;
    root.add(mesh);
  }
  return root;
}
