// Client-owned 2.5D locomotion, collisions and physical queue. Combat uses shared hit points.

export type SoulKind = 'player' | 'enemy';
/** Player id (pilot entity) owning a body or hosting the NPCs. */
export type SoulEntity = string | null;

export interface SoulInput {
  x: number;
  z: number;
  guard: boolean;
}

/** One physical body of a walking arena (purgatory queue, base deck). */
export interface SoulBody {
  id: number;
  entity: SoulEntity;
  kind: SoulKind;
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
  balance: number;
  queueTicket: number;
  koUntil: number;
  hitAt: number;
  hitX: number;
  hitZ: number;
  attack: object | null;
  nextAttack: number;
  nextDash: number;
  input: SoulInput;
  inputAt: number;
  served: number;
  gone?: boolean;
  grounded?: boolean;
  parachute?: boolean;
  // Server-side metadata kept across owned merges.
  health?: number;
  maxHealth?: number;
  enemyType?: string;
  paper?: unknown;
  /** Player who paid the VIP lane's pass (server metadata). */
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
  /** Only stops bodies without the VIP pass (the lane's rope gate). */
  vip?: boolean;
}

export interface Arena {
  epoch?: unknown;
  bodies: SoulBody[];
  time: number;
  events: ArenaEvent[];
  eventSeq: number;
  host?: SoulEntity;
  desk?: number | null;
  respectQueue?: boolean;
  verticalUnit?: number;
  acceleration?: number;
  bounds?: ArenaBounds;
  obstacles?: ArenaObstacle[];
  revision?: number;
}

export interface PlanarPoint {
  x: number;
  z: number;
}

export interface SoulSeed {
  id: number;
  entity: SoulEntity;
  kind: SoulKind;
  name?: string;
}

// Movement radius only (hits use meshes/spheres elsewhere). Issue #135 halved
// it so the slimmer character no longer snags on other players and furniture.
export const SOUL_RADIUS = 0.24,
  STEP = 1 / 60;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const QUEUE_SPACING = 1.85,
  NPC_BALANCE = 60,
  NPC_KO_MS = 10000;
