// The purgatory's decor (docs/purgatory-scene.md): an administration set on a
// cloud in a blue sky. Saint Pierre's desks, filing cabinets and plants come
// from the office pack (src/office-pack.ts) at human scale; the VIP lane keeps
// its ropes, and the guard is a Meshy model (src/vip-guard-model.ts). Signs are
// boards in the world, painted with the paper documents' colours.
// The walking rules (bounds, ropes, desks) stay in src/purgatory-queue.ts: the
// furniture stands outside the walkable rectangle or behind the counter, so the
// shared physics is unchanged.
import type * as THREE from 'three';
import type { Three } from './types.ts';
import type { Prop, OfficeModel } from './office-props.ts';
import { FACE } from './office-props.ts';
import { addOfficeProps } from './office-pack.ts';
import { WALK_WORLDS } from './scale.ts';
import { VIP_DESK, VIP_GATE_Z, VIP_GUARD, VIP_LANE } from './purgatory-queue.ts';
import {
  createCloudFloor,
  createSkyClouds,
  createSkyDome,
  SKY_LOOK,
  SUN_DIRECTION,
} from './purgatory-clouds.ts';
import type { CloudFloorSpec, SkyClouds, SkyDome } from './purgatory-clouds.ts';
import { VIP_GUARD as GUARD_RIG, VIP_GUARD_MODEL } from './vip-guard-model.ts';
import { SaintPierre } from './saint-pierre-model.ts';
import { createFloorCloud, FLOOR_MIST } from './purgatory-floor.ts';
import type { FloorCloud } from './purgatory-floor.ts';

