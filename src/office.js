import {
  officeLamps,
  addOfficeLights,
  lightRoom,
  bakeOfficeShadows,
  LAMP_LOOK,
} from './office-lights.ts';
import { activeLayout, layoutPieces, pieceBounds, LAYOUT_ROOM } from './layouts.ts';
import { addOfficeProps } from './office-pack.ts';
import { ROD } from './office-props.ts';
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
  // Sky and sun belong to the scene (set for this plan); lamps belong to the plan.
  const lamps = officeLamps(layout.props);
  lightRoom(
    T,
    scene,
    lamps.some((l) => l.kind === 'fan'),
  );
  addOfficeLights(T, lamps, root);
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
  // Hanging models: a thin rod from their hanging point up into the clouds.
  for (const p of layout.props)
    if (p.model === 'Ceiling_Fan')
      cyl(
        p.x,
        p.y + ROD / 2,
        p.z,
        0.008,
        0.008,
        ROD,
        LAMP_LOOK.rod,
        root,
      ).userData.projectileSolid = false;
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
    // Renders the lamps' shadows once, with the room alone (see office-lights.ts).
    bakeShadows: (renderer) => bakeOfficeShadows(T, renderer, root),
    // Removes the room from the scene. Pack geometries are shared: keep them.
    dispose() {
      scene.remove(root);
      root.traverse((o) => {
        if (o.isLight) o.dispose();
        else if (o.isInstancedMesh) o.dispose();
        else o.geometry?.dispose();
      });
    },
  };
}
