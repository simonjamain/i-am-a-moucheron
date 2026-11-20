// Shared loader for offline-embedded Meshy UV atlases. No runtime GLTF decoder.
// Instances share immutable geometry and the original atlas; moving groups are local.
import type * as THREE from 'three';
import type { Three } from './types.ts';

/** One embedded part: base64 int16 positions, uint16 UVs and uint16 indices. */
export interface MeshyPartData {
  positions: string;
  uv: string;
  indices: string;
  [key: string]: unknown;
}
export interface MeshyTexturedData {
  texture: string;
  doubleSided?: boolean;
  parts: readonly MeshyPartData[];
}
export interface MeshyPartResource<P extends MeshyPartData = MeshyPartData> {
  part: P;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}
const caches = new WeakMap<Three, WeakMap<MeshyTexturedData, MeshyPartResource[]>>();

function unpack(encoded: string, signed: boolean, scale: number): Float32Array {
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  const values = signed ? new Int16Array(bytes.buffer) : new Uint16Array(bytes.buffer);
  return Float32Array.from(values, (n) => n * scale);
}

export function texturedMeshyParts<D extends MeshyTexturedData>(
  T: Three,
  data: D,
): MeshyPartResource<D['parts'][number]>[] {
  let byModel = caches.get(T);
  if (!byModel) {
    byModel = new WeakMap<MeshyTexturedData, MeshyPartResource[]>();
    caches.set(T, byModel);
  }
  let resources = byModel.get(data);
  if (!resources) {
    const texture =
      typeof document === 'undefined' ? new T.Texture() : new T.TextureLoader().load(data.texture);
    texture.colorSpace = T.SRGBColorSpace;
    texture.flipY = false;
    const material = new T.MeshStandardMaterial({
      map: texture,
      roughness: 0.85,
      flatShading: true,
      side: data.doubleSided ? T.DoubleSide : T.FrontSide,
    });
    resources = data.parts.map((part) => {
      const geometry = new T.BufferGeometry();
      geometry.setAttribute(
        'position',
        new T.BufferAttribute(unpack(part.positions, true, 0.0005), 3),
      );
      geometry.setAttribute('uv', new T.BufferAttribute(unpack(part.uv, false, 1 / 65535), 2));
      const bytes = Uint8Array.from(atob(part.indices), (char) => char.charCodeAt(0));
      geometry.setIndex(new T.BufferAttribute(new Uint16Array(bytes.buffer), 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return { part, geometry, material };
    });
    byModel.set(data, resources);
  }
  return resources;
}
