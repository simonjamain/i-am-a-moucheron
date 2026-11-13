// Shared loader for offline-embedded Meshy UV atlases. No runtime GLTF decoder.
// Instances share immutable geometry and the original atlas; moving groups are local.
const caches = new WeakMap();

function unpack(encoded, signed, scale) {
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  const values = signed ? new Int16Array(bytes.buffer) : new Uint16Array(bytes.buffer);
  return Float32Array.from(values, (n) => n * scale);
}

export function texturedMeshyParts(T, data) {
  let byModel = caches.get(T);
  if (!byModel) {
    byModel = new WeakMap();
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
