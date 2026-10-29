// Client-owned 2.5D locomotion, collisions and physical queue. Combat uses shared hit points.
export const SOUL_RADIUS = 0.48,
  STEP = 1 / 60;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const QUEUE_SPACING = 1.85,
  NPC_BALANCE = 60,
  NPC_KO_MS = 10000;
export function soulSpawn(index) {
  return { x: 0, z: 1.1 + index * QUEUE_SPACING };
}
// Each NPC has a distinct place. Players reserve space by actually standing in
// the lane; tickets never grant exclusive access to the signing desk.
export function queueTargets(a, now = a.time) {
  const npcs = a.bodies
    .filter((b) => b.kind === 'enemy' && !b.gone && b.koUntil <= now)
    .sort((a, b) => (a.queueTicket ?? a.id) - (b.queueTicket ?? b.id) || a.id - b.id);
  const players = a.bodies.filter(
    (b) => b.kind === 'player' && !b.gone && b.koUntil <= now && Math.abs(b.x) < 1.1,
  );
  const targets = new Map();
  let z = 1.1;
  for (const b of npcs) {
    while (players.some((p) => Math.abs(p.z - z) < QUEUE_SPACING * 0.85)) z += QUEUE_SPACING;
    targets.set(b.id, { x: 0, z });
    z += QUEUE_SPACING;
  }
  return targets;
}
function queueIntent(a, b, target, now) {
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
export function createSoul(s, index, now) {
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
export function inDeskZone(b) {
  return !b.gone && b.z >= 0.48 && Math.hypot(b.x, b.z - 1.1) < 1.25;
}
export function deskOccupant(a, now = a.time) {
  return (
    a.bodies
      .filter((b) => inDeskZone(b) && b.koUntil <= now)
      .sort(
        (x, y) => x.x * x.x + (x.z - 1.1) ** 2 - (y.x * y.x + (y.z - 1.1) ** 2) || x.id - y.id,
      )[0] || null
  );
}
function collide(a, b, owned = () => true, now = 0, verticalUnit = 1) {
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
export function advanceArena(a, to, owner = null) {
  const owned = (b) => !owner || b.entity === owner || (b.kind === 'enemy' && a.host === owner);
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
          if (Number.isFinite(o.y) && Math.abs((b.y ?? o.y) - o.y) > 1.7 * (a.verticalUnit || 1))
            continue;
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
        if (b.served >= 3000) {
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
];
export function bodyMotion(b) {
  if (!b) return null;
  return {
    id: b.id,
    ...Object.fromEntries(MOTION_KEYS.map((k) => [k, b[k] || 0])),
    input: { ...b.input },
    attack: b.attack ? structuredClone(b.attack) : null,
    gone: !!b.gone,
    y: b.y ?? null,
    vy: b.vy ?? 0,
    parachute: !!b.parachute,
    grounded: b.grounded !== false,
  };
}
export function acceptBodyMotion(b, m) {
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
  if (Number.isFinite(m.y) && Math.abs(m.y) < 2000) b.y = m.y;
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
export function mergeOwnedArena(snapshot, previous, entity) {
  const a = structuredClone(snapshot);
  if (!previous || a.epoch !== previous.epoch) return a;
  a.time = previous.time;
  for (const b of a.bodies) {
    const old = previous.bodies.find((p) => p.id === b.id && p.entity === b.entity);
    if (
      old &&
      (b.entity === entity || (b.kind === 'enemy' && a.host === entity && previous.host === entity))
    ) {
      const metadata = { health: b.health, maxHealth: b.maxHealth, enemyType: b.enemyType };
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
export function relayBodyReport(a, actor, report, now) {
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
