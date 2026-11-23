// The purgatory's decor (docs/purgatory-scene.md): an administration set on a
// cloud in a blue sky. Saint Pierre's desks, filing cabinets and plants come
// from the office pack (src/office-pack.ts) at human scale; the VIP lane keeps
// its ropes, and the guard is a Meshy model (src/vip-guard-model.ts). Signs are
// boards in the world, painted with the paper documents' colours.
// The walking rules (bounds, ropes, desks) stay in src/purgatory-queue.ts: the
// furniture stands outside the walkable rectangle or behind the counter, so the
// shared physics is unchanged.
import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';
import type { Prop, OfficeModel } from './office-props.ts';
import { FACE } from './office-props.ts';
import { addOfficeProps } from './office-pack.ts';
import { HUMANOID_UNITS, MAP, PERSON_HEIGHT } from './scale.ts';
import { PURGATORY_FRAME } from './arena-frame.ts';
import { PURGATORY_CLOUD, SKY_FLOOR, purgatorySolids } from './sky-passage.ts';
import { CLIPBOARD_AT, VIP_DESK, VIP_GATE_Z, VIP_GUARD, VIP_LANE } from './purgatory-queue.ts';
import {
  createCloudFloor,
  createSkyClouds,
  createSkyDome,
  createSkyFog,
  SKY_LOOK,
  SUN_DIRECTION,
} from './purgatory-clouds.ts';
import type { CloudFloorSpec, SkyClouds, SkyDome } from './purgatory-clouds.ts';
import { VIP_GUARD as GUARD_RIG, VIP_GUARD_MODEL } from './vip-guard-model.ts';
import { SaintPierre } from './saint-pierre-model.ts';
import { createClipboard } from './clipboard-model.ts';
import { createFloorCloud, FLOOR_MIST } from './purgatory-floor.ts';
import type { FloorCloud } from './purgatory-floor.ts';

/**
 * Local units per metre: the decor is built in the purgatory arena's units (a
 * 1.8 m person is 2.46 units tall), then placed in the world (office metres) by
 * its root group, at PURGATORY_FRAME (src/arena-frame.ts).
 */
const U = HUMANOID_UNITS / PERSON_HEIGHT;
/** The clipboards lie a little larger than the model's real size, to be seen and clicked. */
export const CLIPBOARD_SCALE = 1.1;
/** The flat part of the cloud: the walkable rectangle of src/purgatory-queue.ts
 * (x ±10, z from 0) and the back office behind the counter. */
export const PURGATORY_HALL: CloudFloorSpec = Object.freeze({
  minX: -10,
  maxX: 10,
  minZ: -8,
  maxZ: 90,
});
/** The cloud: wider than the hall, so its edge is never reached. */
export const CLOUD_FLOOR: CloudFloorSpec = Object.freeze({
  minX: PURGATORY_CLOUD.minX,
  maxX: PURGATORY_CLOUD.maxX,
  minZ: PURGATORY_CLOUD.minZ,
  maxZ: PURGATORY_CLOUD.maxZ,
});
/** Saint Pierre's counter: three desks for the queue, one for the VIP lane. */
export const COUNTER = Object.freeze({
  z: -1.25,
  desks: [-2.06, 0, 2.06],
  vipDesk: VIP_DESK.x,
  saintZ: -2.7,
  /** Clipboard at each window: offset from the desk's middle, overhanging its front edge. */
  clipboardX: CLIPBOARD_AT.dx,
  clipboardZ: CLIPBOARD_AT.z,
  clipboardYaw: -0.18,
});
/** Colours chosen for this map (art direction: each map picks its own). */
export const PURGATORY_LOOK = Object.freeze({
  rope: '#9e2433',
  brass: '#d8b25a',
  board: '#6b5136',
  hemisphereSky: '#dcecff',
  hemisphereGround: '#f4efe2',
  sun: '#fff4dc',
});

/** One office pack prop, given in scene units (feet at y, yaw by facing). */
function put(model: OfficeModel, x: number, z: number, yaw: number, y = 0): Prop {
  return { model, x: x / U, y: y / U, z: z / U, yaw };
}
const DESK_TOP = 0.74 * U;
/**
 * Every office pack prop of the purgatory (scene units before the group's
 * metre scale). Pure, tested: nothing stands in the walkable hall except the
 * counter behind its edge.
 */
