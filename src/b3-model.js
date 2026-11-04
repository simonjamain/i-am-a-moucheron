import { B3_DATA } from './meshy-b3-data.js';

const cache = new WeakMap();
export function b3Attribute(encoded, signed = false, scale = 1) {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const values = signed ? new Int16Array(bytes.buffer) : new Uint16Array(bytes.buffer);
  return Float32Array.from(values, (n) => n * scale);
}
export function makeB3(T, scene, box) {
  let resources = cache.get(T);
  if (!resources) {
    // The embedded atlas is packaged by the existing content-addressed module
    // graph. No external CDN or GLTF loader is involved.
    const texture =
      typeof document === 'undefined'
        ? new T.Texture()
        : new T.TextureLoader().load(B3_DATA.texture);
    texture.colorSpace = T.SRGBColorSpace;
    texture.flipY = false;
    const material = new T.MeshStandardMaterial({
      map: texture,
      roughness: 0.85,
      flatShading: true,
    });
    const geometries = B3_DATA.parts.map((part) => {
      const g = new T.BufferGeometry();
      g.setAttribute(
        'position',
        new T.BufferAttribute(b3Attribute(part.positions, true, 0.0005), 3),
      );
      g.setAttribute('uv', new T.BufferAttribute(b3Attribute(part.uv, false, 1 / 65535), 2));
      g.setIndex(Array.from(b3Attribute(part.indices)));
      if (part.name === 'tail') g.rotateY(Math.PI);
      g.computeVertexNormals();
      g.computeBoundingBox();
      g.computeBoundingSphere();
      return g;
    });
    resources = { material, geometries };
    cache.set(T, resources);
  }
  const model = new T.Group();
  let wing;
  const turrets = [],
    props = [];
  B3_DATA.parts.forEach((part, i) => {
    const mesh = new T.Mesh(resources.geometries[i], resources.material);
    mesh.castShadow = mesh.receiveShadow = true;
    const group = new T.Group();
    group.position.fromArray(part.pivot);
    group.add(mesh);
    model.add(group);
    if (['dorsal', 'tail', 'ventral'].includes(part.name)) {
      const pitch = new T.Group();
      group.add(pitch);
      for (const x of [-0.1, 0.1]) box(x, 0, -0.4, 0.065, 0.065, 0.8, '#354139', pitch);
      const muzzle = new T.Object3D();
      muzzle.position.set(0, 0, -0.8);
      pitch.add(muzzle);
      group.userData = { pitch, muzzle };
      if (part.name === 'tail') group.rotation.y = Math.PI;
      if (part.name === 'ventral') pitch.rotation.x = -0.65;
      turrets.push(group);
    } else if (part.name.startsWith('prop')) props.push(group);
    else if (part.name === 'wing') wing = group;
  });
  model.userData = {
    preserveTexture: true,
    turrets,
    props,
    prop: props[0],
    // Preserve the existing flight damage interface without deforming the UV atlas.
    wing,
  };
  scene.add(model);
  return model;
}
