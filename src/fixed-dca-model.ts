import light from './fixed-dca-dca-data.ts';
import rapid from './fixed-dca-dcaRapid-data.ts';
import heavy from './fixed-dca-dcaHeavy-data.ts';
import { MAP } from './scale.ts';
import type * as THREE from 'three/webgpu';
import type { Three, Vec3 } from './types.ts';

const data = { dca: light, dcaRapid: rapid, dcaHeavy: heavy };
export type FixedDcaModelKind = keyof typeof data;
interface DcaShared {
  material: THREE.MeshStandardMaterial;
  geometries: Record<string, THREE.BufferGeometry>;
}
export interface FixedDcaStation {
  kind: FixedDcaModelKind;
  x?: number;
  y?: number;
  z?: number;
}
const cache = new WeakMap<Three, Map<FixedDcaModelKind, DcaShared>>();
const seats: Record<FixedDcaModelKind, Vec3> = {
  dca: [-0.43, 0.9, 1.68],
  dcaRapid: [0.27, 0.92, 1.78],
  dcaHeavy: [0.64, 1.18, 2.34],
};

function typed<A>(encoded: string, Type: new (buffer: ArrayBufferLike) => A): A {
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  return new Type(bytes.buffer);
}

function shared(T: Three, kind: FixedDcaModelKind): DcaShared {
  if (!cache.has(T)) cache.set(T, new Map());
  const models = cache.get(T)!;
  if (models.has(kind)) return models.get(kind)!;
  const model = data[kind];
  const texture =
    typeof document === 'undefined' ? new T.Texture() : new T.TextureLoader().load(model.texture);
  texture.colorSpace = T.SRGBColorSpace;
  texture.flipY = false;
  const material = new T.MeshStandardMaterial({ map: texture, roughness: 0.85 });
  const geometries: Record<string, THREE.BufferGeometry> = {};
  for (const [name, part] of Object.entries(model.parts)) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      'position',
      new T.BufferAttribute(typed(part.positions, Float32Array), 3),
    );
    geometry.setAttribute('normal', new T.BufferAttribute(typed(part.normals, Float32Array), 3));
    geometry.setAttribute('uv', new T.BufferAttribute(typed(part.uvs, Float32Array), 2));
    geometry.setIndex(new T.BufferAttribute(typed(part.indices, Uint16Array), 1));
    geometries[name] = geometry;
  }
  const result = { material, geometries };
  models.set(kind, result);
  return result;
}

export function makeFixedDca(T: Three, station: FixedDcaStation): THREE.Group {
  const { kind, x = 0, y = 0, z = 0 } = station;
  const { material, geometries } = shared(T, kind);
  const root = new T.Group();
  root.position.set(x, y, z);
  root.scale.setScalar(MAP.ratio);
  const yaw = new T.Group();
  const pitch = new T.Group();
  root.add(yaw);
  yaw.add(pitch);
  pitch.position.fromArray(data[kind].pivot);
  for (const [name, parent] of [
    ['base', root],
    ['mount', yaw],
    ['barrels', pitch],
  ] as const) {
    const mesh = new T.Mesh(geometries[name], material);
    mesh.userData.meshyShared = true;
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    if (name === 'base') root.userData.baseMesh = mesh;
  }
  const muzzles = data[kind].muzzles.map((point) => {
    const muzzle = new T.Object3D();
    muzzle.position.fromArray(point);
    pitch.add(muzzle);
    return muzzle;
  });
  yaw.userData.pitch = pitch;
  Object.assign(root.userData, {
    yaw,
    pitch,
    muzzles,
    barrel: 0,
    shotAt: 0,
    rapidCooldown: 0,
    seat: seats[kind],
  });
  return root;
}

// Keep the sight just past the large tube so it cannot obstruct the view,
// even at vertical elevation. Copy the orientation to preserve azimuth there.
export function positionHeavyFlakSight(T: Three, camera: THREE.Camera, gun: THREE.Object3D): void {
  gun.userData.pitch.getWorldQuaternion(camera.quaternion);
  const ahead = new T.Vector3(0, 0, -MAP.metres(0.15)).applyQuaternion(camera.quaternion);
  gun.userData.muzzles[0].getWorldPosition(camera.position).add(ahead);
  camera.updateMatrixWorld();
}
