// Walking arena shared by every world where people walk (the office deck, the
// purgatories): 2.5D bodies, steering, collisions, obstacles and the cooperative
// network relay. Each client simulates its own body; the host simulates the NPCs.
// A world adds its own behaviour through WalkRules (the purgatory queue lives in
// purgatory-queue.ts); nothing here knows about a particular world.
import { MAP } from './scale.ts';
import { WALKER_FREEFALL_SPEED } from './field-physics.ts';

export type WalkKind = 'player' | 'enemy';
/** Player id (pilot entity) owning a body or hosting the NPCs. */
export type WalkEntity = string | null;

/** Unit walking intent of a body, in arena axes. */
export interface WalkInput {
  x: number;
  z: number;
}

/** One physical body of a walking arena. */
export interface WalkBody {
  id: number;
  entity: WalkEntity;
  kind: WalkKind;
  name?: string;
  x: number;
  z: number;
  y?: number | null;
  vx: number;
  vz: number;
  vy?: number;
  face: number;
  r: number;
  mass: number;
  input: WalkInput;
  inputAt: number;
  gone?: boolean;
  grounded?: boolean;
  parachute?: boolean;
  // Queue state relayed with the motion (purgatory-queue.ts).
  queueTicket: number;
  served: number;
  // Server metadata kept across owned merges (purgatory souls).
  health?: number;
  maxHealth?: number;
  enemyType?: string;
  paper?: unknown;
  /** Player who paid the VIP lane's pass. */
  vip?: boolean;
}

export interface ArenaEvent {
  id: number;
  at: number;
  kind: 'stamp';
  target: number;
  x: number;
  z: number;
}

export interface ArenaBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Axis-aligned box obstacle (centre x/z, width w along x, depth d along z). */
export interface ArenaObstacle {
  x: number;
  z: number;
  w: number;
  d: number;
  y?: number;
  /** Only stops bodies without the VIP pass (the purgatory lane's rope gate). */
  vip?: boolean;
}

export interface Arena {
  epoch?: unknown;
  bodies: WalkBody[];
  time: number;
  events: ArenaEvent[];
  eventSeq: number;
  host?: WalkEntity;
  /** Body served at Saint Pierre's desk (purgatories only). */
  desk?: number | null;
  bounds?: ArenaBounds;
  obstacles?: ArenaObstacle[];
  revision?: number;
  /** Saint Pierre is dead (docs/purgatory-sky.md): nobody is served at his desk. */
  saintDown?: boolean;
  /** The VIP guard is dead: the VIP window is closed. */
  vipClosed?: boolean;
}

export interface PlanarPoint {
  x: number;
  z: number;
}

export interface WalkSeed {
  id: number;
  entity: WalkEntity;
  kind: WalkKind;
  name?: string;
}

/** How a world walks: its units and the behaviour it adds to the arena. */
export interface WalkRules {
  /** Player acceleration in arena units/s² (scale.ts walkAcceleration). */
  acceleration: number;
  /** NPC acceleration in arena units/s². */
  npcAcceleration?: number;
  /** Arena units of the scene's height, for worlds with falls (office); flat otherwise. */
  verticalUnit?: number;
  /** Bounds used when the arena has none. */
  bounds?(a: Arena): ArenaBounds;
  /** Unit intent of each NPC, once per step (NPCs absent from the map stand still). */
  steer?(a: Arena, now: number): Map<number, PlanarPoint>;
  /** Extra constraint on an owned body after collisions (e.g. queue order). */
  constrain?(a: Arena, b: WalkBody): void;
  /** True when this body walks through this obstacle. */
  passes?(b: WalkBody, o: ArenaObstacle): boolean;
  /** Called after each step with its duration (e.g. desk service). */
  afterStep?(a: Arena, now: number, ms: number, owned: (b: WalkBody) => boolean): void;
}

