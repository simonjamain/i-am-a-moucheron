// The purgatory's rules on top of the walking arena (walk-arena.ts): the
// insects' physical queue, Saint Pierre's desk and the paid VIP lane
// (docs/purgatory-queue.md). Shared by the server (authority on souls and
// signatures) and the clients (each simulates its own soul, the host the insects).
import {
  ACTOR_UNIT,
  PERSON_HEIGHT,
  HUMANOID_UNITS,
  WALK_WORLDS,
  WALKER_RADIUS,
  walkAcceleration,
} from './scale.ts';
import { PURGATORY_FRAME } from './arena-frame.ts';
import { advanceArena, createWalker } from './walk-arena.ts';
import type {
  Arena,
  ArenaBounds,
  ArenaObstacle,
  PlanarPoint,
  WalkBody,
  WalkEntity,
  WalkRules,
  WalkSeed,
} from './walk-arena.ts';

// Movement radius only (hits use meshes elsewhere). Issue #135 halved it so the
// slimmer character no longer snags on other players.
export const SOUL_RADIUS = (WALKER_RADIUS * HUMANOID_UNITS) / PERSON_HEIGHT,
  INSECT_RADIUS = 0.43,
  INSECT_MASS = 0.65;
export const QUEUE_SPACING = 1.85;
/** The insects' queue runs along x = 0, from the desk (z = 1.1) backwards. */
const LANE_HALF_WIDTH = 1.1,
  DESK = Object.freeze({ x: 0, z: 1.1, r: 1.25 }),
  /** Time Saint Pierre takes to stamp an insect's papers (ms). */
  INSECT_SERVICE_MS = 1500;
const inLane = (b: PlanarPoint): boolean => Math.abs(b.x) < LANE_HALF_WIDTH;

export function soulSpawn(index: number): PlanarPoint {
  return { x: DESK.x, z: DESK.z + index * QUEUE_SPACING };
}
// ---------------------------------------------------------------- staff
/**
 * Saint Pierre and the VIP guard (docs/purgatory-sky.md): STAFF_HP points of life
 * each. Killed, each walks the queue as a soul (kind 'enemy', enemyType its role),
 * the size of a person. The guard's soul is served like the insects and goes back to
 * its post; Saint Pierre cannot serve himself, so his soul waits until it is killed
 * again (STAFF_HP once more), and then he goes back behind his desk.
 */
export const STAFF_HP = 10000;
/**
 * Saint Pierre and the VIP guard. The guard's role is 'vipGuard', never 'guard': that
 * is an insect species (the bee), whose souls queue like the other insects.
 */
export type StaffRole = 'saint' | 'vipGuard';
export const STAFF_ROLES: readonly StaffRole[] = Object.freeze(['saint', 'vipGuard']);
export const isStaff = (type: unknown): type is StaffRole =>
  type === 'saint' || type === 'vipGuard';

export function createSoul(
  s: WalkSeed & { enemy_type?: string },
  index: number,
  now: number,
): WalkBody {
  const insect = s.kind === 'enemy' && !isStaff(s.enemy_type);
  // Bodies stand on the cloud's floor, at its height in the world. The queue's souls (the
  // insects and the guard's) have their place by a formula and do not collide with each other.
  return {
    ...createWalker(
      s,
      soulSpawn(index),
      now,
      insect
        ? { r: INSECT_RADIUS, mass: INSECT_MASS, fixed: true }
        : { r: SOUL_RADIUS, fixed: s.kind === 'enemy' && s.enemy_type !== 'saint' },
    ),
    y: PURGATORY_FRAME.originY,
  };
}

// ---------------------------------------------------------------- VIP lane
// A roped lane on the right of the insects' queue, closed by a rope gate that
// only lets players with the pass through. It ends at Saint Pierre's second
// window, where he serves a VIP once the insect at his first window is done.
// The pass is bought from the guard at the gate.
export const VIP_DESK = Object.freeze({ x: 5.2, z: 1.1 });
export const VIP_GATE_Z = 9.2;
/**
 * The VIP window's zone, invisible: the front half of the lane, between its ropes,
 * from the desk to halfway to the gate. A soul with the pass standing there is
 * served at the VIP window (Saint Pierre comes in front of it).
 */
