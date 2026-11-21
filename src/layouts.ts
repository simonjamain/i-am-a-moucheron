// Office layouts ("plans"): pure data, no Three.js. A room owns one plan for its
// whole life; the server activates it before handling that room and the client
// when it joins. Every geometry consumer (scene, colliders, routes, ground flow,
// spawn) derives from the active layout, never from constants.
import { ACTOR_UNIT, MAP } from './scale.ts';
import type { Collider } from './oriented-collider.ts';
import type { Vec2, Vec3 } from './types.ts';
import {
  FACE,
  modelTop,
  propColliders,
  propFootprint,
  type Facing,
  type OfficeModel,
  type Prop,
} from './office-props.ts';

export const FLOOR_Y = 0.00005;
/** Height of the office pack's walls (one 1.2 m module is 2.7 m high). */
export const WALL_HEIGHT = 2.7;
/** Inner faces of the walls: x = ±x, z = −z (the room has no front wall). */
export const LAYOUT_ROOM = Object.freeze({ x: 4.2, z: 3.6, wall: WALL_HEIGHT });
export const LAYOUT_BOUNDS = Object.freeze({ x: 4.15, z: 3.55, ceiling: 3.95 });
/** Size and look of one furniture kind. */
export interface FurnitureKindSpec {
  h: number;
  color: string;
  solid?: boolean;
}
// Kinds: size and look of each furniture volume. `solid: false` never blocks.
const FURNITURE_KIND_TABLE = {
  desk: { h: 0.9, color: '#c7b38e' },
  shelf: { h: 1.2, color: '#a99a72' },
  cloison: { h: 0.9, color: '#9fb6c1' },
  paravent: { h: 1.6, color: '#5b6a78' },
  skirt: { h: 0.86, color: '#77917d' },
  wall: { h: 3.9, color: '#a9b3a4' },
  box: { h: 0.5, color: '#b88f5a' },
  copier: { h: 1, color: '#aab2b8' },
  fountain: { h: 1.2, color: '#8fb7d0' },
  plant: { h: 0.9, color: '#5f9a5f' },
} satisfies Record<string, FurnitureKindSpec>;
export type FurnitureKind = keyof typeof FURNITURE_KIND_TABLE;
export const FURNITURE_KINDS: Readonly<Record<FurnitureKind, FurnitureKindSpec>> =
  Object.freeze(FURNITURE_KIND_TABLE);
/** One furniture volume, centred at (x, z), w × d on the floor. */
export interface Furniture {
  kind: FurnitureKind;
  x: number;
  z: number;
  w: number;
  d: number;
  label: string;
  /** Footprint of a model (drawn and collided as a prop, not as a box). */
  prop?: true;
}
/** A model placed by a layout; `kind` and `label` list it as furniture (thumbnail). */
export interface PropSpec extends Prop {
  kind?: FurnitureKind;
  label?: string;
}
/**
 * Places a model of the office pack at (x, z), its front turned toward `facing`
 * (or by a yaw in radians), optionally raised to `y` (on a desk, on a wall).
 */
export const put = (
  model: OfficeModel,
  x: number,
  z: number,
  facing: Facing | number = 'east',
  extra: { y?: number; kind?: FurnitureKind; label?: string } = {},
): PropSpec => ({
  model,
  x,
  y: extra.y ?? 0,
  z,
  yaw: typeof facing === 'number' ? facing : FACE[facing],
  ...(extra.kind ? { kind: extra.kind, label: extra.label ?? '' } : {}),
});
/** Height of a desk top (Desk, Desk_L, Meeting_Table, Break_Table). */
export const DESK_TOP = 0.74;
/** Top of an archive box (File_Box), where another one is stacked. */
const BOX_TOP = modelTop('File_Box');
/**
 * Places a model relative to another prop (a desk): `u` along its front (+X),
 * `v` along its width (+Z), `turn` added to its yaw; on its top when `top` is set.
 */
export function onProp(
  base: Prop,
  model: OfficeModel,
  u: number,
  v: number,
  turn = 0,
  top: number | null = DESK_TOP,
): PropSpec {
  const c = Math.cos(base.yaw),
    s = Math.sin(base.yaw);
  return {
    model,
    x: base.x + c * u + s * v,
    y: base.y + (top ?? 0),
    z: base.z - s * u + c * v,
    yaw: base.yaw + turn,
  };
}
/** Same as onProp, on the floor next to the prop (chairs, towers, bins). */
export const besideProp = (base: Prop, model: OfficeModel, u: number, v: number, turn = 0) =>
  onProp(base, model, u, v, turn, null);
/** Wall-mounted model: its back on the inner face of a wall, `y` above the floor. */
export function onWall(
  model: OfficeModel,
  wall: 'left' | 'right' | 'back',
  at: number,
  y: number,
  off = 0,
): PropSpec {
  const { x: X, z: Z } = LAYOUT_ROOM;
  if (wall === 'back') return put(model, at, -Z + off, 'south', { y });
  return wall === 'left'
    ? put(model, -X + off, at, 'east', { y })
    : put(model, X - off, at, 'west', { y });
}
/** Height of the hanging point of ceiling fans: blades just below 2 m. */
export const FAN_TOP = 2.34;
/** Model hanging from a rod that rises into the clouds (see office-props.ts). */
export const hanging = (model: OfficeModel, x: number, z: number, top = FAN_TOP): PropSpec =>
  put(model, x, z, 'east', { y: top });
/** Wall holding the door, and the centre of its module along that wall. */
export interface DoorSpec {
  wall: 'left' | 'right' | 'back';
  at: number;
}
const furn = (
  kind: FurnitureKind,
  x: number,
  z: number,
  w: number,
  d: number,
  label = '',
): Furniture => ({
  kind,
  x,
  z,
  w,
  d,
  label,
});
/** Ellipse [cx, cz, rx, rz] that flyers lap before heading for the bin. */
export type Circuit = [cx: number, cz: number, rx: number, rz: number];
/** Hand-made aerial waypoint [x, z] with an optional height. */
export type AirPathPoint = [x: number, z: number, y?: number];
/** Hand-written plan, expanded by buildLayout. */
interface LayoutSpec {
  id: string;
  name: string;
  summary: string;
  circuit?: Circuit;
  bin: { x: number; z: number; y?: number };
  goal: Vec2;
  finish?: Vec3[];
  spawn: Vec2;
  yaw?: number;
  ground: Vec2[];
  air: Vec3[];
  airPaths: AirPathPoint[][];
  /** Plain coloured volumes (blocking-out); models go in `props`. */
  furniture?: Furniture[];
  props?: PropSpec[];
  door?: DoorSpec;
  /** Back-wall modules (0 = left) that are windows; default: every module without a vent. */
  windows?: number[];
  hidden?: Vec2[];
  passages?: Vec2[];
}
/** Player base frame of a layout (office metres). */
export interface LayoutBase {
  originX: number;
  originZ: number;
  deckY: number;
  parkedY: number;
  departureY: number;
  yaw: number;
  refuelOffsetX: number;
  refuelOffsetZ: number;
  speed: number;
}
/** An expanded office plan: geometry, routes and base. */
export interface OfficeLayout {
  id: string;
  name: string;
  summary: string;
  bounds: typeof LAYOUT_BOUNDS;
  bin: { x: number; y: number; z: number };
  groundGoal: Vec2;
  groundFinish: Vec3[];
  base: LayoutBase;
  portals: { ground: Vec3[]; air: Vec3[] };
  airRoutes: Vec3[][];
  /** Volumes listed on the thumbnail: blocking-out boxes and props with a kind. */
  furniture: Furniture[];
  /** Every drawn model: room shell, vents, bin and the layout's own props. */
  props: Prop[];
  /** Colliders of the room shell (wall bodies and skirting boards). */
  shellSolids: Collider[];
  hidden: Vec2[];
  passages: Vec2[];
}

