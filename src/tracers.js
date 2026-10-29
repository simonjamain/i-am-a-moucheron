import { MAP } from './scale.js';
// World-space luminous streaks; visibility never changes swept collision rays.
export function makeTracer(T, scene, position, direction, color, shell = false) {
  const root = new T.Group(),
    length = MAP.metres(shell ? 7 : 11),
    width = MAP.metres(shell ? 0.14 : 0.09);
  const material = new T.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    blending: T.AdditiveBlending,
    toneMapped: false,
  });
  const halo = new T.Mesh(new T.CylinderGeometry(width * 2.4, width * 0.5, length, 6), material);
  halo.rotation.x = Math.PI / 2;
  halo.position.z = -length / 2;
  const coreMaterial = new T.MeshBasicMaterial({
    color: '#fff9da',
    depthWrite: false,
    toneMapped: false,
  });
  const core = new T.Mesh(
    new T.CylinderGeometry(width * 0.55, width * 0.3, length * 0.85, 5),
    coreMaterial,
  );
  core.rotation.x = Math.PI / 2;
  core.position.z = -length * 0.425;
  root.add(halo, core);
  root.position.copy(position);
  root.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), direction);
  root.userData = {
    length,
    width,
    halo,
    core,
    dispose() {
      for (const part of [halo, core]) {
        part.geometry.dispose();
        part.material.dispose();
      }
    },
  };
  scene.add(root);
  return root;
}
export function updateTracer(T, root, direction, camera) {
  root.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), direction);
  // A minimum projected width keeps distant small-calibre tracers legible.
  const pixel =
    (2 * root.position.distanceTo(camera.position) * Math.tan((camera.fov * Math.PI) / 360)) /
    Math.max(360, globalThis.innerHeight || 900);
  const scale = Math.max(1, Math.min(8, (pixel * 1.4) / root.userData.width));
  root.scale.set(scale, scale, 1);
}
