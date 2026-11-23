// Renderer of the office pack props (models placed by a layout): one instanced
// mesh per model, all sharing the pack's single atlas material. Geometry comes
// from the embedded module (scripts/import-office-pack.py); licence of the models:
// src/office-pack-LICENSE.md.
import type * as THREE from 'three';
import type { Three } from './types.ts';
import type { Prop, OfficeModel } from './office-props.ts';
import { LAMP_LOOK } from './office-lights.ts';
import { texturedMeshyParts, type MeshyTexturedData } from './meshy-texture.ts';
import { MODEL_DATA } from './office-pack-data.ts';

const DATA = MODEL_DATA as unknown as MeshyTexturedData;

/**
 * Lit parts of a model: triangles whose atlas UVs fall in the rectangle
 * [u0, v0, u1, v1] glow in `color` (the globe of the ceiling fan, its lamp).
 */
export const GLOWING: Partial<Record<OfficeModel, { uv: readonly number[]; color: string }>> = {
  Ceiling_Fan: { uv: [0.6, 0.87, 0.77, 1], color: LAMP_LOOK.fan.color },
};
/** Emissive strength of lit parts, over their atlas colour. */
export const GLOW_INTENSITY = 1.6;
type Batch = { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] };
const glowing = new WeakMap<THREE.BufferGeometry, Batch>();
// Same geometry with its lit triangles last, as a second group with a glowing material.
function glowBatch(
  T: Three,
  model: OfficeModel,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
): Batch {
  const spec = GLOWING[model];
  if (!spec) return { geometry, material };
  const cached = glowing.get(geometry);
  if (cached) return cached;
  const index = geometry.index!.array,
    uv = geometry.getAttribute('uv');
  const [u0, v0, u1, v1] = spec.uv;
  const plain: number[] = [],
    lit: number[] = [];
  for (let t = 0; t < index.length; t += 3) {
    let u = 0,
      v = 0;
    for (let k = 0; k < 3; k++) {
      u += uv.getX(index[t + k]) / 3;
      v += uv.getY(index[t + k]) / 3;
    }
    (u >= u0 && u <= u1 && v >= v0 && v <= v1 ? lit : plain).push(
      index[t],
      index[t + 1],
      index[t + 2],
    );
  }
  const split = geometry.clone();
  split.setIndex([...plain, ...lit]);
  split.addGroup(0, plain.length, 0);
  split.addGroup(plain.length, lit.length, 1);
  const glow = (material as THREE.MeshStandardMaterial).clone();
  glow.emissive = new T.Color(spec.color);
  glow.emissiveMap = glow.map;
  glow.emissiveIntensity = GLOW_INTENSITY;
  glow.name = 'office-glow-' + model;
  const batch = { geometry: split, material: [material, glow] };
  glowing.set(geometry, batch);
  return batch;
}

/** Adds the props to `parent` (one InstancedMesh per model); returns the meshes. */
export function addOfficeProps(
  T: Three,
  props: readonly Prop[],
  parent: THREE.Object3D,
): THREE.InstancedMesh[] {
  const parts = new Map(texturedMeshyParts(T, DATA).map((r) => [r.part.part as string, r]));
  const byModel = new Map<string, Prop[]>();
  for (const p of props) {
    let list = byModel.get(p.model);
    if (!list) byModel.set(p.model, (list = []));
    list.push(p);
  }
  const meshes: THREE.InstancedMesh[] = [];
  const matrix = new T.Matrix4(),
    rotation = new T.Quaternion(),
    up = new T.Vector3(0, 1, 0),
    one = new T.Vector3(1, 1, 1),
    at = new T.Vector3();
  for (const [model, list] of byModel) {
    const part = parts.get(model);
    if (!part) throw new Error('office pack model missing: ' + model);
    const batch = glowBatch(T, model as OfficeModel, part.geometry, part.material);
    const mesh = new T.InstancedMesh(batch.geometry, batch.material, list.length);
    mesh.name = 'office-prop-' + model;
    list.forEach((p, i) => {
      rotation.setFromAxisAngle(up, p.yaw);
      mesh.setMatrixAt(i, matrix.compose(at.set(p.x, p.y, p.z), rotation, one));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.meshyShared = true;
    parent.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}