// One lap of an ellipse as waypoints [x, z, y] at cruising height, starting at
// angle `from` and turning `dir` (1 or -1). Flyers take a lap before heading for
// the bin, which keeps their arrival well after the walkers'.
function lapPoints(
  cx: number,
  cz: number,
  rx: number,
  rz: number,
  from = 0,
  dir = 1,
  n = 10,
): Vec3[] {
  return Array.from({ length: n + 1 }, (_, i): Vec3 => {
    const a = from + (dir * 2 * Math.PI * i) / n;
    return [cx + rx * Math.cos(a), cz + rz * Math.sin(a), 2.0 + 0.15 * Math.sin(2 * a)];
  });
}
// Aerial course of a vent: entry, an optional circuit lap (entering it at the
// point nearest the vent), then the hand-made approach to the bin.
function airCourse(
  entry: Vec3,
  path: readonly AirPathPoint[],
  rim: number,
  bin: { x: number; z: number },
  circuit: Circuit | undefined,
  index: number,
): Vec3[] {
  const lap = circuit
    ? (([cx, cz, rx, rz]: Circuit) =>
        lapPoints(
          cx,
          cz,
          rx,
          rz,
          Math.atan2((entry[2] - cz) / rz, (entry[0] - cx) / rx),
          index % 2 ? -1 : 1,
        ))(circuit)
    : [];
  return [
    [entry[0], entry[1], entry[2]],
    ...lap.map(([x, z, y]): Vec3 => [x, y, z]),
    ...path.map(([x, z, y], i): Vec3 => [x, y ?? (i === 0 ? 2.1 : i % 2 ? 1.7 : 2.0), z]),
    [bin.x, rim, bin.z],
  ];
}
const propOf = ({ model, x, y, z, yaw }: PropSpec): Prop => ({ model, x, y, z, yaw });
function asFurniture(p: PropSpec): Furniture {
  const f = propFootprint(p);
  const w = f.max.x - f.min.x,
    d = f.max.z - f.min.z;
  return {
    kind: p.kind!,
    x: f.min.x + w / 2,
    z: f.min.z + d / 2,
    w,
    d,
    label: p.label ?? '',
    prop: true,
  };
}

// ---- room shell: wall modules of the office pack ----------------------------
// Each wall is a row of 1.2 m modules whose body face is exactly on the room
// boundary (x = ±4.2, z = −3.6). The pack's walls are 0.112 m thick with a
// 0.017 m skirting board (0.1 m high) on each side. Back-wall modules without a
// vent are windows, one module holds the closed office door, vents are flush on
// the wall face, centred on their air entry.
const WALL_BODY = 0.056,
  SKIRTING = 0.017,
  SKIRTING_H = 0.1,
  MODULE = 1.2,
  VENT_H = 0.3;
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Collider => ({
  min: { x: x0, y: y0, z: z0 },
  max: { x: x1, y: y1, z: z1 },
});
function roomShell(
  air: readonly Vec3[],
  door?: DoorSpec,
  windows?: readonly number[],
): { props: Prop[]; solids: Collider[] } {
  const { x: X, z: Z } = LAYOUT_ROOM;
  const props: Prop[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) < MODULE / 2 + 0.3;
  const vents = air.map(([x, y, z]) => ({
    wall: Math.abs(x) > X - 0.2 ? (x < 0 ? 'left' : 'right') : 'back',
    x,
    y,
    z,
  }));
  const module = (wall: DoorSpec['wall'], at: number): OfficeModel => {
    if (door && door.wall === wall && Math.abs(door.at - at) < 0.01) return 'Wall_Door';
    const along = (v: (typeof vents)[number]) => (wall === 'back' ? v.x : v.z);
    if (wall === 'back' && !vents.some((v) => v.wall === 'back' && near(along(v), at))) {
      const index = Math.round((at + X - MODULE / 2) / MODULE);
      if (!windows || windows.includes(index)) return 'Wall_Window';
    }
    return 'Wall';
  };
  for (let i = 0; i < 7; i++) {
    const at = -X + MODULE / 2 + i * MODULE;
    props.push({
      model: module('back', at),
      x: at,
      y: 0,
      z: -Z - WALL_BODY,
      yaw: FACE.south,
      ghost: true,
    });
  }
  for (let i = 0; i < 6; i++) {
    const at = -Z + MODULE / 2 + i * MODULE;
    props.push({
      model: module('left', at),
      x: -X - WALL_BODY,
      y: 0,
      z: at,
      yaw: FACE.east,
      ghost: true,
    });
    props.push({
      model: module('right', at),
      x: X + WALL_BODY,
      y: 0,
      z: at,
      yaw: FACE.west,
      ghost: true,
    });
  }
  for (const sx of [-1, 1])
    props.push({
      model: 'Wall_Corner',
      x: sx * (X + WALL_BODY),
      y: 0,
      z: -Z - WALL_BODY,
      yaw: 0,
      ghost: true,
    });
  if (door) {
    const doorProp: Prop =
      door.wall === 'back'
        ? { model: 'Office_Door', x: door.at, y: 0, z: -Z - WALL_BODY, yaw: FACE.south }
        : door.wall === 'left'
          ? { model: 'Office_Door', x: -X - WALL_BODY, y: 0, z: door.at, yaw: FACE.east }
          : { model: 'Office_Door', x: X + WALL_BODY, y: 0, z: door.at, yaw: FACE.west };
    props.push(doorProp);
  }
  for (const v of vents) {
    const y = v.y - VENT_H / 2;
    if (v.wall === 'back') props.push({ model: 'Wall_Vent', x: v.x, y, z: -Z, yaw: FACE.south });
    else if (v.wall === 'left')
      props.push({ model: 'Wall_Vent', x: -X, y, z: v.z, yaw: FACE.east });
    else props.push({ model: 'Wall_Vent', x: X, y, z: v.z, yaw: FACE.west });
  }
  const T = 2 * WALL_BODY,
    H = WALL_HEIGHT;
  const solids = [
    box(-X - T, 0, -Z - T, X + T, H, -Z),
    box(-X - T, 0, -Z, -X, H, Z),
    box(X, 0, -Z, X + T, H, Z),
    box(-X, 0, -Z, X, SKIRTING_H, -Z + SKIRTING),
    box(-X, 0, -Z + SKIRTING, -X + SKIRTING, SKIRTING_H, Z),
    box(X - SKIRTING, 0, -Z + SKIRTING, X, SKIRTING_H, Z),
  ];
  return { props, solids };
}
const LAYOUT_GROUND_Y = 0.0007;
const groundAt = (x: number, z: number): Vec3 => [x, LAYOUT_GROUND_Y, z];

