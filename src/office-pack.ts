// Renderer of the office pack props (models placed by a layout): one instanced
// mesh per model, all sharing the pack's single atlas material. Geometry comes
// from the embedded module (scripts/import-office-pack.py); licence of the models:
// src/office-pack-LICENSE.md.
import type * as THREE from 'three';
import type { Three } from './types.ts';
import type { Prop } from './office-props.ts';
import { texturedMeshyParts, type MeshyTexturedData } from './meshy-texture.ts';
import { MODEL_DATA } from './office-pack-data.js';

const DATA = MODEL_DATA as unknown as MeshyTexturedData;

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
    const mesh = new T.InstancedMesh(part.geometry, part.material, list.length);
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