export function purgatoryProps(): Prop[] {
  const P: Prop[] = [];
  const { north, south, east, west } = FACE;
  // The counter: desks face Saint Pierre (their front, +X, toward -Z).
  const desks = [...COUNTER.desks, COUNTER.vipDesk];
  desks.forEach((x, i) => {
    P.push(put('Desk', x, COUNTER.z, north));
    // Saint Pierre's own desk stays bare: only the clipboard lies on it.
    if (x === 0) return;
    const z = COUNTER.z;
    // His side (-Z): screen and keyboard; the visitors' side (+Z): the papers.
    P.push(put(i % 2 ? 'CRT_Monitor_Off' : 'CRT_Monitor', x + 0.35, z - 0.2, north, DESK_TOP));
    P.push(put('Keyboard', x + 0.35, z - 0.5, north, DESK_TOP));
    P.push(put(i === 3 ? 'Banker_Lamp' : 'Desk_Lamp', x - 0.75, z - 0.25, north, DESK_TOP));
    P.push(put(i % 2 ? 'Paper_Stack_Tall' : 'Paper_Tray', x - 0.5, z + 0.28, north, DESK_TOP));
    P.push(put('Stapler', x + 0.1, z + 0.32, north + 0.3, DESK_TOP));
    P.push(put(i === 2 ? 'Pen_Cup' : 'Mug', x + 0.8, z + 0.1, north, DESK_TOP));
  });
  // Behind Saint Pierre: office equipment only, kept sober.
  P.push(put('Whiteboard', 0, -5.4, south));
  for (const x of [-6.2, -5.2]) P.push(put('Filing_Cabinet', x, -4.6, south));
  P.push(put('Photocopier', 4.8, -4.4, south));
  P.push(put('Filing_Cabinet', 8.2, -4.6, south));
  // Along the queue, just beyond the walkable rectangle: only what tells of a
  // waiting room (sofas, low tables, water fountains, visitor chairs). They
  // also show where the invisible wall stands. Left side faces +X, right -X.
  const left = PURGATORY_HALL.minX - 1.5,
    right = PURGATORY_HALL.maxX + 1.5;
  const lounge = (x: number, z: number, facing: number, side: number) => {
    P.push(put('Sofa_Grey', x - side * 0.6, z, facing));
    P.push(put('Coffee_Table', x + side * 0.9, z, facing));
    P.push(put('Paper_Stack_Small', x + side * 0.9, z - 0.2, facing + 0.5, 0.434 * U));
  };
  lounge(left, 20, east, 1);
  // The right one by the souls' entrance (SOUL_ENTRANCE), on the VIP side.
  lounge(right, 14, west, -1);
  P.push(put('Water_Cooler', left, 15, east));
  P.push(put('Water_Cooler', right, 40, west));
  for (const z of [32, 33.2, 34.4]) P.push(put('Visitor_Chair_Grey', right, z, west));
  for (const z of [46, 47.2, 48.4]) P.push(put('Visitor_Chair_Grey', left, z, east));
  return P;
}