export function soulSpawn(index: number): PlanarPoint {
  return { x: 0, z: 1.1 + index * QUEUE_SPACING };
}
// Each NPC has a distinct place. Players reserve space by actually standing in
// the lane; tickets never grant exclusive access to the signing desk.
export function queueTargets(a: Arena, now: number = a.time): Map<number, PlanarPoint> {
  const npcs = a.bodies
    .filter((b) => b.kind === 'enemy' && !b.gone && b.koUntil <= now)
    .sort((a, b) => (a.queueTicket ?? a.id) - (b.queueTicket ?? b.id) || a.id - b.id);
  const players = a.bodies.filter(
    (b) => b.kind === 'player' && !b.gone && b.koUntil <= now && Math.abs(b.x) < 1.1,
  );
  const targets = new Map<number, PlanarPoint>();
  let z = 1.1;
  for (const b of npcs) {
    while (players.some((p) => Math.abs(p.z - z) < QUEUE_SPACING * 0.85)) z += QUEUE_SPACING;
    targets.set(b.id, { x: 0, z });
    z += QUEUE_SPACING;
  }
  return targets;
}
function queueIntent(
  a: Arena,
  b: SoulBody,
  target: PlanarPoint | undefined,
  now: number,
): PlanarPoint {
  if (!target || now - b.hitAt < 450) return { x: 0, z: 0 };
  let z = target.z;
  // A person physically standing ahead is never bypassed automatically.
  if (z < b.z)
    for (const other of a.bodies) {
      if (other.kind !== 'player' || other.gone || other.koUntil > now || Math.abs(other.x) > 1.1)
        continue;
      if (other.z < b.z && other.z > z) z = Math.max(z, other.z + QUEUE_SPACING);
    }
  let x = 0;
  const travelling = Math.abs(z - b.z) > 0.3;
  const blocked = a.bodies.some(
    (other) =>
      other.id !== b.id &&
      !other.gone &&
      other.koUntil <= now &&
      Math.abs(other.x) < 1.1 &&
      other.z > Math.min(z, b.z) + 0.1 &&
      other.z < Math.max(z, b.z) - 0.1,
  );
  // Use the side aisles to regain a displaced place or return to the tail.
  // Commit to the aisle until level with the reserved place, then rejoin.
  if (travelling && (blocked || Math.abs(b.x) > 1.2)) {
    x = Math.abs(b.x) > 0.2 ? Math.sign(b.x) * 2.1 : z > b.z ? 2.1 : -2.1;
    if (Math.abs(b.x - x) > 0.15) z = b.z;
  }
  const dx = x - b.x,
    dz = z - b.z,
    d = Math.hypot(dx, dz);
  if (d < 0.08) return { x: 0, z: 0 };
  const scale = Math.max(1, d);
  return { x: dx / scale, z: dz / scale };
}
export function createSoul(s: SoulSeed, index: number, now: number): SoulBody {
  return {
    id: s.id,
    entity: s.entity,
    kind: s.kind,
    name: s.name,
    ...soulSpawn(index),
    vx: 0,
    vz: 0,
    face: Math.PI,
    r: s.kind === 'enemy' ? 0.43 : SOUL_RADIUS,
    mass: s.kind === 'enemy' ? 0.65 : 1,
    balance: s.kind === 'enemy' ? NPC_BALANCE : 100,
    queueTicket: s.id,
    koUntil: 0,
    hitAt: 0,
    hitX: 0,
    hitZ: 0,
    attack: null,
    nextAttack: 0,
    nextDash: 0,
    input: { x: 0, z: 0, guard: false },
    inputAt: now,
    served: 0,
  };
}
// VIP lane (docs/purgatory-queue.md): a roped lane on the right of the insects'
// queue, closed by a rope gate that only lets players with the pass through. It
// ends at Saint Pierre's second window, where he serves a VIP once the insect at
// his first window is done. The pass is bought from the guard at the gate.
export const VIP_DESK = Object.freeze({ x: 5.2, z: 1.1, r: 1 });
export const VIP_GATE_Z = 9.2;
export const VIP_LANE: readonly ArenaObstacle[] = Object.freeze([
  { x: 3.9, z: VIP_GATE_Z / 2, w: 0.12, d: VIP_GATE_Z },
  { x: 6.5, z: VIP_GATE_Z / 2, w: 0.12, d: VIP_GATE_Z },
  { x: 5.2, z: VIP_GATE_Z, w: 2.72, d: 0.12, vip: true },
]);
export const VIP_GUARD = Object.freeze({ x: 7.1, z: 9.9, reach: 3.5 });
/** Where a player's soul appears: before both queues, near the guard. */
export const SOUL_ENTRANCE = Object.freeze({ x: 4.2, z: 11 });
/** Price of the pass in dollars: the wave number (wave 1: 1 $). */
export function vipPrice(wave: number): number {
  return Math.max(1, Math.floor(Number(wave) || 0));
}
export function inVipDesk(b: SoulBody): boolean {
  return !b.gone && Math.hypot(b.x - VIP_DESK.x, b.z - VIP_DESK.z) < VIP_DESK.r;
}
export function nearVipGuard(b: PlanarPoint): boolean {
  return Math.hypot(b.x - VIP_GUARD.x, b.z - VIP_GUARD.z) < VIP_GUARD.reach;
}
export function inDeskZone(b: SoulBody): boolean {
  return !b.gone && b.z >= 0.48 && Math.hypot(b.x, b.z - 1.1) < 1.25;
}
export function deskOccupant(a: Arena, now: number = a.time): SoulBody | null {
  const main = queueDeskOccupant(a, now);
  // Saint Pierre finishes the insect he started, then serves the VIP window.
  if (main?.kind === 'enemy' && main.served > 0) return main;
  const vip = a.bodies
    .filter((b) => b.kind === 'player' && b.vip && b.koUntil <= now && inVipDesk(b))
    .sort(
      (x, y) =>
        Math.hypot(x.x - VIP_DESK.x, x.z - VIP_DESK.z) -
          Math.hypot(y.x - VIP_DESK.x, y.z - VIP_DESK.z) || x.id - y.id,
    )[0];
  return vip || main;
}
function queueDeskOccupant(a: Arena, now: number): SoulBody | null {
  return (
    a.bodies
      .filter(
        (b) =>
          inDeskZone(b) &&
          b.koUntil <= now &&
          (!a.respectQueue ||
            b.kind !== 'player' ||
            !a.bodies.some(
              (other) =>
                other.kind === 'enemy' && !other.gone && Math.abs(other.x) < 1.1 && other.id < b.id,
            )),
      )
      .sort(
        (x, y) => x.x * x.x + (x.z - 1.1) ** 2 - (y.x * y.x + (y.z - 1.1) ** 2) || x.id - y.id,
      )[0] || null
  );
}
function collide(
  a: SoulBody,
  b: SoulBody,
  owned: (body: SoulBody) => boolean = () => true,
  now = 0,
  verticalUnit = 1,
): void {
  if ((a.kind === 'enemy' && a.koUntil > now) || (b.kind === 'enemy' && b.koUntil > now)) return;
  if (
    a.gone ||
    b.gone ||
    Math.abs((a.y ?? 0) - (b.y ?? 0)) > 1.7 * verticalUnit ||
    (!owned(a) && !owned(b))
  )
    return;
  let dx = b.x - a.x,
    dz = b.z - a.z,
    d = Math.hypot(dx, dz),
    r = a.r + b.r;
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
export function advanceArena(a: Arena, to: number, owner: SoulEntity = null): Arena {
  const owned = (b: SoulBody): boolean =>
    !owner || b.entity === owner || (b.kind === 'enemy' && a.host === owner);
  a.events ??= [];
  a.eventSeq ??= 0;
  a.time ??= to;
  const elapsed = Math.min(500, Math.max(0, to - a.time));
  const end = a.time + elapsed;
  while (a.time < end - 0.001) {
    const ms = Math.min(STEP * 1000, end - a.time),
      dt = ms / 1000,
      now = a.time + ms;
    const places = queueTargets(a, now);
    for (const b of a.bodies) {
      if (b.gone || !owned(b)) continue;
      let dx = 0,
        dz = 0;
      const ko = false;
      b.koUntil = 0;
      b.attack = null;
      b.input.guard = false;
      if (!ko) {
        if (b.kind === 'enemy') {
          const intent = queueIntent(a, b, places.get(b.id), now);
          dx = intent.x;
          dz = intent.z;
          b.attack = null;
        } else if (now - b.inputAt < 450) {
          dx = b.input.x;
          dz = b.input.z;
        }
        const n = Math.max(1, Math.hypot(dx, dz));
        dx /= n;
        dz /= n;
        if (dx || dz) b.face = Math.atan2(dx, dz);
        if (b.kind === 'enemy' && !dx && !dz) b.face = Math.PI;
      }
      const guarding = false,
        attacking = false;
      const accel = b.kind === 'enemy' ? 14 : (a.acceleration ?? 32),
        drag =
          a.verticalUnit && b.grounded === false
            ? b.parachute
              ? 1.5
              : 0.25
            : ko
              ? 4.5
              : guarding
                ? 8
                : 7;
      b.vx =
        (b.vx + dx * accel * dt * (guarding ? 0.3 : attacking ? 0.55 : 1)) * Math.exp(-drag * dt);
      b.vz =
        (b.vz + dz * accel * dt * (guarding ? 0.3 : attacking ? 0.55 : 1)) * Math.exp(-drag * dt);
      const speed = Math.hypot(b.vx, b.vz);
      const maxSpeed = a.verticalUnit && b.grounded === false ? 100 : 15;
      if (speed > maxSpeed) {
        b.vx *= maxSpeed / speed;
        b.vz *= maxSpeed / speed;
      }
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      const maxBalance = b.kind === 'enemy' ? NPC_BALANCE : 100;
      b.balance = Math.min(maxBalance, b.balance + (now - b.hitAt > 2500 ? 8 * dt : 0));
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < a.bodies.length; i++)
        for (let j = i + 1; j < a.bodies.length; j++)
          collide(a.bodies[i], a.bodies[j], owned, now, a.verticalUnit || 1);
      for (const b of a.bodies) {
        if (!owned(b)) continue;
        // The side aisle is an entrance, not a shortcut past waiting insects.
        if (a.respectQueue && b.kind === 'player' && Math.abs(b.x) < 1.1) {
          const earlier = a.bodies.filter(
            (other) =>
              other.kind === 'enemy' && !other.gone && Math.abs(other.x) < 1.1 && other.id < b.id,
          );
          if (earlier.length) {
            const tail = Math.max(...earlier.map((other) => other.z)) + QUEUE_SPACING;
            if (b.z < tail) {
              b.z = tail;
              b.vz = Math.max(0, b.vz);
            }
          }
        }
        const bounds = a.bounds || {
          minX: -10,
          maxX: 10,
          minZ: 0,
          maxZ: Math.max(80, a.bodies.length * QUEUE_SPACING + 5),
        };
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
        for (const o of a.obstacles || []) {
          if (Number.isFinite(o.y) && Math.abs((b.y ?? o.y!) - o.y!) > 1.7 * (a.verticalUnit || 1))
            continue;
          if (o.vip && b.vip) continue;
          const dx = b.x - o.x,
            dz = b.z - o.z,
            px = o.w / 2 + b.r - Math.abs(dx),
            pz = o.d / 2 + b.r - Math.abs(dz);
          if (px > 0 && pz > 0) {
            if (px < pz) {
              b.x += Math.sign(dx || 1) * px;
              b.vx = 0;
            } else {
              b.z += Math.sign(dz || 1) * pz;
              b.vz = 0;
            }
          }
        }
      }
    }
    const occupant = deskOccupant(a, now);
    a.desk = occupant?.id ?? null;
    for (const b of a.bodies) {
      if (owned(b) && b.kind === 'enemy' && b.id === a.desk) {
        b.served += ms;
        if (b.served >= 1500) {
          b.gone = true;
          a.desk = null;
          a.events.push({ id: ++a.eventSeq, at: now, kind: 'stamp', target: b.id, x: 0, z: -1 });
          if (a.events.length > 24) a.events.shift();
        }
      } else b.served = 0;
    }
    a.time = now;
  }
  // Do not fast-forward through long unattended periods or apply ancient movement inputs.
  if (to - a.time > 500) a.time = to;
  return a;
}

