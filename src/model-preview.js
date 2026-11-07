// Own only the preview's materials and procedural geometry. Cached Meshy buffers
// and texture atlases remain owned by their model factory.
export class ModelPreview {
  constructor(T, scene) {
    this.root = new T.Group();
    this.root.visible = false;
    this.materials = [];
    scene.add(this.root);
  }
  clear() {
    for (const child of [...this.root.children]) {
      child.traverse((part) => {
        if (part.userData?.meshyShared) return;
        if (part.isInstancedMesh) part.dispose();
        part.geometry?.dispose();
      });
      this.root.remove(child);
    }
    for (const material of this.materials) material.dispose();
    this.materials = [];
    this.key = null;
  }
  show(key, factory, pose, valid) {
    if (key !== this.key) {
      this.clear();
      const model = factory();
      if (!model) {
        this.root.visible = false;
        return;
      }
      const ownedOriginals = new Set();
      model.traverse((part) => {
        if (!part.isMesh) return;
        const copy = (original) => {
          const material = original.clone();
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
        material.color.copy(material.userData.previewColor);
        if (!valid) material.color.set('#ed665b');
      }
    }
    this.root.visible = true;
  }
}