export const STEP = 1 / 60;
const INPUT_TIMEOUT = 450, // ms: an input older than this is released
  DRAG = 7,
  FREE_FALL_DRAG = 0.25,
  PARACHUTE_DRAG = 1.5,
  MAX_SPEED = 15,
  MAX_AIR_SPEED = 100;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export function createWalker(
  s: WalkSeed,
  at: PlanarPoint,
  now: number,
  shape: { r: number; mass?: number },
): WalkBody {
  return {
    id: s.id,
    entity: s.entity,
    kind: s.kind,
    name: s.name,
    x: at.x,
    z: at.z,
    vx: 0,
    vz: 0,
    face: Math.PI,
    r: shape.r,
    mass: shape.mass ?? 1,
    input: { x: 0, z: 0 },
    inputAt: now,
    queueTicket: s.id,
    served: 0,
  };
}

function collide(
  a: WalkBody,
  b: WalkBody,
  owned: (body: WalkBody) => boolean,
  verticalUnit: number,
): void {
  if (
    a.gone ||
    b.gone ||
    Math.abs((a.y ?? 0) - (b.y ?? 0)) > 1.7 * verticalUnit ||
    (!owned(a) && !owned(b))
  )
    return;
  let dx = b.x - a.x,
    dz = b.z - a.z,
    d = Math.hypot(dx, dz);
  const r = a.r + b.r;
  if (d >= r) return;
  if (d < 0.0001) {
    dx = a.id < b.id ? 0.001 : -0.001;
    dz = 0;
    d = 0.001;
  }
  const nx = dx / d,
    nz = dz / d,
    ia = owned(a) ? 1 / a.mass : 0,
    ib = owned(b) ? 1 / b.mass : 0,
    penetration = ((r - d) * 0.8) / (ia + ib);
  a.x -= nx * penetration * ia;
  a.z -= nz * penetration * ia;
  b.x += nx * penetration * ib;
  b.z += nz * penetration * ib;
  const closing = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (closing < 0) {
    const j = (-closing * 1.08) / (ia + ib);
    a.vx -= nx * j * ia;
    a.vz -= nz * j * ia;
    b.vx += nx * j * ib;
    b.vz += nz * j * ib;
  }
}

function keepInside(b: WalkBody, bounds: ArenaBounds): void {
  if (b.x < bounds.minX + b.r) {
    b.x = bounds.minX + b.r;
    b.vx = Math.abs(b.vx) * 0.15;
  }
  if (b.x > bounds.maxX - b.r) {
    b.x = bounds.maxX - b.r;
    b.vx = -Math.abs(b.vx) * 0.15;
  }
  if (b.z < bounds.minZ + b.r) {
    b.z = bounds.minZ + b.r;
    b.vz = Math.abs(b.vz) * 0.15;
  }
  if (b.z > bounds.maxZ - b.r) {
    b.z = bounds.maxZ - b.r;
    b.vz = -Math.abs(b.vz) * 0.15;
  }
}

function pushOutOf(b: WalkBody, o: ArenaObstacle): void {
  const dx = b.x - o.x,
    dz = b.z - o.z,
    px = o.w / 2 + b.r - Math.abs(dx),
    pz = o.d / 2 + b.r - Math.abs(dz);
  if (px <= 0 || pz <= 0) return;
  if (px < pz) {
    b.x += Math.sign(dx || 1) * px;
    b.vx = 0;
  } else {
    b.z += Math.sign(dz || 1) * pz;
    b.vz = 0;
  }
}

const DEFAULT_BOUNDS: ArenaBounds = Object.freeze({ minX: -10, maxX: 10, minZ: 0, maxZ: 80 });

/**
 * Advances the arena to `to` (ms) in fixed steps. With an `owner`, only the
 * bodies that client simulates move (its own, and the NPCs if it hosts them).
 */