// Cooperative authority: a body is simulated by its player, NPCs by the host.
const MOTION_KEYS = [
  'x',
  'z',
  'vx',
  'vz',
  'face',
  'balance',
  'koUntil',
  'hitAt',
  'hitX',
  'hitZ',
  'nextAttack',
  'nextDash',
  'served',
  'queueTicket',
] as const satisfies readonly (keyof SoulBody)[];
export type MotionKey = (typeof MOTION_KEYS)[number];

/** Owned body state relayed by its simulating client (see bodyMotion). */
export type BodyMotion = Record<MotionKey, number> & {
  id: number;
  input: SoulInput;
  attack: object | null;
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

export function bodyMotion(b: SoulBody | null | undefined): BodyMotion | null {
  if (!b) return null;
  return {
    id: b.id,
    ...(Object.fromEntries(MOTION_KEYS.map((k) => [k, b[k] || 0])) as Record<MotionKey, number>),
    input: { ...b.input },
    attack: b.attack ? structuredClone(b.attack) : null,
    gone: !!b.gone,
    y: b.y ?? null,
    vy: b.vy ?? 0,
    parachute: !!b.parachute,
    grounded: b.grounded !== false,
  };
}
// `m` comes from the network: every field is validated before use.
export function acceptBodyMotion(b: SoulBody, m: BodyMotion | null | undefined): boolean {
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
    guard: !!m.input?.guard,
  };
  b.attack = null;
  b.koUntil = 0;
  b.input.guard = false;
  return true;
}
export function mergeOwnedArena(
  snapshot: Arena,
  previous: Arena | null | undefined,
  entity: SoulEntity,
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
export function relayBodyReport(
  a: Arena,
  actor: SoulBody,
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
