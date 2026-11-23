import { texturedMeshyParts } from './meshy-texture.ts';
import type { MeshyPartData, MeshyTexturedData } from './meshy-texture.ts';
import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';

/** A pivot of `data.rig`, placed in its parent's frame ('body' is the root). */
export interface MeshyRigNode {
  name: string;
  parent: string;
  position: readonly number[];
  quaternion: readonly number[];
}
export interface MeshyRigAnchor {
  name: string;
  node: string;
  at: readonly number[];
}
export interface MeshyRigData extends MeshyTexturedData {
  rig: readonly MeshyRigNode[];
  anchors: readonly MeshyRigAnchor[];
  parts: readonly (MeshyPartData & { part: string })[];
}
export interface MeshyRig {
  root: THREE.Group;
  nodes: Record<string, THREE.Group>;
  anchors: Record<string, THREE.Object3D[]>;
}

// Articulated Meshy vehicles (scripts/import-meshy-vehicle.py): every node of
// `data.rig` is a pivot group placed in its parent's frame, with its rest
// rotation (guns are stored aligned on -Z, as aimGun expects). Geometry,
// material and atlas are shared by all instances; pivots belong to each one.
export function buildMeshyRig(T: Three, data: MeshyRigData, prefix: string): MeshyRig {
  const root = new T.Group();
  const nodes: Record<string, THREE.Group> = { body: root };
  for (const node of data.rig) {
    const group = new T.Group();
    group.name = `${prefix}-${node.name}-pivot`;
    group.position.fromArray(node.position);
    // Leave identity rests untouched (their Euler would read -0 after a round trip).
    if (node.quaternion[3] !== 1) group.quaternion.fromArray(node.quaternion);
    nodes[node.name] = group;
  }
  for (const node of data.rig) nodes[node.parent].add(nodes[node.name]);
  for (const { part, geometry, material } of texturedMeshyParts(T, data)) {
    const mesh = new T.Mesh(geometry, material);
    mesh.name = `meshy-${prefix}-${part.part}`;
    mesh.userData.meshyShared = true;
    mesh.castShadow = mesh.receiveShadow = true;
    nodes[part.part].add(mesh);
  }
  const anchors: Record<string, THREE.Object3D[]> = {};
  for (const anchor of data.anchors) {
    const point = new T.Object3D();
    point.name = `${prefix}-${anchor.name}`;
    point.position.fromArray(anchor.at);
    nodes[anchor.node].add(point);
    (anchors[anchor.name] ??= []).push(point);
  }
  return { root, nodes, anchors };
}

// Gunner mount for aimGun: yaw node with its elevation node and muzzle.
export function gunMount<M extends THREE.Object3D>(
  mount: M,
  pitch: THREE.Object3D,
  muzzle: THREE.Object3D,
  coaxMuzzle: THREE.Object3D = muzzle,
): M {
  mount.userData = { ...mount.userData, pitch, muzzle, coaxMuzzle };
  return mount;
}