export const VIP_ZONE = Object.freeze({ minX: 4, maxX: 6.4, maxZ: VIP_GATE_Z / 2 });
export const VIP_LANE: readonly ArenaObstacle[] = Object.freeze([
  { x: 3.9, z: VIP_GATE_Z / 2, w: 0.12, d: VIP_GATE_Z },
  { x: 6.5, z: VIP_GATE_Z / 2, w: 0.12, d: VIP_GATE_Z },
  { x: 5.2, z: VIP_GATE_Z, w: 2.72, d: 0.12, vip: true },
]);
/** Interaction reach of a soul in the purgatory (arena units, about 2.6 m): guard, clipboard. */
export const PURGATORY_REACH = 3.5;
export const VIP_GUARD = Object.freeze({ x: 7.1, z: 9.9, reach: PURGATORY_REACH });
/**
 * Where each window's clipboard lies on its desk (src/purgatory-scene.ts): offset
 * from the desk's middle (dx) and its z, just over the counter's front edge.
 */
export const CLIPBOARD_AT = Object.freeze({ dx: 0.3, z: -0.85 });
/** A player's soul at the main window: within reach of its clipboard, anywhere. */
export function nearDeskClipboard(b: PlanarPoint): boolean {
  return Math.hypot(b.x - (DESK.x + CLIPBOARD_AT.dx), b.z - CLIPBOARD_AT.z) < PURGATORY_REACH;
}
/**
 * Where a player appears in the purgatory: by the sofa on the VIP side, from where
 * both queues show (no need to cross the insects' queue).
 */
export const SOUL_ENTRANCE = Object.freeze({ x: 8.6, z: 13.5 });
/** Price of the pass in dollars: the wave number (wave 1: 1 $). */
export function vipPrice(wave: number): number {
  return Math.max(1, Math.floor(Number(wave) || 0));
}
export function inVipDesk(b: WalkBody): boolean {
  return !b.gone && b.x > VIP_ZONE.minX && b.x < VIP_ZONE.maxX && b.z < VIP_ZONE.maxZ;
}
/**
 * Where Saint Pierre stands behind the counter (arena x) to serve `served`: the
 * middle of the main desk, or in front of the soul at the VIP desk.
 */
export function saintWindowX(served: PlanarPoint | null | undefined): number {
  if (!served || served.x <= VIP_DESK.x / 2) return 0;
  return Math.max(VIP_DESK.x - 0.6, Math.min(VIP_DESK.x + 0.6, served.x));
}
export function nearVipGuard(b: PlanarPoint): boolean {
  return Math.hypot(b.x - VIP_GUARD.x, b.z - VIP_GUARD.z) < VIP_GUARD.reach;
}

// ---------------------------------------------------------------- queue
/** An insect waiting earlier than this player (lower id) stands in the lane. */
function insectAhead(a: Arena, b: WalkBody): WalkBody[] {
  return a.bodies.filter(
    (other) => other.kind === 'enemy' && !other.gone && inLane(other) && other.id < b.id,
  );
}
/**
 * The queue's places, by a formula: the souls in ticket order (then id) stand one every
 * QUEUE_SPACING along the lane from the desk, leaving the place of a player who stands in the
 * lane. They are never pushed (a player is), never walk round anything, and may stand beyond
 * the cloud's edge in the air.
 */