// ------------------------------------------------------------------ signs
function cssToken(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
/** A board with lines of typed text, front toward +Z, centred at its base. */
function signBoard(
  T: Three,
  lines: readonly string[],
  width: number,
  height: number,
): { mesh: THREE.Mesh; setLines(l: readonly string[]): void } {
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  const texture = canvas ? new T.CanvasTexture(canvas) : new T.Texture();
  texture.colorSpace = T.SRGBColorSpace;
  const draw = (text: readonly string[]) => {
    if (!canvas) return;
    canvas.width = 1024;
    canvas.height = Math.round((1024 * height) / width);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = cssToken('--paper', '#f7f1e1');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = cssToken('--paper-line', '#c9bfa4');
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
    ctx.fillStyle = cssToken('--ink', '#1b1510');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const font = cssToken('--typewriter', "'Courier New', monospace");
    const size = Math.min(canvas.height / (text.length + 0.6), 96);
    text.forEach((line, i) => {
      const s = i === 0 ? size : size * 0.62;
      ctx.font = `bold ${Math.round(s)}px ${font}`;
      let w = ctx.measureText(line).width;
      if (w > canvas.width - 60)
        ctx.font = `bold ${Math.round((s * (canvas.width - 60)) / w)}px ${font}`;
      w = 0;
      ctx.fillText(line, canvas.width / 2, ((i + 0.5) / text.length) * canvas.height + w);
    });
    texture.needsUpdate = true;
  };
  draw(lines);
  const face = new T.MeshStandardMaterial({ map: texture, roughness: 0.9 });
  const edge = new T.MeshStandardMaterial({ color: PURGATORY_LOOK.board, roughness: 0.8 });
  const geometry = new T.BoxGeometry(width, height, 0.05);
  geometry.translate(0, height / 2, 0);
  // Box faces: +X, -X, +Y, -Y, +Z (front), -Z.
  const mesh = new T.Mesh(geometry, [edge, edge, edge, edge, face, edge]);
  mesh.name = 'purgatoire-panneau';
  mesh.castShadow = true;
  return { mesh, setLines: draw };
}
export interface PurgatorySceneOptions {
  /** graphics.pm: a coloured box (parent, w, h, d, colour, x, y, z). */
  box(
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    color: string,
    x: number,
    y: number,
    z: number,
  ): THREE.Mesh;
  /** False for the software renderer: no shader clouds. */
  shaders: boolean;
}
export interface PurgatoryState {
  /** x Saint Pierre walks to (the window he serves). */
  saintX: number;
  /** The local soul holds the VIP pass (the gate opens for it). */
  vip: boolean;
  /** Where the soul or insect Saint Pierre serves stands (he looks at it). */
  servedAt?: { x: number; z: number } | null;
  /** He is stamping an insect's papers. */
  stamping?: boolean;
  /**
   * Killed (docs/purgatory-sky.md): Saint Pierre or the guard then walks the queue
   * as a soul, at this arena point, instead of standing at his post.
   */
  saintSoul?: { x: number; z: number; face?: number } | null;
  guardSoul?: { x: number; z: number; face?: number } | null;
}
export interface PurgatoryScene {
  /** A scene holding `place` alone (tests, review pages); the game moves `place` into its world. */
  scene: THREE.Scene;
  /** Everything of the purgatory, in world coordinates: sky dome and decor. */
  place: THREE.Group;
  /** The sky's look, for the world scene while the camera is in the sky. */
  /** The sky's look; `fogNode` (WebGPU) also melts what lies under the sky floor. */
  look: { background: THREE.Color; fog: THREE.Fog; fogNode: THREE.Node | null };
  /** The decor's group: local units (arena units), placed at PURGATORY_FRAME. */
  root: THREE.Group;
  /** World boxes: the counter and the cloud's walkable floor (walker, camera). */
  colliders: THREE.Box3[];
  saint: THREE.Object3D;
  /** The VIP lane's guard (aimed at and clicked to buy the pass). */
  guard: THREE.Object3D;
  /** The clipboards of the two windows (aimed at and clicked to open the papers). */
  clipboards: { desk: THREE.Object3D; vip: THREE.Object3D };
  /** World height the queue's insects hover at (above the floor mist). */
  hover: number;
  update(dt: number, now: number, state: PurgatoryState): void;
  /** Draw the sky clouds' layer for this camera (before rendering the scene). */
  prerender(renderer: THREE.WebGPURenderer, camera: THREE.Camera): void;
  /**
   * Draw the floor cloud over the rendered frame, stopping at the scene depth
   * (`depth`, the cartoon renderer's depth texture).
   */
  postrender(
    renderer: THREE.WebGPURenderer,
    camera: THREE.Camera,
    depth: THREE.Texture | null,
  ): void;
}

export function createPurgatoryScene(T: Three, options: PurgatorySceneOptions): PurgatoryScene {
  const world = new T.Scene();
  world.name = 'purgatoire';
  const place = new T.Group();
  place.name = 'purgatoire-lieu';
  world.add(place);
  const F = PURGATORY_FRAME,
    unit = F.unit;
  // Everything below is built in local (arena) units inside this group.
  const scene = new T.Group();
  scene.name = 'purgatoire-repere';
  scene.position.set(F.originX, F.originY, F.originZ);
  scene.scale.setScalar(unit);
  place.add(scene);
  const L = PURGATORY_LOOK;
  // Sky: dome, light from the sun direction, haze far away (world distances).
  // Without shaders (software renderer) the sky is a plain colour.
  const dome: SkyDome | null = options.shaders ? createSkyDome(T, 140 * unit) : null;
  if (dome) place.add(dome.mesh);
  // The sky's haze: far enough to see Saint Pierre's cloud from the sky floor (150 m
  // below it) and aircraft around, near enough to melt what lies far away.
  const look = {
    background: new T.Color(SKY_LOOK.horizon),
    fog: new T.Fog(SKY_LOOK.fog, MAP.metres(400), MAP.metres(2500)),
    fogNode: options.shaders
      ? (createSkyFog(
          T,
          MAP.metres(400),
          MAP.metres(2500),
          SKY_FLOOR,
          MAP.metres(30),
        ) as THREE.Node)
      : null,
  };
  world.background = look.background;
  world.fog = look.fog;
  world.fogNode = look.fogNode;
  scene.add(new T.HemisphereLight(L.hemisphereSky, L.hemisphereGround, 1.5));
  const sun = new T.DirectionalLight(L.sun, 1.9);
  sun.position.set(...(SUN_DIRECTION.map((v) => v * 30) as [number, number, number]));
  scene.add(sun, sun.target);
  // The ground: a volumetric cloud drawn after the scene (souls walk half inside
  // it); without shaders, the cartoon cloud of puffs.
  let sky: SkyClouds | null = null,
    floorCloud: FloorCloud | null = null;
  if (options.shaders) {
    sky = createSkyClouds(T);
    // The clouds' own layer scene: the same placement as the decor.
    sky.group.position.set(F.originX, F.originY, F.originZ);
    sky.group.scale.setScalar(unit);
    floorCloud = createFloorCloud(T, PURGATORY_HALL, CLOUD_FLOOR, F);
  } else scene.add(createCloudFloor(T, CLOUD_FLOOR, PURGATORY_HALL));
  // Furniture of the office pack, at human scale.
  const furniture = new T.Group();
  furniture.name = 'purgatoire-mobilier';
  furniture.scale.setScalar(U);
  addOfficeProps(T, purgatoryProps(), furniture);
  scene.add(furniture);
  // The clipboards that open the papers: at each serving window, turned toward
  // the souls, beside the middle and overhanging the desk's front edge a little.
  const clipboard = (x: number) => {
    const c = createClipboard(T);
    c.scale.setScalar(U * CLIPBOARD_SCALE);
    c.position.set(x + COUNTER.clipboardX, DESK_TOP, COUNTER.clipboardZ);
    c.rotation.y = COUNTER.clipboardYaw;
    return c;
  };
  const deskClipboard = clipboard(0);
  scene.add(deskClipboard);
  const saintPierre = new SaintPierre(T),
    saint = saintPierre.container;
  saint.position.set(0, 0, COUNTER.saintZ);
  scene.add(saint);
  // VIP lane: ropes on brass posts from the physics' obstacles, the guard at the
  // gate. No plate nor ring: the lane says what it is, and the window's zone is
  // invisible (src/purgatory-queue.ts, VIP_ZONE).
  const vipDecor = new T.Group();
  vipDecor.name = 'purgatoire-vip';
  scene.add(vipDecor);
  let vipGate: THREE.Mesh | null = null;
  for (const o of VIP_LANE) {
    const along = o.d > o.w,
      length = along ? o.d : o.w;
    const rope = options.box(
      vipDecor,
      along ? 0.06 : length,
      0.06,
      along ? length : 0.06,
      o.vip ? L.brass : L.rope,
      o.x,
      0.82,
      o.z,
    );
    if (o.vip) vipGate = rope;
    for (let t = -length / 2; t <= length / 2 + 0.01; t += length / Math.ceil(length / 2.4))
      options.box(
        vipDecor,
        0.12,
        0.9,
        0.12,
        L.brass,
        o.x + (along ? 0 : t),
        0.45,
        o.z + (along ? t : 0),
      );
  }
  const vipClipboard = clipboard(VIP_DESK.x);
  vipDecor.add(vipClipboard);
  // A small standing sign by the gate, on the guard's side.
  const notice = signBoard(T, ['COUPE-FILE', 'Laissez-passer auprès du vigile'], 1.3, 0.5);
  notice.mesh.position.y = 1.05;
  const stand = new T.Group();
  stand.name = 'purgatoire-pupitre';
  stand.add(notice.mesh);
  options.box(stand, 0.07, 1.1, 0.07, L.brass, 0, 0.55, -0.04);
  options.box(stand, 0.5, 0.04, 0.5, L.brass, 0, 0.02, -0.04);
  stand.position.set(VIP_GUARD.x + 0.9, 0, VIP_GATE_Z + 1.4);
  stand.rotation.y = -0.35;
  vipDecor.add(stand);
  const guard = GUARD_RIG.createRig(T);
  // Facing the lane's entrance (-X), beside the gate.
  guard.container.position.set(VIP_GUARD.x, 0, VIP_GUARD.z);
  guard.container.rotation.y = -Math.PI / 2;
  guard.mesh.castShadow = true;
  vipDecor.add(guard.container);
  scene.updateMatrixWorld(true);
  return {
    scene: world,
    place,
    look,
    root: scene,
    colliders: purgatorySolids().map(
      (b) =>
        new T.Box3(
          new T.Vector3(b.min.x, b.min.y, b.min.z),
          new T.Vector3(b.max.x, b.max.y, b.max.z),
        ),
    ),
    saint,
    guard: guard.container,
    clipboards: { desk: deskClipboard, vip: vipClipboard },
    hover: F.originY + (options.shaders ? FLOOR_MIST.top * 0.75 : 0) * unit,
    update(dt, now, state) {
      const before = saint.position.clone();
      const ease = 1 - Math.exp(-12 * dt);
      if (state.saintSoul) {
        // Killed: his soul walks the queue like the others (it waits to be killed again).
        saint.position.x += (state.saintSoul.x - saint.position.x) * ease;
        saint.position.z += (state.saintSoul.z - saint.position.z) * ease;
        saint.rotation.y = state.saintSoul.face ?? Math.PI;
      } else {
        saint.position.x += (state.saintX - saint.position.x) * (1 - Math.exp(-3 * dt));
        saint.position.z = COUNTER.saintZ;
        saint.rotation.y = 0;
      }
      const at = state.saintSoul ? null : state.servedAt;
      saintPierre.update(dt, now / 1000, {
        speed: dt > 0 ? before.distanceTo(saint.position) / dt : 0,
        // Model facing +Z: a yaw toward the served soul, from where he stands.
        look: at ? Math.atan2(at.x - saint.position.x, at.z - saint.position.z) : 0,
        stamping: !!state.stamping && !state.saintSoul,
      });
      if (state.guardSoul) {
        guard.container.position.set(state.guardSoul.x, 0, state.guardSoul.z);
        guard.container.rotation.y = state.guardSoul.face ?? Math.PI;
      } else {
        guard.container.position.set(VIP_GUARD.x, 0, VIP_GUARD.z);
        guard.container.rotation.y = -Math.PI / 2;
      }
      // The rope gate swings aside for this soul once its pass is paid.
      if (vipGate) vipGate.visible = !state.vip;
      guard.pose(now / 1000 / VIP_GUARD_MODEL.cycle);
      sky?.update(now / 1000);
    },
    postrender(renderer, camera, depth) {
      floorCloud?.render(renderer, camera, depth);
    },
    prerender(renderer, camera) {
      // Follow the camera now (a matrix updated in onBeforeRender lags one frame).
      camera.updateMatrixWorld();
      const eye = new T.Vector3().setFromMatrixPosition(camera.matrixWorld);
      if (dome) {
        dome.mesh.position.copy(eye);
        dome.mesh.updateMatrixWorld();
      }
      if (!sky || !dome) return;
      const layer = sky.render(renderer, camera);
      dome.setClouds(layer.texture, layer.width, layer.height);
    },
  };
}