function buildLayout(spec: LayoutSpec): Readonly<OfficeLayout> {
  const bin = { y: 0, ...spec.bin };
  const rim = bin.y + 0.38;
  const u = ACTOR_UNIT;
  const originX = spec.spawn[0],
    originZ = spec.spawn[1];
  const shell = roomShell(spec.air, spec.door, spec.windows);
  const binProp: Prop = { model: 'Trash_Bin', x: bin.x, y: bin.y, z: bin.z, yaw: 0 };
  const out: OfficeLayout = {
    id: spec.id,
    name: spec.name,
    summary: spec.summary,
    bounds: LAYOUT_BOUNDS,
    bin,
    groundGoal: spec.goal,
    groundFinish: spec.finish || [
      [spec.goal[0], rim, spec.goal[1]],
      [bin.x, rim, bin.z],
    ],
    base: {
      originX,
      originZ,
      deckY: FLOOR_Y,
      parkedY: FLOOR_Y + 1.05 * u,
      departureY: FLOOR_Y + 3 * u,
      yaw: spec.yaw ?? Math.PI,
      refuelOffsetX: -0.006,
      refuelOffsetZ: -5 * u - 0.04,
      speed: MAP.metres(25),
    },
    portals: { ground: spec.ground.map(([x, z]) => groundAt(x, z)), air: spec.air },
    airRoutes: spec.air.map((entry, i) =>
      airCourse(entry, spec.airPaths[i], rim, bin, spec.circuit, i),
    ),
    furniture: [
      ...(spec.furniture || []),
      ...(spec.props || []).filter((p) => p.kind).map(asFurniture),
    ],
    props: [...shell.props, binProp, ...(spec.props || []).map(propOf)],
    shellSolids: shell.solids,
    hidden: spec.hidden || [],
    passages: spec.passages || [],
  };
  return Object.freeze(out);
}

/**
 * A workstation: the desk, its screen, keyboard and mouse, the chair pulled up to
 * it (turned by `chairTurn`), then any `extras` (placed with onProp/besideProp).
 */
function station(
  desk: PropSpec,
  screen: OfficeModel,
  side: number,
  chair: OfficeModel,
  chairTurn = 0,
  extras: (d: PropSpec) => PropSpec[] = () => [],
): PropSpec[] {
  return [
    desk,
    onProp(desk, screen, -0.03, side),
    onProp(desk, 'Keyboard', 0.2, side),
    onProp(desk, 'Mouse', 0.22, side - 0.3),
    besideProp(desk, chair, 0.62 + 0.3 * Math.abs(chairTurn), side, Math.PI + chairTurn),
    ...extras(desk),
  ];
}
type StationChoice = [OfficeModel, OfficeModel, (d: PropSpec) => PropSpec[]];
/** Two desks back to back around (x, z), their length along X. */
function island(
  x: number,
  z: number,
  label: string,
  south: StationChoice,
  north: StationChoice,
): PropSpec[] {
  const a = put('Desk', x, z + 0.379, 'south', { kind: 'desk', label });
  const b = put('Desk', x, z - 0.379, 'north', { kind: 'desk', label });
  return [
    ...station(a, south[0], 0.12, south[1], 0, south[2]),
    ...station(b, north[0], -0.1, north[1], 0.3, north[2]),
  ];
}
/** A run of pack walls inside the room, along Z at `x`, from z0 (module lengths). */
function partition(x: number, z0: number, modules: (1.2 | 0.6)[]): PropSpec[] {
  const out: PropSpec[] = [];
  let z = z0;
  for (const m of modules) {
    out.push(put(m === 1.2 ? 'Wall' : 'Wall_Half', x, z + m / 2, 'east', { kind: 'wall' }));
    z += m;
  }
  return out;
}