export function advanceArena(
  a: Arena,
  to: number,
  rules: WalkRules,
  owner: WalkEntity = null,
): Arena {
  const owned = (b: WalkBody): boolean =>
    !owner || b.entity === owner || (b.kind === 'enemy' && a.host === owner);
  const vertical = rules.verticalUnit;
  a.events ??= [];
  a.eventSeq ??= 0;
  a.time ??= to;
  const elapsed = Math.min(500, Math.max(0, to - a.time));
  const end = a.time + elapsed;
  while (a.time < end - 0.001) {
    const ms = Math.min(STEP * 1000, end - a.time),
      dt = ms / 1000,
      now = a.time + ms;
    const intents = rules.steer?.(a, now);
    for (const b of a.bodies) {
      if (b.gone || !owned(b)) continue;
      let dx = 0,
        dz = 0;
      if (b.kind === 'enemy') {
        const intent = intents?.get(b.id);
        if (intent) ({ x: dx, z: dz } = intent);
      } else if (now - b.inputAt < INPUT_TIMEOUT) {
        dx = b.input.x;
        dz = b.input.z;
      }
      const n = Math.max(1, Math.hypot(dx, dz));
      dx /= n;
      dz /= n;
      if (dx || dz) b.face = Math.atan2(dx, dz);
      else if (b.kind === 'enemy') b.face = Math.PI;
      // A jump keeps the ground's control and speed limit; only a real fall (faster than a jump
      // ever comes down) is free fall.
      const airborne =
        !!vertical && b.grounded === false && (b.vy ?? 0) < -WALKER_FREEFALL_SPEED * MAP.ratio;
      const accel = b.kind === 'enemy' ? (rules.npcAcceleration ?? 14) : rules.acceleration,
        drag = airborne ? (b.parachute ? PARACHUTE_DRAG : FREE_FALL_DRAG) : DRAG;
      b.vx = (b.vx + dx * accel * dt) * Math.exp(-drag * dt);
      b.vz = (b.vz + dz * accel * dt) * Math.exp(-drag * dt);
      const speed = Math.hypot(b.vx, b.vz),
        maxSpeed = airborne ? MAX_AIR_SPEED : MAX_SPEED;
      if (speed > maxSpeed) {
        b.vx *= maxSpeed / speed;
        b.vz *= maxSpeed / speed;
      }
      b.x += b.vx * dt;
      b.z += b.vz * dt;
    }
    const bounds = a.bounds || rules.bounds?.(a) || DEFAULT_BOUNDS;
    for (let pass = 0; pass < 3; pass++) {
      // Broad phase: most pairs are far apart, so the cheap planar test comes before the call.
      const bodies = a.bodies;
      for (let i = 0; i < bodies.length; i++) {
        const p = bodies[i];
        for (let j = i + 1; j < bodies.length; j++) {
          const q = bodies[j],
            reach = p.r + q.r;
          if (Math.abs(q.x - p.x) >= reach || Math.abs(q.z - p.z) >= reach) continue;
          collide(p, q, owned, vertical || 1);
        }
      }
      for (const b of a.bodies) {
        if (!owned(b)) continue;
        rules.constrain?.(a, b);
        keepInside(b, bounds);
        for (const o of a.obstacles || []) {
          if (Number.isFinite(o.y) && Math.abs((b.y ?? o.y!) - o.y!) > 1.7 * (vertical || 1))
            continue;
          if (!rules.passes?.(b, o)) pushOutOf(b, o);
        }
      }
    }
    rules.afterStep?.(a, now, ms, owned);
    a.time = now;
  }
  // Do not fast-forward through long unattended periods or apply ancient movement inputs.
  if (to - a.time > 500) a.time = to;
  return a;
}

// ---------------------------------------------------------------- network relay
// Cooperative authority: a body is simulated by its player, NPCs by the host.
const MOTION_KEYS = [
  'x',
  'z',
  'vx',
  'vz',
  'face',
  'served',
  'queueTicket',
] as const satisfies readonly (keyof WalkBody)[];
export type MotionKey = (typeof MOTION_KEYS)[number];

