// Office layouts ("plans"): pure data, no Three.js. A room owns one plan for its
// whole life; the server activates it before handling that room and the client
// when it joins. Every geometry consumer (scene, colliders, routes, ground flow,
// spawn) derives from the active layout, never from constants.
import { ACTOR_UNIT, MAP } from './scale.ts';
import type { Collider } from './oriented-collider.ts';
import type { Vec2, Vec3 } from './types.ts';

export const FLOOR_Y = 0.00005;
export const LAYOUT_ROOM = Object.freeze({ x: 4.2, z: 3.6, wall: 3 });
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
  furniture: Furniture[];
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
  furniture: Furniture[];
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
const LAYOUT_GROUND_Y = 0.0007;
const groundAt = (x: number, z: number): Vec3 => [x, LAYOUT_GROUND_Y, z];

function buildLayout(spec: LayoutSpec): Readonly<OfficeLayout> {
  const bin = { y: 0, ...spec.bin };
  const rim = bin.y + 0.38;
  const u = ACTOR_UNIT;
  const originX = spec.spawn[0],
    originZ = spec.spawn[1];
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
    furniture: spec.furniture,
    hidden: spec.hidden || [],
    passages: spec.passages || [],
  };
  return Object.freeze(out);
}

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
        [0, 0.6],
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
        [0.5, 1.0],
        [-0.6, -0.2],
        [1.6, -1.6],
        [3.5, -2.9],
      ],
    ],
    furniture: [
      furn('desk', -1.9, 1.3, 2.2, 1.1, 'Bureau A'),
      furn('desk', 0.8, 1.3, 2.2, 1.1, 'Bureau B'),
      furn('shelf', -2.3, -2.9, 2.0, 0.4, 'Archives'),
      furn('paravent', -0.4, -1.7, 1.2, 0.1),
      furn('paravent', 0.15, -1.3, 0.1, 0.8),
      furn('cloison', 1.5, -1.65, 1.1, 0.1),
      furn('cloison', 3.4, 1.0, 0.12, 2.0),
      furn('box', 2.4, 0.2, 0.8, 0.6, 'Cartons'),
      furn('copier', 3.75, -0.4, 0.7, 0.5, 'Photoc.'),
      furn('fountain', -3.9, -1.4, 0.4, 0.4),
      furn('plant', -3.8, -3.2, 0.4, 0.4),
    ],
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
    furniture: [
      furn('desk', -2.3, 1.7, 1.8, 0.9, 'Îlot 1'),
      furn('desk', 2.3, 1.7, 1.8, 0.9, 'Îlot 2'),
      furn('desk', -2.3, -1.7, 1.8, 0.9, 'Îlot 3'),
      furn('desk', 2.3, -1.7, 1.8, 0.9, 'Îlot 4'),
      furn('cloison', 0, -1.2, 1.2, 0.1),
      furn('cloison', 0, 1.2, 1.2, 0.1),
      furn('cloison', -1.2, 0, 0.1, 1.2),
      furn('cloison', 1.2, 0, 0.1, 1.2),
      furn('copier', -0.5, 3.2, 0.7, 0.5, 'Photoc.'),
      furn('plant', 3.9, -0.9, 0.4, 0.4),
      furn('box', -3.4, 0.1, 0.6, 0.6, 'Cartons'),
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
    furniture: [
      furn('wall', 0.2, -2.0, 0.15, 3.2),
      furn('wall', 0.2, 2.2, 0.15, 2.8),
      furn('desk', -2.4, 1.5, 2.0, 1.0, 'Bureau A'),
      furn('desk', -2.4, -1.9, 2.0, 1.0, 'Bureau B'),
      furn('paravent', 1.3, 0.2, 0.1, 1.4),
      furn('copier', 3.3, 0.9, 0.8, 0.5, 'Photoc.'),
      furn('plant', 3.9, 2.9, 0.4, 0.4),
      furn('box', -3.6, -0.2, 0.6, 0.6, 'Cartons'),
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
    furniture: [
      furn('desk', -2.6, -1.3, 2.0, 1.0, 'Bureau G'),
      furn('desk', 2.6, -1.3, 2.0, 1.0, 'Bureau D'),
      furn('paravent', 0, -1.7, 1.6, 0.1),
      furn('cloison', -1.4, 1.4, 1.4, 0.1),
      furn('cloison', 1.4, 1.4, 1.4, 0.1),
      furn('plant', 3.9, -3.2, 0.4, 0.4),
      furn('fountain', -3.9, -3.2, 0.4, 0.4),
      furn('box', 3.2, 0.2, 0.8, 0.6, 'Cartons'),
      furn('copier', -3.3, 0.2, 0.8, 0.5, 'Photoc.'),
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
    furniture: [
      furn('shelf', -1.7, 2.4, 5.0, 0.35, 'Rayonnage 1'),
      furn('shelf', 1.7, 0.6, 5.0, 0.35, 'Rayonnage 2'),
      furn('shelf', -1.7, -1.2, 5.0, 0.35, 'Rayonnage 3'),
      furn('box', -2.6, -2.6, 1.2, 0.8, 'Cartons'),
      furn('plant', -3.8, -3.2, 0.4, 0.4),
      furn('copier', -0.5, -3.25, 0.7, 0.5, 'Photoc.'),
      furn('cloison', 2.2, -1.0, 0.1, 0.8),
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
    summary: 'La corbeille est posée sur un bureau de direction ; le sol y monte par deux rampes.',
    bin: { x: 3.5, y: 0.9, z: -2.75 },
    goal: [3.5, -2.75],
    finish: [[3.5, 1.28, -2.75]],
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
    furniture: [
      // Executive desk 1.2..4.2 × -3.3..-1.9: its skirt is solid except the
      // two ramps, so insects reach it through the openings only.
      furn('skirt', 1.55, -1.9, 0.7, 0.08),
      furn('skirt', 3.3, -1.9, 1.8, 0.08),
      furn('skirt', 1.2, -3.2, 0.08, 0.2),
      furn('skirt', 1.2, -2.25, 0.08, 0.7),
      furn('desk', 2.7, -2.6, 3.0, 1.4, 'Bureau de direction'),
      furn('paravent', -1.4, -0.9, 1.2, 0.1),
      furn('paravent', -0.85, -0.5, 0.1, 0.8),
      furn('cloison', 0.5, 2.0, 1.4, 0.1),
      furn('desk', -2.5, -2.7, 1.8, 0.9, 'Bureau'),
      furn('plant', 3.9, 0.6, 0.4, 0.4),
      furn('fountain', -3.9, -3.2, 0.4, 0.4),
      furn('box', 0.0, -2.9, 0.8, 0.6, 'Cartons'),
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
const piecesCache = new Map<string, LayoutPiece[]>();
// Primitives of one layout: room shell, furniture, bin. `solid` ones are the
// colliders (axis-aligned boxes), exactly what the scene draws.
export function layoutPieces(layout: Readonly<OfficeLayout> = activeLayoutValue): LayoutPiece[] {
  const hit = piecesCache.get(layout.id);
  if (hit) return hit;
  const P: LayoutPiece[] = [];
  P.push(mkPiece('box', 0, -0.04, 0, 8.4, 0.08, 7.2, '#7b8675'));
  P.push(mkPiece('box', 0, 1.5, -3.6, 8.4, 3, 0.08, '#b7c0ac'));
  P.push(mkPiece('box', -4.2, 1.5, 0, 0.08, 3, 7.2, '#b4c6b7'));
  P.push(mkPiece('box', 4.2, 1.5, 0, 0.08, 3, 7.2, '#adc0b1'));
  for (const it of layout.furniture) {
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
  const b = layout.bin;
  P.push(
    mkPiece('cyl', b.x, b.y + 0.15, b.z, 0.12, 0.3, 0.12, '#3c5748', true, { radiusTop: 0.16 }),
  );
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