function queueOrder(a: Arena): WalkBody[] {
  return a.bodies
    .filter((b) => b.kind === 'enemy' && !b.gone && b.enemyType !== 'saint')
    .sort((a, b) => (a.queueTicket ?? a.id) - (b.queueTicket ?? b.id) || a.id - b.id);
}
function queuePlaces(a: Arena): [WalkBody, PlanarPoint][] {
  const players = a.bodies.filter((b) => b.kind === 'player' && !b.gone && inLane(b));
  let z = DESK.z;
  return queueOrder(a).map((b) => {
    while (players.some((p) => Math.abs(p.z - z) < QUEUE_SPACING * 0.85)) z += QUEUE_SPACING;
    const place = { x: 0, z };
    z += QUEUE_SPACING;
    return [b, place];
  });
}
export function queueTargets(a: Arena): Map<number, PlanarPoint> {
  return new Map(queuePlaces(a).map(([b, place]) => [b.id, place]));
}
/** Puts every soul of the queue on its place (no walking, no obstacles, no pushing). */
function placeSouls(a: Arena): void {
  for (const [b, place] of queuePlaces(a)) {
    if (!b.fixed) continue;
    b.x = place.x;
    b.z = place.z;
    b.vx = 0;
    b.vz = 0;
    b.face = Math.PI;
  }
}
/** The side aisle is an entrance, not a shortcut past waiting insects. */
function keepQueueOrder(a: Arena, b: WalkBody): void {
  if (b.kind !== 'player' || !inLane(b)) return;
  const earlier = insectAhead(a, b);
  if (!earlier.length) return;
  const tail = Math.max(...earlier.map((other) => other.z)) + QUEUE_SPACING;
  if (b.z < tail) {
    b.z = tail;
    b.vz = Math.max(0, b.vz);
  }
}

// ---------------------------------------------------------------- desk
/**
 * At the main window: an insect in the zone in front of the desk; a player's soul
 * anywhere within reach of the clipboard (it never needs to stand on a mark).
 */
export function inDeskZone(b: WalkBody): boolean {
  if (b.gone) return false;
  if (b.kind === 'player') return nearDeskClipboard(b);
  return b.z >= 0.48 && Math.hypot(b.x - DESK.x, b.z - DESK.z) < DESK.r;
}
/** Closest body at the insects' window; a player waits behind earlier insects. */
function mainWindowOccupant(a: Arena): WalkBody | null {
  const d2 = (b: WalkBody): number => (b.x - DESK.x) ** 2 + (b.z - DESK.z) ** 2;
  return (
    a.bodies
      .filter((b) => inDeskZone(b) && (b.kind !== 'player' || !insectAhead(a, b).length))
      .sort((x, y) => d2(x) - d2(y) || x.id - y.id)[0] || null
  );
}
/** Body Saint Pierre serves now: the insect he started, else a VIP, else the queue. */
export function deskOccupant(a: Arena): WalkBody | null {
  // Saint Pierre is dead: nobody is served.
  if (a.saintDown) return null;
  const main = mainWindowOccupant(a);
  if (main?.kind === 'enemy' && main.served > 0) return main;
  const d = (b: WalkBody): number => Math.hypot(b.x - VIP_DESK.x, b.z - VIP_DESK.z);
  // The guard is dead: the VIP window is closed.
  const vip = a.bodies
    .filter((b) => !a.vipClosed && b.kind === 'player' && b.vip && inVipDesk(b))
    .sort((x, y) => d(x) - d(y) || x.id - y.id)[0];
  return vip || main;
}
/**
 * The clipboard a player's soul may use now (docs/purgatory-scene.md): the one of
 * the window where Saint Pierre serves it ('desk' or 'vip'), else none. A soul
 * without the pass never gets the VIP clipboard.
 */
export function clipboardWindow(a: Arena, b: WalkBody | null | undefined): 'desk' | 'vip' | null {
  if (!b || b.gone || b.kind !== 'player' || deskOccupant(a)?.id !== b.id) return null;
  return b.vip && inVipDesk(b) ? 'vip' : 'desk';
}
/**
 * Saint Pierre's soul (docs/purgatory-sky.md) takes the VIP lane, through its gate, and
 * waits at the VIP window, where nobody can sign for him.
 */
