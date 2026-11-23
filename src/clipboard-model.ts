// The clipboard on Saint Pierre's counter (docs/purgatory-scene.md): clicking it
// opens the papers. Owner-supplied model, imported by scripts/import-clipboard.py.
import type * as THREE from 'three';
import type { Three } from './types.ts';
import { CLIPBOARD_DATA as D } from './clipboard-data.ts';

/** Size of the clipboard in metres: width (x), thickness (y), length (z). */
export const CLIPBOARD_SIZE = D.size;

/** A clipboard lying flat, in metres: bottom at y = 0, clip toward -Z. */
export function createClipboard(T: Three): THREE.Group {
  const group = new T.Group();
  group.name = 'porte-bloc';
  const positions = new T.Float32BufferAttribute(Array.from(D.positions), 3);
  const normals = new T.Float32BufferAttribute(Array.from(D.normals), 3);
  for (const part of D.groups) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', positions);
    geometry.setAttribute('normal', normals);
    geometry.setIndex(Array.from(part.indices));
    const material = new T.MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
    // The source colours are linear.
    material.color.setRGB(part.color[0], part.color[1], part.color[2], T.LinearSRGBColorSpace);
    const mesh = new T.Mesh(geometry, material);
    mesh.name = 'porte-bloc-' + part.name;
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}
