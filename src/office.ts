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
import { DecorCollision, solidTriangles } from './office-collision.ts';
import { MODEL_DATA } from './office-pack-data.js';
import type * as THREE from 'three';
import type { Rapier } from './physics-world.ts';
import type { StationGraphics } from './sortie.ts';
import type { Three } from './types.ts';
/** A layout box collider; `decor` marks a pack prop's box (rays use its triangles). */
export type OfficeCollider = THREE.Box3 & { decor?: boolean };
// Draws the active layout (see layouts.ts): floor, blocking-out volumes, the
// office pack models (walls, door, vents, bin, furniture and objects) and the
// mouse holes. Everything goes into one group so a room's plan can be replaced
// (`dispose`) without touching the rest of the scene. Colliders are exactly the
// layout solids: drawn primitives, or the hitboxes of the models.
const SKIRTING = 0.017;
export function createOffice(T: Three, scene: THREE.Scene, { box, cyl }: StationGraphics) {
  const layout = activeLayout();
  const root = new T.Group();
  scene.add(root);
  const colliders: OfficeCollider[] = [],
    solidObjects: THREE.Mesh[] = [];
  const register = (m: THREE.Mesh) => {
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
      const box: OfficeCollider = new T.Box3(
        new T.Vector3(b.min.x, b.min.y, b.min.z),
        new T.Vector3(b.max.x, b.max.y, b.max.z),
      );
      // Box of a pack prop: rays use the prop's triangles instead (office.decor).
      if (p.decor) box.decor = true;
      colliders.push(box);
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
  // Triangle colliders of the props, in a Rapier world of the decor
  // (office-collision.ts), built once Rapier is loaded. Used by the debug view for
  // now: the box colliders above remain the game's solids.
  let decor: DecorCollision | null = null,
    decorWire: Float32Array[] = [];
  return {
    layout,
    root,
    colliders,
    get decor() {
      return decor;
    },
    get decorWire() {
      return decorWire;
    },
    buildDecor(RAPIER: Rapier | null | undefined) {
      if (decor || !RAPIER) return decor;
      decor = new DecorCollision(RAPIER, MODEL_DATA, layout.props);
      decorWire = decor.solids.map((s) => solidTriangles(MODEL_DATA, s));
      return decor;
    },
    solidObjects,
    // Renders the lamps' shadows once, with the room alone (see office-lights.ts).
    bakeShadows: (renderer: THREE.WebGLRenderer | null | undefined) =>
      bakeOfficeShadows(T, renderer, root),
    // Removes the room from the scene. Pack geometries are shared: keep them.
    dispose() {
      decor?.dispose();
      decor = null;
      scene.remove(root);
      root.traverse((o) => {
        if ((o as THREE.Light).isLight) (o as THREE.Light).dispose();
        else if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
        else (o as THREE.Mesh).geometry?.dispose();
      });
    },
  };
}