export function saintIntent(b: PlanarPoint): PlanarPoint {
  const inLane = b.x > 3.9 && b.x < 6.5 && b.z < VIP_GATE_Z + 0.3;
  const target = inLane
    ? { x: VIP_DESK.x, z: VIP_DESK.z }
    : Math.abs(b.x - VIP_DESK.x) < 0.4
      ? { x: VIP_DESK.x, z: VIP_DESK.z }
      : { x: VIP_DESK.x, z: VIP_GATE_Z + 1 };
  const dx = target.x - b.x,
    dz = target.z - b.z,
    d = Math.hypot(dx, dz);
  if (d < 0.2) return { x: 0, z: 0 };
  return { x: dx / Math.max(1, d), z: dz / Math.max(1, d) };
}
/** Saint Pierre stamps the insect at his desk; players sign their papers themselves. */
function serveDesk(a: Arena, now: number, ms: number, owned: (b: WalkBody) => boolean): void {
  a.desk = deskOccupant(a)?.id ?? null;
  for (const b of a.bodies) {
    if (owned(b) && b.kind === 'enemy' && b.id === a.desk) {
      b.served += ms;
      if (b.served >= INSECT_SERVICE_MS) {
        b.gone = true;
        a.desk = null;
        a.events.push({ id: ++a.eventSeq, at: now, kind: 'stamp', target: b.id, x: 0, z: -1 });
        if (a.events.length > 24) a.events.shift();
      }
    } else b.served = 0;
  }
}

export const PURGATORY_RULES: WalkRules = Object.freeze({
  // A soul walks exactly like a person in the office (scale.ts, walkAcceleration).
  acceleration: walkAcceleration(WALK_WORLDS.purgatory),
  // Heights are world heights of the same person as in the office.
  verticalUnit: ACTOR_UNIT,
  npcAcceleration: 14,
  bounds: (a: Arena): ArenaBounds => ({
    minX: -10,
    maxX: 10,
    minZ: 0,
    maxZ: Math.max(80, a.bodies.length * QUEUE_SPACING + 5),
  }),
  steer(a: Arena): Map<number, PlanarPoint> {
    const intents = new Map<number, PlanarPoint>();
    for (const b of a.bodies)
      if (!b.gone && b.enemyType === 'saint') intents.set(b.id, saintIntent(b));
    return intents;
  },
  constrain: keepQueueOrder,
  passes: (b: WalkBody, o: ArenaObstacle): boolean =>
    !!(o.vip && (b.vip || b.enemyType === 'saint')),
  afterStep(a: Arena, now: number, ms: number, owned: (b: WalkBody) => boolean): void {
    placeSouls(a);
    serveDesk(a, now, ms, owned);
  },
});

export function advancePurgatory(a: Arena, to: number, owner: WalkEntity = null): Arena {
  return advanceArena(a, to, PURGATORY_RULES, owner);
}

// ---------------------------------------------------------------- wire
/** A queue soul on the wire: [id, entity, enemyType, ticket, health, maxHealth, served]. */
export type QueueRow = [number, WalkEntity, string | undefined, number, number, number, number];
/** An arena as snapshots carry it: the places of the queue's souls travel as short rows. */
export type ArenaWire = Arena & { queue?: QueueRow[] };

/**
 * The arena for a snapshot: the queue's souls (which stand where a formula puts them) as
 * rows of seven numbers or words instead of whole bodies, so that a long queue stays cheap.
 */
export function queueView(a: Arena): ArenaWire {
  const bodies: WalkBody[] = [],
    queue: QueueRow[] = [];
  for (const b of a.bodies)
    if (b.fixed && b.kind === 'enemy')
      queue.push([
        b.id,
        b.entity,
        b.enemyType,
        b.queueTicket,
        b.health ?? 0,
        b.maxHealth ?? 0,
        b.served,
      ]);
    else bodies.push(b);
  return { ...a, bodies, queue };
}
/** The arena of a snapshot with the queue's souls as bodies again, on their places. */
export function expandQueue(a: ArenaWire): Arena {
  const { queue, ...arena } = a;
  if (!queue) return arena;
  const bodies = [...arena.bodies];
  queue.forEach(([id, entity, type, ticket, health, maxHealth, served], i) => {
    const b = createSoul({ id, entity, kind: 'enemy', enemy_type: type }, i, arena.time ?? 0);
    Object.assign(b, { queueTicket: ticket, health, maxHealth, served, enemyType: type });
    bodies.push(b);
  });
  const expanded = { ...arena, bodies };
  placeSouls(expanded);
  return expanded;
}