// ---- Diagonale: a complete accounting office, every object placed by hand --
// Desks face their chair (+X of the model): pairs back to back on each island.
const DIAGONALE_PROPS: PropSpec[] = (() => {
  const P: PropSpec[] = [];
  const add = (...items: PropSpec[]) => (P.push(...items), items[0]);
  // Island A (front left) and island B (front right of the window), back to back.
  const a1 = add(put('Desk', -1.9, 1.679, 'south', { kind: 'desk', label: 'Bureau A' }));
  const a2 = add(put('Desk', -1.9, 0.921, 'north', { kind: 'desk', label: 'Bureau A' }));
  const b1 = add(put('Desk', 0.8, 1.679, 'south', { kind: 'desk', label: 'Bureau B' }));
  const b2 = add(put('Desk', 0.8, 0.921, 'north', { kind: 'desk', label: 'Bureau B' }));
  add(
    // A1: tidy, the lamp still on.
    onProp(a1, 'CRT_Monitor', -0.03, 0.12),
    onProp(a1, 'Keyboard', 0.2, 0.12),
    onProp(a1, 'Mouse', 0.22, -0.2, 0.2),
    onProp(a1, 'Desk_Lamp', -0.25, -0.62, Math.PI),
    onProp(a1, 'Mug', 0.12, 0.55, 0.9),
    onProp(a1, 'Paper_Stack', 0.15, -0.5, 0.15),
    besideProp(a1, 'Office_Chair_Blue', 0.62, 0.1, Math.PI),
    // A2: the blue screen, papers everywhere.
    onProp(a2, 'CRT_Monitor_BSOD', -0.03, -0.1),
    onProp(a2, 'Keyboard', 0.22, -0.1, 0.12),
    onProp(a2, 'Mouse', 0.2, 0.2),
    onProp(a2, 'Paper_Stack_Tall', 0.1, 0.55, 0.3),
    onProp(a2, 'Pen_Cup', -0.2, -0.55),
    onProp(a2, 'Desk_Phone', -0.2, 0.24, -0.4),
    onProp(a2, 'Mug_Dark', 0.28, -0.52),
    besideProp(a2, 'Office_Chair_Grey', 0.86, -0.25, Math.PI + 0.45),
    besideProp(a2, 'Paper_Crumpled', 0.55, 0.55),
    // B1: calendar and cactus, the tower under the desk.
    onProp(b1, 'CRT_Monitor', -0.03, -0.1),
    onProp(b1, 'Keyboard', 0.2, -0.1),
    onProp(b1, 'Mouse', 0.22, 0.2),
    onProp(b1, 'Folder_Stack', 0.05, 0.48, 0.3),
    onProp(b1, 'Desk_Calendar', -0.25, 0.62, 0.4),
    onProp(b1, 'Plant_Cactus', -0.22, -0.55),
    onProp(b1, 'Mug_Red', 0.25, -0.45, 2),
    besideProp(b1, 'Computer_Tower', -0.05, 0.5, 0),
    besideProp(b1, 'Office_Chair_Blue', 0.68, -0.05, Math.PI - 0.25),
    // B2: the fan and the paper tower.
    onProp(b2, 'CRT_Monitor_Off', -0.03, 0.15),
    onProp(b2, 'Keyboard', 0.2, 0.15),
    onProp(b2, 'Desk_Fan', -0.2, -0.6, 0.2),
    onProp(b2, 'Paper_Stack_Tall', 0.12, -0.25, -0.2),
    onProp(b2, 'Stapler', 0.3, -0.58, 0.7),
    onProp(b2, 'Mug_Yellow', 0.27, 0.55),
    onProp(b2, 'Pencil', 0.25, 0.42, 0.5),
    besideProp(b2, 'Office_Chair_Grey', 0.64, 0.15, Math.PI),
    besideProp(b2, 'Paper_Crumpled_Yellow', 0.85, -0.6),
  );
  // Archives along the back wall, the corridor behind them kept for the walkers.
  for (const x of [-3.1, -2.3, -1.5])
    add(
      put('Bookshelf', x, -2.75, 'south', { kind: 'shelf', label: x === -2.3 ? 'Archives' : '' }),
    );
  add(
    put('File_Box', -3.45, -2.35, 0.2),
    put('File_Box', -3.45, -2.35, 0.05, { y: BOX_TOP }),
    put('File_Box_Empty', -2.85, -2.22, -0.3),
    put('Paper_Crumpled_Sheet', -2.2, -2.25, 1.1),
    put('Plant_Snake_Large', -3.86, -3.25, 0.2, { kind: 'plant' }),
    put('Water_Cooler', -3.96, -1.4, 'east', { kind: 'fountain' }),
    put('Filing_Cabinet', -3.85, 1.05, 'east', { kind: 'shelf' }),
  );
  // Whiteboard and low screen in the middle; the kitchen against the back wall.
  add(
    put('Whiteboard', -0.5, -1.75, 'south', { kind: 'paravent' }),
    put('Cubicle_Panel_Half', 0.32, -1.4, 'east', { kind: 'cloison' }),
    // Coffee corner on the left wall, the vending machine against the screen.
    put('Kitchen_Counter', -3.87, 2.4, 'east', { kind: 'box', label: 'Cuisine' }),
    put('Coffee_Maker', -4.03, 2.0, 'east', { y: 0.9 }),
    put('Microwave', -3.98, 2.6, 'east', { y: 0.9 }),
    put('Mug', -3.75, 2.2, 2.5, { y: 0.9 }),
    put('Water_Bottle', -3.72, 2.88, 0, { y: 0.9 }),
    put('Vending_Machine', 3.75, 2.98, 'west', { kind: 'box', label: 'Distributeur' }),
    put('Visitor_Chair_Grey', 1.62, 2.4, 'east'),
    put('Cubicle_Panel', 1.5, -1.65, 'south', { kind: 'cloison' }),
  );
  // Right: photocopier, cardboard boxes, the corridor from the door.
  add(
    put('Photocopier', 3.8, -0.4, 'west', { kind: 'copier', label: 'Photoc.' }),
    put('Paper_Tray', 3.15, -0.9, 0.3),
    put('File_Box', 2.2, 0.2, 0, { kind: 'box', label: 'Cartons' }),
    put('File_Box', 2.62, 0.18, 0.1, { kind: 'box' }),
    put('File_Box', 2.4, 0.2, -0.15, { y: BOX_TOP }),
    put('File_Box_Empty', 2.45, 0.62, 0.5),
    put('Cubicle_Panel', 3.4, 0.6, 'east', { kind: 'cloison' }),
    put('Cubicle_Panel_Half', 3.4, 1.5, 'east', { kind: 'cloison' }),
    put('Coat_Rack', 3.92, 0.45),
  );
  // Waiting corner, front right; crumpled papers around the bin (missed shots).
  add(
    put('Sofa_Grey', 2.45, 3.15, 'north', { kind: 'box', label: 'Attente' }),
    put('Coffee_Table', 2.45, 2.4, 'north'),
    put('Paper_Stack_Small', 2.3, 2.45, 0.4, { y: 0.42 }),
    put('Plant_Tall', 1.3, 3.25, 0.3, { kind: 'plant' }),
    put('Paper_Crumpled', 3.15, -2.85),
    put('Paper_Crumpled_Pile', 3.95, -2.55, 0.7),
    put('Paper_Crumpled', 3.3, -3.35, 1),
    put('Paper_Crumpled_Yellow', 3.85, -3.4),
  );
  // On the walls.
  add(
    onWall('Wall_Clock', 'back', 0, 1.95),
    onWall('Corkboard', 'left', -0.9, 0.95),
    onWall('Wall_Calendar', 'left', 1.05, 1.55, 0.01),
    onWall('Wall_Outlet', 'left', 2.95, 1.0),
    onWall('Wall_Outlet', 'back', 0.35, 0.25),
    onWall('Fire_Extinguisher', 'right', 1.05, 0.75),
    onWall('Light_Switch', 'right', 2.5, 1.05),
  );
  // Two lit ceiling fans hanging below the clouds, inside the enemies' ring and
  // clear of their dives: obstacles for pilots, light for the islands.
  add(hanging('Ceiling_Fan', -0.7, 1.1), hanging('Ceiling_Fan', -0.85, -0.95));
  return P;
})();