/** Scene units per metre (souls are drawn at their real 1.8 m). */
const U = WALK_WORLDS.purgatory.sceneScale;
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
  minX: -16,
  maxX: 16,
  minZ: -11,
  maxZ: 96,
});
/** Saint Pierre's counter: three desks for the queue, one for the VIP lane. */
export const COUNTER = Object.freeze({
  z: -1.25,
  desks: [-2.06, 0, 2.06],
  vipDesk: VIP_DESK.x,
  saintZ: -2.7,
});
/** Colours chosen for this map (art direction: each map picks its own). */
export const PURGATORY_LOOK = Object.freeze({
  rope: '#9e2433',
  brass: '#d8b25a',
  zone: '#ffd979',
  zoneServed: '#d5ef73',
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
    const z = COUNTER.z;
    // His side (-Z): screen and keyboard; the visitors' side (+Z): the papers.
    P.push(put(i % 2 ? 'CRT_Monitor_Off' : 'CRT_Monitor', x + 0.35, z - 0.2, north, DESK_TOP));
    P.push(put('Keyboard', x + 0.35, z - 0.5, north, DESK_TOP));
    P.push(put(i === 3 ? 'Banker_Lamp' : 'Desk_Lamp', x - 0.75, z - 0.25, north, DESK_TOP));
    P.push(put(i % 2 ? 'Paper_Stack_Tall' : 'Paper_Tray', x - 0.5, z + 0.28, north, DESK_TOP));
    P.push(put('Stapler', x + 0.1, z + 0.32, north + 0.3, DESK_TOP));
    if (i === 1) P.push(put('Desk_Phone', x - 0.1, z - 0.3, north, DESK_TOP));
    if (i !== 1) P.push(put(i === 2 ? 'Pen_Cup' : 'Mug', x + 0.8, z + 0.1, north, DESK_TOP));
  });
  P.push(put('Paper_Stack', COUNTER.desks[1] + 0.85, COUNTER.z + 0.25, north, DESK_TOP));
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
  lounge(right, 56, west, -1);
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
/** Text painted flat on the cloud (front reads from +Z). */
function floorMark(T: Three, text: string, width: number): THREE.Mesh {
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  const texture = canvas ? new T.CanvasTexture(canvas) : new T.Texture();
  texture.colorSpace = T.SRGBColorSpace;
  if (canvas) {
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.font = `bold 76px ${cssToken('--typewriter', 'monospace')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PURGATORY_LOOK.zone;
    ctx.fillText(text, 512, 64);
  }
  const mesh = new T.Mesh(
    new T.PlaneGeometry(width, width / 8),
    new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = 'purgatoire-marquage';
  return mesh;
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
  super: boolean;
  /** x Saint Pierre walks to (the window he serves). */
  saintX: number;
  /** The local soul holds the VIP pass (the gate opens for it). */
  vip: boolean;
  deskServed: boolean;
  vipServed: boolean;
  /** Where the soul or insect Saint Pierre serves stands (he looks at it). */
  servedAt?: { x: number; z: number } | null;
  /** He is stamping an insect's papers. */
  stamping?: boolean;
}
export interface PurgatoryScene {
  scene: THREE.Scene;
  /** Camera blockers (counter, cloud floor). */
  colliders: THREE.Box3[];
  saint: THREE.Object3D;
  /** The VIP lane's guard (aimed at and clicked to buy the pass). */
  guard: THREE.Object3D;
  /** Height the queue's insects hover at (above the floor mist). */
  hover: number;
  update(dt: number, now: number, state: PurgatoryState): void;
  /** Draw the sky clouds' layer for this camera (before rendering the scene). */
  prerender(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void;
  /**
   * Draw the floor cloud over the rendered frame, stopping at the scene depth
   * (`depth`, the cartoon renderer's depth texture).
   */
  postrender(
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
    depth: THREE.Texture | null,
  ): void;
}

export function createPurgatoryScene(T: Three, options: PurgatorySceneOptions): PurgatoryScene {
  const scene = new T.Scene();
  scene.name = 'purgatoire';
  const L = PURGATORY_LOOK;
  // Sky: dome, light from the sun direction, haze far away.
  // Without shaders (software renderer) the sky is a plain colour.
  const dome: SkyDome | null = options.shaders ? createSkyDome(T, 140) : null;
  if (dome) scene.add(dome.mesh);
  scene.background = new T.Color(SKY_LOOK.normal.horizon);
  const fog = new T.Fog(SKY_LOOK.normal.fog, 60, 135);
  scene.fog = fog;
  scene.add(new T.HemisphereLight(L.hemisphereSky, L.hemisphereGround, 1.5));
  const sun = new T.DirectionalLight(L.sun, 1.9);
  sun.position.set(...(SUN_DIRECTION.map((v) => v * 30) as [number, number, number]));
  scene.add(sun);
  // The ground: a volumetric cloud drawn after the scene (souls walk half inside
  // it); without shaders, the cartoon cloud of puffs.
  let sky: SkyClouds | null = null,
    floorCloud: FloorCloud | null = null;
  if (options.shaders) {
    sky = createSkyClouds(T);
    floorCloud = createFloorCloud(T, PURGATORY_HALL, CLOUD_FLOOR);
  } else scene.add(createCloudFloor(T, CLOUD_FLOOR, PURGATORY_HALL));
  /** Height of the marks that must show above the mist (rings, painted text). */
  const markY = options.shaders ? FLOOR_MIST.top + 0.03 : 0.04;
  // Furniture of the office pack, at human scale.
  const furniture = new T.Group();
  furniture.name = 'purgatoire-mobilier';
  furniture.scale.setScalar(U);
  addOfficeProps(T, purgatoryProps(), furniture);
  scene.add(furniture);
  // Signs: the counter's front plate, swapped for Super Saint-Pierre.
  // Name plates stand on the desks' front edge, above the mist.
  const plate = signBoard(
    T,
    ['SAINT PIERRE', 'Guichet des résurrections'],
    COUNTER.desks.length * 2.06 - 0.3,
    0.5,
  );
  plate.mesh.position.set(0, DESK_TOP, COUNTER.z + 0.46);
  scene.add(plate.mesh);
  const saintPierre = new SaintPierre(T),
    saint = saintPierre.container;
  saint.position.set(0, 0, COUNTER.saintZ);
  scene.add(saint);
  const deskZone = new T.Mesh(
    new T.RingGeometry(0.95, 1.28, 48),
    new T.MeshBasicMaterial({ color: L.zone, side: T.DoubleSide, transparent: true, opacity: 0.8 }),
  );
  deskZone.rotation.x = -Math.PI / 2;
  deskZone.position.set(0, markY, 1);
  scene.add(deskZone);
  const zoneMark = floorMark(T, 'PLACE AU GUICHET', 4);
  zoneMark.position.set(0, markY + 0.01, 2.7);
  scene.add(zoneMark);
  // VIP lane: ropes on brass posts from the physics' obstacles, its own plate,
  // a hanging sign over its desk, the guard at the gate.
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
  const vipPlate = signBoard(T, ['ACCÈS VIP'], 1.8, 0.5);
  vipPlate.mesh.position.set(VIP_DESK.x, DESK_TOP, COUNTER.z + 0.46);
  vipDecor.add(vipPlate.mesh);
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
  const vipZone = new T.Mesh(
    new T.RingGeometry(VIP_DESK.r - 0.3, VIP_DESK.r, 48),
    new T.MeshBasicMaterial({ color: L.zone, side: T.DoubleSide, transparent: true, opacity: 0.8 }),
  );
  vipZone.rotation.x = -Math.PI / 2;
  vipZone.position.set(VIP_DESK.x, markY, VIP_DESK.z);
  vipDecor.add(vipZone);
  const guard = GUARD_RIG.createRig(T);
  // Facing the lane's entrance (-X), beside the gate.
  guard.container.position.set(VIP_GUARD.x, 0, VIP_GUARD.z);
  guard.container.rotation.y = -Math.PI / 2;
  guard.mesh.castShadow = true;
  vipDecor.add(guard.container);
  let mood: 'normal' | 'super' = 'normal';
  return {
    scene,
    colliders: [
      new T.Box3(
        new T.Vector3(-3.2, 0, COUNTER.z - 0.55),
        new T.Vector3(6.3, 1.05, COUNTER.z + 0.55),
      ),
      new T.Box3(new T.Vector3(-100, -0.3, -100), new T.Vector3(100, -0.05, 200)),
    ],
    saint,
    guard: guard.container,
    hover: options.shaders ? FLOOR_MIST.top * 0.75 : 0,
    update(dt, now, state) {
      const next = state.super ? 'super' : 'normal';
      if (next !== mood) {
        mood = next;
        dome?.setMood(mood);
        fog.color.set(SKY_LOOK[mood].fog);
        (scene.background as THREE.Color).set(SKY_LOOK[mood].horizon);
        sky?.setMood(mood);
        floorCloud?.setMood(mood);
        plate.setLines(
          state.super
            ? ['SUPER SAINT-PIERRE', 'Direction des récidives']
            : ['SAINT PIERRE', 'Guichet des résurrections'],
        );
      }
      saint.scale.setScalar(state.super ? 1.4 : 1);
      const before = saint.position.x;
      saint.position.x += (state.saintX - saint.position.x) * (1 - Math.exp(-3 * dt));
      const at = state.servedAt;
      saintPierre.update(dt, now / 1000, {
        speed: dt > 0 ? Math.abs(saint.position.x - before) / dt : 0,
        // Model facing +Z: a yaw toward the served soul, from where he stands.
        look: at ? Math.atan2(at.x - saint.position.x, at.z - saint.position.z) : 0,
        stamping: !!state.stamping,
      });
      vipDecor.visible = !state.super;
      // The rope gate swings aside for this soul once its pass is paid.
      if (vipGate) vipGate.visible = !state.vip;
      deskZone.material.color.set(state.deskServed ? L.zoneServed : L.zone);
      vipZone.material.color.set(state.vipServed ? L.zoneServed : L.zone);
      guard.pose(now / 1000 / VIP_GUARD_MODEL.cycle);
      sky?.update(now / 1000);
    },
    postrender(renderer, camera, depth) {
      floorCloud?.render(renderer, camera, depth);
    },
    prerender(renderer, camera) {
      if (!sky || !dome) return;
      const layer = sky.render(renderer, camera);
      dome.setClouds(layer.texture, layer.width, layer.height);
    },
  };
}
