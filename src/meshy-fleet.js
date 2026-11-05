import { PARTS as STUKA } from './meshy-stuka-data.js';
import { PARTS as SPITFIRE } from './meshy-spitfire-data.js';
import { PARTS as TANK } from './meshy-tank-data.js';
import { PARTS as TRUCK } from './meshy-flaktruck-data.js';

const models = { stuka: STUKA, spitfire: SPITFIRE, tank: TANK, flaktruck: TRUCK };
const caches = new WeakMap();
// Meshy data is baked offline. Share immutable buffers/materials, never animation groups.
export function addFleetHull(T, name, parents, paint) {
  let cache = caches.get(T);
  if (!cache) {
    cache = new Map();
    caches.set(T, cache);
  }
  if (!cache.has(name)) {
    const fixed = new T.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      flatShading: true,
    });
    cache.set(
      name,
      models[name].map((part) => {
        const geometry = new T.BufferGeometry();
        geometry.setAttribute('position', new T.Float32BufferAttribute(part.positions, 3));
        if (part.colors)
          geometry.setAttribute('color', new T.Float32BufferAttribute(part.colors, 3));
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return { part, geometry, fixed };
      }),
    );
  }
  for (const { part, geometry, fixed } of cache.get(name)) {
    const mesh = new T.Mesh(geometry, part.paint ? paint : fixed);
    mesh.name = `meshy-${name}-${part.part}`;
    mesh.castShadow = mesh.receiveShadow = true;
    parents[part.part].add(mesh);
  }
}