export const LAYOUTS = Object.freeze([
  buildLayout({
    id: 'diagonale',
    circuit: [0, 0, 2.9, 2.25],
    name: 'Diagonale',
    summary: 'Corbeille au fond à droite, entrées à l’opposé, couloir derrière les archives.',
    bin: { x: 3.6, z: -3.05 },
    goal: [3.05, -3.05],
    spawn: [2.7, -2.15],
    ground: [
      [-4.11, 3.2],
      [-4.11, -0.4],
      [-3.0, -3.51],
    ],
    air: [
      [-4.11, 1.6, 1.8],
      [-4.11, 2.2, -1.8],
      [-4.11, 2.0, 0.3],
      [4.11, 2.0, 3.1],
    ].map(([x, y, z]) => [x, y, z]),
    airPaths: [
      [
        [-2.6, 0.4],
        [-1.0, 0.2],
        [0.4, -0.2],
        [1.8, -1.0],
        [3.4, -2.8],
      ],
      [
        [-3.0, -1.2],
        [-1.5, -0.2],
        [0.1, 0.35],
        [1.8, 0.3],
        [3.0, -1.0],
        [3.5, -2.8],
      ],
      [
        [-2.5, 1.0],
        [-0.8, 0.4],
        [1.0, 0.4],
        [2.6, -0.8],
        [3.5, -2.8],
      ],
      [
        [3.3, 1.8],
        [2.2, 0.8],
        [0.6, 0.7],
        [-0.6, -0.2],
        [1.6, -1.6],
        [3.5, -2.9],
      ],
    ],
    props: DIAGONALE_PROPS,
    door: { wall: 'right', at: 1.8 },
    windows: [0, 1, 2, 4, 5, 6],
    hidden: [
      [0.2, -2.4],
      [2.0, -2.4],
      [2.0, -1.2],
      [0.6, -0.9],
    ],
    passages: [
      [-0.55, 1.3],
      [-3.75, -0.2],
      [3.8, 0.8],
    ],
  }),
  buildLayout({
    id: 'ilots',
    circuit: [0, 0, 3.0, 2.4],
    name: 'Îlots à 360°',
    summary: 'Corbeille au centre, quatre îlots de bureaux, entrées dans les coins.',
    bin: { x: 0, z: 0 },
    goal: [0.6, 0],
    spawn: [0, 1.8],
    ground: [
      [-4.11, 3.2],
      [4.11, 3.2],
      [-4.11, -3.2],
    ],
    air: [
      [-4.11, 2.0, 0.0],
      [4.11, 2.0, 0.0],
      [-1.8, 2.3, -3.51],
      [1.8, 2.3, -3.51],
    ],
    airPaths: [
      [
        [-3.2, -0.9],
        [-1.5, -0.3],
        [-0.3, -0.2],
      ],
      [
        [3.2, 0.9],
        [1.5, 0.4],
        [0.3, 0.2],
      ],
      [
        [-0.4, -2.4],
        [-2.8, -0.2],
        [-1.2, 0.5],
        [-0.2, 0.3],
      ],
      [
        [0.4, -2.4],
        [2.8, -0.2],
        [1.2, -0.5],
        [0.2, -0.3],
      ],
    ],
    door: { wall: 'right', at: -1.8 },
    props: [
      ...island(
        -2.3,
        1.7,
        'Îlot 1',
        [
          'CRT_Monitor',
          'Office_Chair_Blue',
          (d) => [onProp(d, 'Mug', 0.15, 0.55), onProp(d, 'Desk_Lamp', -0.18, -0.5)],
        ],
        ['CRT_Monitor_Off', 'Office_Chair_Grey', (d) => [onProp(d, 'Paper_Stack', 0.05, 0.4)]],
      ),
      ...island(
        2.3,
        1.7,
        'Îlot 2',
        ['CRT_Monitor', 'Office_Chair_Grey', (d) => [onProp(d, 'Desk_Phone', -0.12, -0.45)]],
        [
          'CRT_Monitor_BSOD',
          'Office_Chair_Blue',
          (d) => [onProp(d, 'Paper_Stack_Tall', 0.1, 0.5, 0.3)],
        ],
      ),
      ...island(
        -2.3,
        -1.7,
        'Îlot 3',
        ['CRT_Monitor', 'Office_Chair_Blue', (d) => [onProp(d, 'Plant_Cactus', -0.2, -0.5)]],
        ['CRT_Monitor', 'Office_Chair_Grey', (d) => [onProp(d, 'Mug_Red', 0.25, 0.5)]],
      ),
      ...island(
        2.3,
        -1.7,
        'Îlot 4',
        [
          'CRT_Monitor_Off',
          'Office_Chair_Grey',
          (d) => [onProp(d, 'Paper_Stack_Tall', 0.05, -0.45)],
        ],
        ['CRT_Monitor', 'Office_Chair_Blue', (d) => [onProp(d, 'Desk_Fan', -0.18, 0.5)]],
      ),
      put('Cubicle_Panel', 0, -1.2, 'south', { kind: 'cloison' }),
      put('Cubicle_Panel', 0, 1.2, 'north', { kind: 'cloison' }),
      put('Cubicle_Panel', -1.2, 0, 'east', { kind: 'cloison' }),
      put('Cubicle_Panel', 1.2, 0, 'west', { kind: 'cloison' }),
      put('Photocopier', -0.5, 3.2, 'north', { kind: 'copier', label: 'Photoc.' }),
      put('Plant_Tall', 3.9, -0.9, 0.4, { kind: 'plant' }),
      put('File_Box', -3.4, 0.0, 0.1, { kind: 'box', label: 'Cartons' }),
      put('File_Box', -3.4, 0.38, -0.1, { kind: 'box' }),
      put('File_Box_Empty', -3.4, 0.19, 0.2, { y: BOX_TOP }),
      put('Paper_Crumpled', 0.35, 0.25),
      put('Paper_Crumpled_Yellow', -0.3, -0.35),
      onWall('Wall_Clock', 'left', 1.2, 1.7),
    ],
    passages: [
      [0.9, -0.9],
      [-0.9, 0.9],
      [0.9, 0.9],
      [-0.9, -0.9],
    ],
  }),
  buildLayout({
    id: 'cloison',
    circuit: [-2.1, 0.2, 1.5, 2.4],
    name: 'Cloison et porte',
    summary:
      'Une cloison pleine coupe la pièce en deux ; une seule porte, pour le sol et l’airCourse.',
    bin: { x: 3.4, z: -2.9 },
    goal: [2.85, -2.9],
    spawn: [2.6, -1.5],
    ground: [
      [-4.11, 3.0],
      [-4.11, -1.0],
      [-1.6, -3.51],
    ],
    air: [
      [-4.11, 1.6, 1.6],
      [-4.11, 2.2, -2.6],
      [-2.2, 2.3, -3.51],
      [-4.11, 2.0, 0.4],
    ],
    airPaths: [
      [
        [-2.4, 0.4],
        [-0.8, 0.2],
        [0.2, 0.2],
        [1.8, -0.6],
        [3.3, -2.6],
      ],
      [
        [-3.0, -0.6],
        [-1.5, 1.0],
        [-0.4, 0.5],
        [0.2, 0.3],
        [2.6, 0.3],
        [3.4, -2.6],
      ],
      [
        [-3.0, -2.0],
        [-1.5, -0.4],
        [-0.4, 0.3],
        [0.2, 0.3],
        [2.2, -1.2],
        [3.4, -2.7],
      ],
      [
        [-3.2, 1.0],
        [-0.4, 1.0],
        [0.2, 0.4],
        [1.8, 0.8],
        [3.4, -1.2],
        [3.4, -2.7],
      ],
    ],
    door: { wall: 'right', at: 1.8 },
    props: [
      // The full partition: two runs of pack walls, one opening in between.
      ...partition(0.2, -3.6, [1.2, 1.2, 0.6]),
      ...partition(0.2, 0.6, [0.6, 1.2, 1.2]),
      ...station(
        put('Desk', -2.4, 1.5, 'south', { kind: 'desk', label: 'Bureau A' }),
        'CRT_Monitor',
        0.1,
        'Office_Chair_Blue',
        0,
        (d) => [onProp(d, 'Mug', 0.15, 0.55), onProp(d, 'Paper_Stack', 0.05, -0.45)],
      ),
      ...station(
        put('Desk', -2.4, -1.9, 'north', { kind: 'desk', label: 'Bureau B' }),
        'CRT_Monitor_BSOD',
        -0.1,
        'Office_Chair_Grey',
        0.4,
        (d) => [onProp(d, 'Desk_Lamp', -0.18, 0.5), onProp(d, 'Pen_Cup', -0.2, -0.55)],
      ),
      put('Whiteboard', 1.3, 0.2, 'east', { kind: 'paravent' }),
      put('Photocopier', 3.3, 0.9, 'west', { kind: 'copier', label: 'Photoc.' }),
      put('Plant_Tall', 3.85, 3.25, 0.5, { kind: 'plant' }),
      put('File_Box', -3.6, -0.38, 0, { kind: 'box', label: 'Cartons' }),
      put('File_Box', -3.6, -0.02, 0.1, { kind: 'box' }),
      put('Paper_Crumpled_Pile', 3.95, -2.45, 0.4),
      onWall('Wall_Clock', 'right', -0.6, 1.8),
    ],
    hidden: [
      [0.3, -3.5],
      [2.0, -3.5],
      [2.0, -0.6],
      [0.3, -0.4],
    ],
    passages: [[0.2, 0.2]],
  }),
  buildLayout({
    id: 'fronts',
    circuit: [0, 0.2, 2.9, 2.25],
    name: 'Deux fronts',
    summary:
      'Le sol arrive par la gauche, l’airCourse par la droite ; corbeille au fond au centre.',
    bin: { x: 0, z: -3.05 },
    goal: [0, -2.5],
    spawn: [0, -2.5],
    ground: [
      [-4.11, 3.2],
      [-4.11, 2.2],
      [-4.11, 1.2],
    ],
    air: [
      [4.11, 2.0, 3.0],
      [4.11, 2.0, 2.0],
      [4.11, 2.2, 1.0],
      [4.11, 1.8, 0.2],
    ],
    airPaths: [
      [
        [3.0, 1.6],
        [1.5, 0.6],
        [0.4, -0.6],
        [0.5, -2.5],
      ],
      [
        [2.6, 0.2],
        [0.5, 1.0],
        [-0.5, -0.2],
        [-0.3, -2.5],
      ],
      [
        [1.8, 2.2],
        [-1.5, 2.2],
        [-1.0, 0.2],
        [-0.2, -2.7],
      ],
      [
        [0.4, 2.4],
        [2.4, 0.9],
        [0.9, -0.6],
        [0.2, -2.7],
      ],
    ],
    door: { wall: 'back', at: -2.4 },
    props: [
      ...station(
        put('Desk', -2.6, -1.3, 'south', { kind: 'desk', label: 'Bureau G' }),
        'CRT_Monitor',
        0.1,
        'Office_Chair_Blue',
        0,
        (d) => [onProp(d, 'Desk_Phone', -0.12, -0.45), onProp(d, 'Mug_Yellow', 0.25, 0.55)],
      ),
      ...station(
        put('Desk', 2.6, -1.3, 'south', { kind: 'desk', label: 'Bureau D' }),
        'CRT_Monitor_Off',
        -0.1,
        'Office_Chair_Grey',
        -0.3,
        (d) => [onProp(d, 'Folder_Stack', 0.05, 0.45), onProp(d, 'Desk_Lamp_Red', -0.18, -0.5)],
      ),
      put('Cubicle_Panel', -0.3, -1.7, 'south', { kind: 'paravent' }),
      put('Cubicle_Panel_Half', 0.6, -1.7, 'south', { kind: 'paravent' }),
      put('Cubicle_Panel', -1.4, 1.4, 'south', { kind: 'cloison' }),
      put('Cubicle_Panel', 1.4, 1.4, 'south', { kind: 'cloison' }),
      put('Plant_Snake_Large', 3.84, -3.24, 0, { kind: 'plant' }),
      put('Water_Cooler', -3.96, -3.2, 'east', { kind: 'fountain' }),
      put('File_Box', 3.0, 0.2, 0, { kind: 'box', label: 'Cartons' }),
      put('File_Box', 3.42, 0.2, 0.1, { kind: 'box' }),
      put('File_Box', 3.2, 0.2, -0.1, { y: BOX_TOP }),
      put('Photocopier', -3.3, 0.2, 'east', { kind: 'copier', label: 'Photoc.' }),
      put('Paper_Crumpled', 0.4, -2.7),
      onWall('Wall_Clock', 'left', -1.2, 1.8),
    ],
    hidden: [
      [-0.8, -2.9],
      [0.8, -2.9],
      [0.8, -1.75],
      [-0.8, -1.75],
    ],
    passages: [
      [-1.2, -1.7],
      [1.2, -1.7],
    ],
  }),
  buildLayout({
    id: 'archives',
    circuit: [0, 0, 2.9, 2.25],
    name: 'Archives en serpentin',
    summary:
      'Trois rayonnages en quinconce : le sol serpente, trois entrées de longueurs différentes.',
    bin: { x: 3.6, z: -3.05 },
    goal: [3.05, -3.05],
    spawn: [2.7, -2.2],
    ground: [
      [-4.11, 3.2],
      [-4.11, 1.5],
      [-4.11, -0.3],
    ],
    air: [
      [-4.11, 2.0, 2.0],
      [-4.11, 2.2, 0.4],
      [-3.0, 2.3, -3.51],
      [4.11, 2.0, 3.2],
    ],
    airPaths: [
      [
        [-2.5, 1.5],
        [-1.0, -0.3],
        [1.2, 0.1],
        [3.0, -0.9],
        [3.5, -2.8],
      ],
      [
        [-2.8, 1.6],
        [-0.3, 1.4],
        [1.5, 1.5],
        [2.8, -0.3],
        [3.5, -2.8],
      ],
      [
        [-2.0, -1.0],
        [-1.8, 0.1],
        [-0.2, -0.5],
        [2.0, -1.5],
        [3.5, -2.9],
      ],
      [
        [2.0, 2.8],
        [-3.2, 2.0],
        [-3.0, -0.5],
        [0.0, -2.3],
        [2.4, -2.9],
        [3.5, -3.0],
      ],
    ],
    door: { wall: 'right', at: -0.6 },
    props: [
      put('Bookshelf', -3.78, 2.4, 'south', { kind: 'shelf' }),
      put('Bookshelf', -2.98, 2.4, 'south', { kind: 'shelf' }),
      put('Bookshelf', -2.18, 2.4, 'south', { kind: 'shelf', label: 'Rayonnage 1' }),
      put('Bookshelf', -1.38, 2.4, 'south', { kind: 'shelf' }),
      put('Bookshelf', -0.58, 2.4, 'south', { kind: 'shelf' }),
      put('Bookshelf', 0.22, 2.4, 'south', { kind: 'shelf' }),
      put('Bookshelf', 3.78, 0.6, 'north', { kind: 'shelf' }),
      put('Bookshelf', 2.98, 0.6, 'north', { kind: 'shelf' }),
      put('Bookshelf', 2.18, 0.6, 'north', { kind: 'shelf', label: 'Rayonnage 2' }),
      put('Bookshelf', 1.38, 0.6, 'north', { kind: 'shelf' }),
      put('Bookshelf', 0.58, 0.6, 'north', { kind: 'shelf' }),
      put('Bookshelf', -0.22, 0.6, 'north', { kind: 'shelf' }),
      put('Bookshelf', -3.78, -1.2, 'south', { kind: 'shelf' }),
      put('Bookshelf', -2.98, -1.2, 'south', { kind: 'shelf' }),
      put('Bookshelf', -2.18, -1.2, 'south', { kind: 'shelf', label: 'Rayonnage 3' }),
      put('Bookshelf', -1.38, -1.2, 'south', { kind: 'shelf' }),
      put('Bookshelf', -0.58, -1.2, 'south', { kind: 'shelf' }),
      put('Bookshelf', 0.22, -1.2, 'south', { kind: 'shelf' }),
      put('File_Box', -3.0, -2.6, 0, { kind: 'box', label: 'Cartons' }),
      put('File_Box', -2.5, -2.6, 0.1, { kind: 'box' }),
      put('File_Box', -2.7, -2.22, -0.1, { kind: 'box' }),
      put('File_Box_Empty', -2.7, -2.6, 0.2, { y: BOX_TOP }),
      put('File_Box', -2.0, -2.95, 1.4, { kind: 'box' }),
      put('Plant_Snake_Large', -3.86, -3.25, 0.2, { kind: 'plant' }),
      put('Photocopier', -0.5, -3.25, 'south', { kind: 'copier', label: 'Photoc.' }),
      put('Cubicle_Panel_Half', 2.2, -1.0, 'east', { kind: 'cloison' }),
      put('Paper_Crumpled_Sheet', 0.8, -0.3, 0.6),
      put('Paper_Crumpled', 3.2, -2.75),
    ],
    hidden: [
      [-4.1, -1.15],
      [0.8, -1.15],
      [0.8, -3.5],
      [-4.1, -3.5],
    ],
    passages: [
      [0.8, 2.4],
      [-0.8, 0.6],
      [0.8, -1.2],
    ],
  }),
  buildLayout({
    id: 'bureau-direction',
    circuit: [0, 0, 2.9, 2.25],
    name: 'Corbeille sur le bureau',
    summary: 'La corbeille est posée sur un bureau de direction ; le sol y monte par-dessous.',
    bin: { x: 3.5, y: DESK_TOP, z: -2.75 },
    goal: [3.5, -2.75],
    finish: [[3.5, DESK_TOP + 0.38, -2.75]],
    spawn: [2.9, -1.1],
    ground: [
      [-4.11, 3.2],
      [-4.11, 0.8],
      [-4.11, -1.0],
    ],
    air: [
      [-4.11, 1.6, 1.8],
      [-4.11, 2.2, -2.0],
      [-2.5, 2.3, -3.51],
      [-4.11, 2.0, 0.2],
    ],
    airPaths: [
      [
        [-2.4, 0.6],
        [-0.8, 0.2],
        [1.2, -0.9],
        [3.0, -2.3],
        [3.4, -2.7],
      ],
      [
        [-3.0, -1.0],
        [-1.0, -1.2],
        [0.8, -2.4],
        [2.8, -2.8],
        [3.4, -2.7],
      ],
      [
        [-3.3, -1.8],
        [-1.8, 0.4],
        [0.5, -0.4],
        [2.2, -1.6],
        [3.4, -2.6],
      ],
      [
        [-3.0, 1.0],
        [-0.4, 1.2],
        [2.0, 0.2],
        [3.4, -2.0],
        [3.5, -2.7],
      ],
    ],
    door: { wall: 'right', at: 1.8 },
    props: [
      // Executive desk: two desks end to end; insects walk in under it from the
      // front and climb into the bin standing on it.
      put('Desk', 1.92, -2.75, 'south', { kind: 'desk', label: 'Bureau de direction' }),
      put('Desk', 3.43, -2.75, 'south', { kind: 'desk', label: 'Bureau de direction' }),
      put('CRT_Monitor', 1.92, -3.0, 'south', { y: DESK_TOP }),
      put('Keyboard', 1.92, -2.55, 'south', { y: DESK_TOP }),
      put('Banker_Lamp', 1.45, -2.95, 'south', { y: DESK_TOP }),
      put('Desk_Phone', 2.35, -2.95, -1.2, { y: DESK_TOP }),
      put('Paper_Stack', 2.85, -2.55, 0.4, { y: DESK_TOP }),
      put('Executive_Chair_Black', 1.95, -1.9, 'north'),
      put('Visitor_Chair_Grey', 3.0, -1.55, 1.3),
      put('Paper_Crumpled', 3.1, -2.1),
      put('Paper_Crumpled_Yellow', 3.9, -2.05),
      put('Cubicle_Panel', -1.4, -0.9, 'south', { kind: 'paravent' }),
      put('Cubicle_Panel_Half', -0.85, -0.45, 'east', { kind: 'paravent' }),
      put('Cubicle_Panel', 0.5, 2.0, 'south', { kind: 'cloison' }),
      ...station(
        put('Desk', -2.5, -2.7, 'south', { kind: 'desk', label: 'Bureau' }),
        'CRT_Monitor',
        0.1,
        'Office_Chair_Blue',
        0.2,
        (d) => [onProp(d, 'Paper_Stack', 0.05, -0.45), onProp(d, 'Mug', 0.15, 0.55)],
      ),
      put('Plant_Tall', 3.9, 0.6, 0.3, { kind: 'plant' }),
      put('Water_Cooler', -3.96, -3.2, 'east', { kind: 'fountain' }),
      put('File_Box', -0.2, -2.9, 0, { kind: 'box', label: 'Cartons' }),
      put('File_Box', 0.22, -2.9, 0.1, { kind: 'box' }),
      put('Filing_Cabinet', 3.85, -0.6, 'west', { kind: 'shelf' }),
    ],
    hidden: [
      [-1.9, -1.0],
      [-0.4, -1.0],
      [-0.4, 0.4],
      [-1.9, 0.4],
    ],
    passages: [
      [2.15, -1.9],
      [1.2, -2.85],
    ],
  }),
]);
export const DEFAULT_LAYOUT_ID = LAYOUTS[0].id;
export const layoutById = (id: unknown): Readonly<OfficeLayout> | null =>
  LAYOUTS.find((l) => l.id === id) || null;