/** Owned body state relayed by its simulating client (see bodyMotion). */
export type BodyMotion = Record<MotionKey, number> & {
  id: number;
  input: WalkInput;
  gone: boolean;
  y: number | null;
  vy: number;
  parachute: boolean;
  grounded: boolean;
};

/** Network report of a client's own body and, for the host, its NPCs. */
export interface BodyReport {
  epoch?: unknown;
  body?: BodyMotion;
  npcs?: BodyMotion[];
}

export function bodyMotion(b: WalkBody | null | undefined): BodyMotion | null {
  if (!b) return null;
  return {
    id: b.id,
    ...(Object.fromEntries(MOTION_KEYS.map((k) => [k, b[k] || 0])) as Record<MotionKey, number>),
    input: { x: b.input.x, z: b.input.z },
    gone: !!b.gone,
    y: b.y ?? null,
    vy: b.vy ?? 0,
    parachute: !!b.parachute,
    grounded: b.grounded !== false,
  };
}
// `m` comes from the network: every field is validated before use.
export function acceptBodyMotion(b: WalkBody, m: BodyMotion | null | undefined): boolean {
  if (
    !m ||
    m.id !== b.id ||
    !MOTION_KEYS.every((k) => Number.isFinite(m[k]) && Math.abs(m[k]) < 1e15) ||
    Math.abs(m.x) > 1000000 ||
    Math.abs(m.z) > 1000000 ||
    Math.abs(m.vx) > 100 ||
    Math.abs(m.vz) > 100
  )
    return false;
  for (const k of MOTION_KEYS) b[k] = m[k];
  if (Number.isFinite(m.y) && Math.abs(m.y!) < 2000) b.y = m.y;
  b.vy = Number.isFinite(m.vy) ? clamp(m.vy, -100, 100) : 0;
  b.parachute = !!m.parachute;
  b.grounded = m.grounded !== false;
  b.input = {
    x: clamp(Number(m.input?.x) || 0, -1, 1),
    z: clamp(Number(m.input?.z) || 0, -1, 1),
  };
  return true;
}
/** Server snapshot merged under the bodies this client simulates itself. */
export function mergeOwnedArena(
  snapshot: Arena,
  previous: Arena | null | undefined,
  entity: WalkEntity,
): Arena {
  const a = structuredClone(snapshot);
  if (!previous || a.epoch !== previous.epoch) return a;
  a.time = previous.time;
  for (const b of a.bodies) {
    const old = previous.bodies.find((p) => p.id === b.id && p.entity === b.entity);
    if (
      old &&
      (b.entity === entity || (b.kind === 'enemy' && a.host === entity && previous.host === entity))
    ) {
      const metadata = {
        health: b.health,
        maxHealth: b.maxHealth,
        enemyType: b.enemyType,
        vip: b.vip,
      };
      const paper = b.paper,
        gone = b.gone;
      Object.assign(b, structuredClone(old));
      Object.assign(b, metadata);
      b.paper = paper;
      b.gone = b.kind === 'enemy' ? gone || old.gone : gone;
    }
  }
  return a;
}
/** Server side: applies a client's report to its body (and the host's NPCs). */
export function relayBodyReport(
  a: Arena,
  actor: WalkBody,
  report: BodyReport | null | undefined,
  now: number,
): void {
  if (!report || report.epoch !== a.epoch || report.body?.id !== actor.id) return;
  if (!acceptBodyMotion(actor, report.body)) return;
  actor.inputAt = now;
  if (a.host === actor.entity)
    for (const motion of (report.npcs || []).slice(0, 100)) {
      const b = a.bodies.find((b) => b.id === motion.id && b.kind === 'enemy');
      if (b && acceptBodyMotion(b, motion)) {
        if (!b.gone && motion.gone)
          a.events.push({ id: ++a.eventSeq, at: now, kind: 'stamp', target: b.id, x: 0, z: -1 });
        b.gone = !!motion.gone;
      }
    }
  a.events = a.events.slice(-128);
}
