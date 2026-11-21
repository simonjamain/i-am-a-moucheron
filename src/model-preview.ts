// Own only the preview's materials and procedural geometry. Cached Meshy buffers
// and texture atlases remain owned by their model factory.
import type * as THREE from 'three';
import type { Three } from './types.ts';

/** Any lit or basic material; the preview tints the ones that carry a colour. */
type PreviewMaterial = THREE.Material & { color?: THREE.Color };

export interface PreviewPose {
  x: number;
  y: number;
  z: number;
  angle?: number;
}

export class ModelPreview {
  root: THREE.Group;
  materials: PreviewMaterial[];
  key?: string | null;
  constructor(T: Three, scene: THREE.Object3D) {
    this.root = new T.Group();
    this.root.visible = false;
    this.materials = [];
    scene.add(this.root);
  }
  clear(): void {
    for (const child of [...this.root.children]) {
      child.traverse((object) => {
        const part = object as Partial<THREE.InstancedMesh>;
        if (part.userData?.meshyShared) return;
        if (part.isInstancedMesh) part.dispose!();
        part.geometry?.dispose();
      });
      this.root.remove(child);
    }
    for (const material of this.materials) material.dispose();
    this.materials = [];
    this.key = null;
  }
  show(
    key: string,
    factory: () => THREE.Object3D | null | undefined,
    pose: PreviewPose,
    valid: boolean,
  ): void {
    if (key !== this.key) {
      this.clear();
      const model = factory();
      if (!model) {
        this.root.visible = false;
        return;
      }
      const ownedOriginals = new Set<THREE.Material>();
      model.traverse((object) => {
        const part = object as THREE.Mesh<THREE.BufferGeometry, PreviewMaterial | PreviewMaterial[]>;
        if (!part.isMesh) return;
        const copy = (original: PreviewMaterial): PreviewMaterial => {
          const material = original.clone() as PreviewMaterial;
          material.transparent = true;
          material.opacity = 0.45;
          material.depthWrite = false;
          material.userData.previewColor = material.color?.clone();
          this.materials.push(material);
          if (!part.userData?.meshyShared && !part.userData.sharedMaterial)
            ownedOriginals.add(original);
          return material;
        };
        part.material = Array.isArray(part.material)
          ? part.material.map(copy)
          : copy(part.material);
        part.castShadow = false;
        part.userData.projectileSolid = false;
      });
      for (const material of ownedOriginals) material.dispose();
      this.root.add(model);
      this.key = key;
    }
    this.root.position.set(pose.x, pose.y, pose.z);
    this.root.rotation.y = pose.angle || 0;
    for (const material of this.materials) {
      if (material.color) {
        material.color.copy(material.userData.previewColor as THREE.Color);
        if (!valid) material.color.set('#ed665b');
      }
    }
    this.root.visible = true;
  }
}