export const isLayoutId = (id: unknown): boolean => typeof id === 'string' && !!layoutById(id);

// Active layout: set by the server around each room operation and by the client
// when it joins. The default keeps standalone scripts and tests working.
let activeLayoutValue = LAYOUTS[0];
type LayoutListener = (layout: Readonly<OfficeLayout>) => void;
const layoutListeners = new Set<LayoutListener>();
export const activeLayout = (): Readonly<OfficeLayout> => activeLayoutValue;
export function setActiveLayout(id: unknown): Readonly<OfficeLayout> {
  const next = layoutById(id) || LAYOUTS[0];
  if (next === activeLayoutValue) return next;
  activeLayoutValue = next;
  for (const l of layoutListeners) l(next);
  return next;
}
export const onLayoutChange = (listener: LayoutListener): (() => boolean) => {
  layoutListeners.add(listener);
  return () => layoutListeners.delete(listener);
};

// ---- geometry: primitives drawn by office.js and used as colliders ----------
/** A drawn primitive; `solid` ones are colliders. Cylinders: w = bottom radius. */
export interface LayoutPiece {
  shape: 'box' | 'cyl';
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  solid: boolean;
  grid?: Vec3;
  radiusTop?: number;
  /** False for colliders of models drawn elsewhere (office pack props). */
  visible?: boolean;
}
const mkPiece = (
  shape: LayoutPiece['shape'],
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: string,
  solid = true,
  extra: Pick<LayoutPiece, 'grid' | 'radiusTop'> = {},
): LayoutPiece => ({
  shape,
  x,
  y,
  z,
  w,
  h,
  d,
  color,
  solid,
  ...extra,
});
function deskPieces(it: Furniture, top: number): LayoutPiece[] {
  const out: LayoutPiece[] = [];
  // Platform desks (a `wall` skirt around them) are closed boxes under the top.
  out.push(
    mkPiece('box', it.x, top - 0.025, it.z, it.w, 0.05, it.d, FURNITURE_KINDS.desk.color, true, {
      grid: [28, 1, 20],
    }),
  );
  for (const dx of [-it.w / 2 + 0.07, it.w / 2 - 0.07])
    for (const dz of [-it.d / 2 + 0.07, it.d / 2 - 0.07])
      out.push(
        mkPiece('box', it.x + dx, (top - 0.05) / 2, it.z + dz, 0.055, top - 0.05, 0.055, '#425d50'),
      );
  out.push(
    mkPiece('box', it.x, top - 0.13, it.z - it.d / 2 + 0.04, it.w - 0.12, 0.18, 0.035, '#77917d'),
  );
  return out;
}
const FLOOR_COLOR = '#8d8f7f';
const colliderPiece = (c: Collider): LayoutPiece =>
  mkPiece(
    'box',
    (c.min.x + c.max.x) / 2,
    (c.min.y + c.max.y) / 2,
    (c.min.z + c.max.z) / 2,
    c.max.x - c.min.x,
    c.max.y - c.min.y,
    c.max.z - c.min.z,
    '',
  );
