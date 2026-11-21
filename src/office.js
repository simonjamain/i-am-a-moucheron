import { applyShadowPreset } from './shadow-settings.ts';
import { activeLayout, layoutPieces } from './layouts.ts';
// Draws the active layout (see layouts.js): room shell, furniture volumes, bin,
// vents and floor holes. Everything goes into one group so a room's plan can be
// replaced (`dispose`) without touching the rest of the scene. Colliders are the
// bounds of the very primitives drawn here.
export function createOffice(T, scene, { box, cyl, ball }) {
  const layout = activeLayout();
  const root = new T.Group();
  scene.add(root);
  const colliders = [],
    solidObjects = [];
  const register = (m) => {
    m.updateWorldMatrix(true, true);
    colliders.push(new T.Box3().setFromObject(m));
    solidObjects.push(m);
    return m;
  };
  // Lights belong to the scene, not to a plan: they are added once.
  if (!scene.children.some((o) => o.isDirectionalLight)) {
    const sky = new T.HemisphereLight('#eff3dd', '#50634e', 2.5);
    const sun = new T.DirectionalLight('#fff4d9', 3);
    sun.position.set(-3, 6, 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -5,
      right: 5,
      top: 5,
      bottom: -5,
      near: 0.01,
      far: 15,
    });
    sun.shadow.bias = -0.00001;
    scene.add(sky, sun);
    applyShadowPreset(T, null, scene);
  }
  for (const p of layoutPieces(layout)) {
    let m;
    if (p.shape === 'cyl') m = cyl(p.x, p.y, p.z, p.radiusTop ?? p.w, p.w, p.h, p.color, root);
    else m = box(p.x, p.y, p.z, p.w, p.h, p.d, p.color, root);
    if (p.grid) {
      // Finely divided desk top, so ground shadows and bending stay smooth.
      m.geometry.dispose();
      m.geometry = new T.BoxGeometry(p.w, p.h, p.d, ...p.grid);
    }
    if (p.solid) register(m);
    else m.castShadow = false;
  }
  // Decoration of the shell (never solid): floor boards and the window.
  for (let x = -4; x < 4.2; x += 0.3) box(x, 0.0002, 0, 0.002, 0.0004, 7.2, '#657963', root);
  box(-4.145, 1.7, -0.6, 0.025, 1.3, 2, '#e4ecd5', root);
  for (const z of [-1.25, -0.6, 0.05]) box(-4.12, 1.7, z, 0.035, 1.3, 0.035, '#678a78', root);
  box(-4.12, 1.7, -0.6, 0.035, 0.035, 2, '#678a78', root);
  // Bin: the destination of every wave. Its colliders are in the layout pieces.
  const bin = new T.Group();
  bin.position.set(layout.bin.x, layout.bin.y, layout.bin.z);
  root.add(bin);
  cyl(0, 0.305, 0, 0.167, 0.167, 0.015, '#79947a', bin);
  cyl(0, 0.313, 0, 0.145, 0.145, 0.003, '#243b2e', bin);
  for (let i = 0; i < 6; i++)
    ball(Math.sin(i * 2.4) * 0.09, 0.315, Math.cos(i * 2.4) * 0.09, 0.033, '#c6c5a3', bin);
  // Vents (air) and holes (ground), in the walls of this layout.
  for (const [x, y, z] of layout.portals.air) {
    const side = Math.abs(x) > 4;
    box(x, y, z, side ? 0.018 : 0.34, 0.24, side ? 0.34 : 0.018, '#304a43', root);
    for (let j = -2; j <= 2; j++) {
      if (side)
        box(x + (x < 0 ? 0.012 : -0.012), y + j * 0.035, z, 0.02, 0.012, 0.3, '#8c9b87', root);
      else box(x, y + j * 0.035, z + 0.012, 0.3, 0.012, 0.02, '#8c9b87', root);
    }
  }
  for (const [x, y, z] of layout.portals.ground) {
    const hole = ball(x, y + 0.035, z, 0.075, '#14231e', root);
    hole.scale.set(Math.abs(x) > 4 ? 0.12 : 1, 0.85, Math.abs(x) > 4 ? 1 : 0.12);
  }
  return {
    layout,
    root,
    colliders,
    solidObjects,
    // Removes the room from the scene; geometries are owned by this group only.
    dispose() {
      scene.remove(root);
      root.traverse((o) => o.geometry?.dispose());
    },
  };
}
