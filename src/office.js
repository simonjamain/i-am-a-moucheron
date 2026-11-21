import { applyShadowPreset } from './shadow-settings.ts';
import { activeLayout, layoutPieces, pieceBounds, LAYOUT_ROOM } from './layouts.ts';
import { addOfficeProps } from './office-pack.ts';
// Draws the active layout (see layouts.ts): floor, blocking-out volumes, the
// office pack models (walls, door, vents, bin, furniture and objects) and the
// mouse holes. Everything goes into one group so a room's plan can be replaced
// (`dispose`) without touching the rest of the scene. Colliders are exactly the
// layout solids: drawn primitives, or the hitboxes of the models.
const SKIRTING = 0.017;
export function createOffice(T, scene, { box, cyl }) {
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
    if (p.visible === false) {
      const b = pieceBounds(p);
      colliders.push(
        new T.Box3(
          new T.Vector3(b.min.x, b.min.y, b.min.z),
          new T.Vector3(b.max.x, b.max.y, b.max.z),
        ),
      );
      continue;
    }
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
  // Pack models are instanced per model: their colliders are the layout solids above.
  addOfficeProps(T, layout.props, root);
  // Mouse holes: dark arches on the skirting board, at the foot of the wall.
  const arch = new T.Shape();
  arch.moveTo(-0.075, 0);
  arch.lineTo(-0.075, 0.045);
  arch.absarc(0, 0.045, 0.075, Math.PI, 0, true);
  arch.lineTo(0.075, 0);
  arch.closePath();
  const holeGeometry = new T.ShapeGeometry(arch, 12);
  const holeMaterial = new T.MeshBasicMaterial({ color: '#14231e' });
  const { x: X, z: Z } = LAYOUT_ROOM;
  for (const [x, , z] of layout.portals.ground) {
    const hole = new T.Mesh(holeGeometry, holeMaterial);
    hole.name = 'mouse-hole';
    hole.userData.projectileSolid = false;
    const face = SKIRTING + 0.001;
    if (Math.abs(x) > X - 0.2) {
      hole.position.set(Math.sign(x) * (X - face), 0, z);
      hole.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    } else hole.position.set(x, 0, -Z + face);
    root.add(hole);
  }
  return {
    layout,
    root,
    colliders,
    solidObjects,
    // Removes the room from the scene. Pack geometries are shared: keep them.
    dispose() {
      scene.remove(root);
      root.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
        else o.geometry?.dispose();
      });
    },
  };
}