const same = (a: number, b: number) => Math.abs(a - b) < 1e-4;
// Merges boxes that share a whole face (same extent on the two other axes).
function mergeTouching(list: Collider[]): Collider[] {
  const out = list.map((c) => ({ min: { ...c.min }, max: { ...c.max } }));
  const axes = ['x', 'y', 'z'] as const;
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++)
      for (let j = i + 1; j < out.length && !merged; j++) {
        const a = out[i],
          b = out[j];
        for (const k of axes) {
          const others = axes.filter((o) => o !== k);
          if (!others.every((o) => same(a.min[o], b.min[o]) && same(a.max[o], b.max[o]))) continue;
          if (!same(a.max[k], b.min[k]) && !same(b.max[k], a.min[k])) continue;
          a.min[k] = Math.min(a.min[k], b.min[k]);
          a.max[k] = Math.max(a.max[k], b.max[k]);
          out.splice(j, 1);
          merged = true;
          break;
        }
      }
  }
  return out;
}
const piecesCache = new Map<string, LayoutPiece[]>();
// Primitives of one layout: room shell, furniture, bin. `solid` ones are the
// colliders (axis-aligned boxes), exactly what the scene draws.
export function layoutPieces(layout: Readonly<OfficeLayout> = activeLayoutValue): LayoutPiece[] {
  const hit = piecesCache.get(layout.id);
  if (hit) return hit;
  const P: LayoutPiece[] = [];
  P.push(mkPiece('box', 0, -0.04, 0, 8.4, 0.08, 7.2, FLOOR_COLOR));
  for (const it of layout.furniture) {
    if (it.prop) continue;
    const k = FURNITURE_KINDS[it.kind];
    const solid = k.solid !== false;
    if (it.kind === 'desk') P.push(...deskPieces(it, k.h));
    else if (it.kind === 'plant') {
      P.push(
        mkPiece('cyl', it.x, k.h / 2, it.z, it.w / 2, k.h, it.w / 2, '#8a5a3c', true, {
          radiusTop: (it.w / 2) * 0.8,
        }),
      );
      P.push(
        mkPiece('cyl', it.x, k.h + 0.05, it.z, it.w * 0.65, 0.3, it.w * 0.65, k.color, false, {
          radiusTop: it.w * 0.45,
        }),
      );
    } else P.push(mkPiece('box', it.x, k.h / 2, it.z, it.w, k.h, it.d, k.color, solid));
  }
  // Colliders of the models (walls, vents, bin, props): drawn by office.js.
  // Touching boxes of a row (bookshelves, panels) become one: no seam to catch on.
  for (const c of mergeTouching([...layout.shellSolids, ...layout.props.flatMap(propColliders)]))
    P.push({ ...colliderPiece(c), visible: false });
  piecesCache.set(layout.id, P);
  return P;
}
export function pieceBounds(p: LayoutPiece): Collider {
  if (p.shape === 'cyl') {
    const r = Math.max(p.w, p.radiusTop ?? p.w);
    return {
      min: { x: p.x - r, y: p.y - p.h / 2, z: p.z - r },
      max: { x: p.x + r, y: p.y + p.h / 2, z: p.z + r },
    };
  }
  return {
    min: { x: p.x - p.w / 2, y: p.y - p.h / 2, z: p.z - p.d / 2 },
    max: { x: p.x + p.w / 2, y: p.y + p.h / 2, z: p.z + p.d / 2 },
  };
}
const solidsCache = new Map<string, Collider[]>();
export function layoutSolids(layout: Readonly<OfficeLayout> = activeLayoutValue): Collider[] {
  let s = solidsCache.get(layout.id);
  if (!s)
    solidsCache.set(
      layout.id,
      (s = layoutPieces(layout)
        .filter((p) => p.solid)
        .map(pieceBounds)),
    );
  return s;
}

// Top-down thumbnail of a layout (back wall at the top), as an SVG string.
export function layoutThumbnail(layout: Readonly<OfficeLayout>): string {
  const r = (it: Furniture, fill: string, op = 1): string =>
    `<rect x="${it.x - it.w / 2}" y="${it.z - it.d / 2}" width="${it.w}" height="${it.d}" fill="${fill}" fill-opacity="${op}"/>`;
  const parts = layout.furniture.map((it) =>
    it.kind === 'plant'
      ? `<circle cx="${it.x}" cy="${it.z}" r="${it.w / 2}" fill="${FURNITURE_KINDS.plant.color}"/>`
      : r(it, FURNITURE_KINDS[it.kind].color),
  );
  const dots = [
    ...layout.portals.ground.map(
      ([x, , z]) => `<circle cx="${x}" cy="${z}" r="0.28" fill="#c0392b"/>`,
    ),
    ...layout.portals.air.map(
      ([x, , z]) => `<circle cx="${x}" cy="${z}" r="0.28" fill="#7a3fb0"/>`,
    ),
  ];
  const bin = `<circle cx="${layout.bin.x}" cy="${layout.bin.z}" r="0.42" fill="#79947a" stroke="#243b2e" stroke-width="0.12"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4.2 -3.6 8.4 7.2" aria-hidden="true">` +
    `<rect x="-4.2" y="-3.6" width="8.4" height="7.2" fill="#e6e8da" stroke="#33433a" stroke-width="0.16"/>` +
    parts.join('') +
    bin +
    dots.join('') +
    `</svg>`
  );
}
