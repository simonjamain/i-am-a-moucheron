import { appearanceId } from '../src/character-appearances.ts';
import { prepareRoster, forecast } from './wave-preparation.js';
import { feedingPoint } from '../src/ground-defense-state.js';
import { DEFAULT_BALANCE, money } from '../src/balance.js';
import { deliveryStart, deliveryLanding, deliveryHeightAt } from '../src/delivery.ts';
import {
  newGroundDefense,
  groundCommand,
  groundSnapshot,
  groundFlow,
  damageBarricade,
  floorStructures,
} from '../src/ground-defense-state.js';
import { advanceGroundCrowd } from '../src/ground-crowd.js';
import { clampProximity } from '../src/mobile-flak.js';
import { collisionDamage, washTarget, WASH } from '../src/vehicle-care.js';
import { purchaseCount } from '../src/equipment.ts';
import { bedAccess, bedSpawn } from '../src/beds.ts';
import { impactDamage } from '../src/field-physics.ts';
import { randomUUID } from 'node:crypto';
import { MAP, ACTOR_UNIT, FLAK, enemySizeFactor } from '../src/scale.ts';
import { OFFICE_LAYOUT } from '../src/layout.ts';
import {
  setActiveLayout,
  isLayoutId,
  DEFAULT_LAYOUT_ID,
  layoutSolids,
  LAYOUTS,
} from '../src/layouts.ts';
import { loadRapier } from '../src/physics-world.ts';
import { ParkedHost, isHosted } from '../src/parked-host.ts';
import { DecorCollision } from '../src/office-collision.ts';
import { MODEL_DATA } from '../src/office-pack-data.js';
import {
  VEHICLES,
  vehiclePad,
  vehicleEntry,
  vehicleAccess,
  leftVehiclePad,
  vehicleMaxHP,
  TRAILER_LIMITS,
} from '../src/fleet.ts';
import { AIRDROP_KINDS, airdropCommand, airdropSurface, headingOf } from '../src/airdrop.ts';
import { baseWorld, baseBody, reconcileBase } from '../src/base.ts';
import { relayBodyReport } from '../src/walk-arena.ts';
import {
  createSoul,
  advancePurgatory,
  deskOccupant,
  inVipDesk,
  SOUL_ENTRANCE,
  VIP_LANE,
  vipPrice,
} from '../src/purgatory-queue.ts';
import {
  wavePlan,
  ENEMY_TYPES,
  swarmFrame,
  spawnOffspring,
  assignMidgeSwarmSizes,
  MAX_OFFSPRING_ROSTER,
} from '../src/waves.js';
import { SHOP, shopPrice, supportedPlacement, decorTrust } from '../src/equipment.ts';
import { advancePaidService } from '../src/paid-service.js';
import { SENTRY, GATLING, isTurret, fireGroundSentries } from '../src/ground-sentry.ts';
import { FORTIFICATIONS, isFortification } from '../src/ground-fortifications.ts';
import { FIXED_DCA, RAPID_DCA_DAMAGE, heavyDcaMuzzle, isFixedDca } from '../src/fixed-dca.ts';
import {
  fullAmmo,
  ammoCapacity,
  advanceSupplies,
  FUEL_SECONDS,
  installationCount,
} from '../src/logistics.ts';
import { stationAccess, stationExit } from '../src/sortie.ts';
import { howitzerMuzzle } from '../src/howitzer-geometry.ts';
import { validMotion } from '../src/network.ts';
import { snapshotRosterCore, snapshotRosterKey } from '../src/snapshot-wire.ts';
import { appendDebugEnemy, debugPlacement, standingDummies } from '../src/debug-enemies.ts';
import { newBank, signLoan, settleLoans } from '../src/bank.ts';
import { canUseWeapon, HEAVY, TANK_MG, availableShell } from '../src/armament.ts';
import { PROJECTILES } from '../src/projectiles.ts';
import { sweptSphereMayTouch } from '../src/swept-broadphase.ts';
import { createOrdnance, segmentSphere } from '../src/ordnance.js';
import { StatsLedger } from './stats.ts';

const uid = () => randomUUID();
const values = (m) => [...m.values()];
const LAB_FUNDS = 1000000000;
const clone = (x) => structuredClone(x);
// Maximum age of cached enemy positions used for vehicle contacts (≤ 20 Hz).
export const CONTACT_FRAME_MS = 50;
// Production sharing window of sync snapshots between players of a room.
export const SNAPSHOT_SHARE_MS = 50;
// A pilot without any message for this long leaves the room.
export const PRESENCE_MS = 12000;
// Resumable games keep a silent pilot (hidden after PRESENCE_MS) and its seat
// this long, so that a reconnecting player gets it back. 'leave' ends it at once.
export const RESUME_MS = 30000;
// A launch whose impact has not been reported is forgotten this long after
// the end of its lifetime.
export const IMPACT_GRACE_MS = 3000;
// Parked-vehicle settling: grace after creation, airborne time before a vehicle counts as
// having left the pad, and the minimum gap between two replacement starters of a type.
const SETTLE_MS = 5000;
const AIRBORNE_MS = 1500;
const STARTER_GAP_MS = 10000;
// Active launches kept per room: only protects the room, the shooters simulate them.
export const MAX_ORDNANCE = 10_000;
// Physics of the vehicles nobody drives (src/parked-host.ts). The engine (a 4 MB WebAssembly
// module) is loaded the first time a pilot leaves such an aircraft, and the decor's
// triangles of a layout are built once per process (about 150 ms).
let rapier = null;
let rapierLoading = null;
function physicsEngine() {
  rapierLoading ??= loadRapier(() => import('@dimforge/rapier3d-compat')).then(
    (R) => (rapier = R),
    (error) => {
      console.warn('Physique serveur indisponible :', error?.message ?? error);
    },
  );
  return rapier;
}
const decors = new Map();
function decorFor(layoutId) {
  if (!rapier) return null;
  let decor = decors.get(layoutId);
  if (!decor) {
    const layout = LAYOUTS.find((l) => l.id === layoutId);
    decor = layout ? new DecorCollision(rapier, MODEL_DATA, layout.props) : null;
    decors.set(layoutId, decor);
  }
  return decor;
}
function requireGame(ok, message, status = 409) {
  if (!ok) throw Object.assign(new Error(message), { status });
}
const world = (p) =>
  p.state.awaitingPurgatory
    ? 'observation'
    : p.life === 'alive'
      ? 'office'
      : p.state.realm === 'super'
        ? 'super'
        : 'purgatory';
const signature = (s) => s === true;
const SENTRY_SOURCE = Object.freeze({ item: 'sentry', seat: 'auto', weapon: 'sentry' });
const GATLING_SOURCE = Object.freeze({ item: 'gatling', seat: 'auto', weapon: 'gatling' });
const initialState = () => ({
  p: [OFFICE_LAYOUT.base.originX, OFFICE_LAYOUT.base.departureY, OFFICE_LAYOUT.base.originZ - 8],
  q: [0, 0, 0, 1],
  v: [0, 0, -12],
  hp: 100,
  wing: 1,
  engine: 1,
  fire: false,
});
export function initialStation() {
  const b = OFFICE_LAYOUT.base;
  return {
    x: b.originX + b.refuelOffsetX,
    y: b.deckY + 0.00005,
    z: b.originZ + b.refuelOffsetZ,
    slot: -1,
    kind: 'refuel',
    name: 'Ravitaillement Alpha',
    free: true,
  };
}
function roomState(code, now, layout = DEFAULT_LAYOUT_ID) {
  setActiveLayout(layout);
  return {
    code,
    layout,
    balance: { ...DEFAULT_BALANCE },
    lab: { enabled: false },
    balanceRevision: 0,
    rosterRevision: 0,
    balanceOwnerToken: null,
    plan: null,
    upcomingPlan: null,
    preparation: null,
    created: now,
    touched: now,
    wave: 0,
    started: 0,
    phase: 'prep',
    infestation: 0,
    mission_started: 0,
    next_wave_at: 0,
    dollars: 0,
    rewardCount: 0,
    bank: newBank(),
    pilots: new Map(),
    vehicles: new Map(),
    requests: new Map(),
    souls: new Map(),
    orders: new Map(),
    playerColors: new Map(),
    playerSequence: 0,
    purchases: new Map(),
    deliveries: [],
    bedContracts: new Map(),
    identityTokens: new Map(),
    hits: new Set(),
    kills: new Set(),
    enemyDamage: {},
    equipment: [],
    groundDefense: newGroundDefense(),
    groundDefenseOrders: new Map(),
    sentryClock: 0,
    groundEnabled: false,
    groundAgents: {},
    groundWave: -1,
    groundAt: 0,
    groundNavigation: null,
    groundNavRevision: -1,
    groundBaitFlows: new Map(),
    effects: [],
    ordnance: [],
    ordnanceShots: new Set(),
    fixedDcaShots: new Set(),
    rapidDcaShots: new Map(),
    damageEvents: [],
    damageSeq: 0,
    enemyHits: new Set(),
    sequence: 0,
    soulSeq: 0,
    effectSeq: 0,
    base: { epoch: uid() },
    purgatory: { epoch: uid() },
    super: { epoch: uid() },
  };
}

// What clients need to draw ground insects: position, heading and arrival.
// Steering memory (baits tasted, meals, tapes, wall attacks) stays on the
// server. Precision: 1e-6 map unit (~0.05 % of an ant), 1e-4 for the heading.
const roundTo = (digits) => (value) => +value.toFixed(digits);
const position = roundTo(6),
  heading = roundTo(4);
export function groundAgentsView(agents) {
  const view = {};
  for (const [id, unit] of Object.entries(agents))
    view[id] = {
      p: [position(unit.p[0]), position(unit.p[1])],
      dir: [heading(unit.dir[0]), heading(unit.dir[1])],
      ...(unit.arrived ? { arrived: true } : {}),
    };
  return view;
}

// One synchronous domain operation is one atomic turn of Node's event loop.
// No SQL adapter, database, disk state or asynchronous transaction boundary.
export class Game {
  constructor({
    now = Date.now,
    solids = null,
    roomTTL = 30 * 60_000,
    maxRooms = 128,
    snapshotShareMs = 0,
    resumable = false,
    stats = new StatsLedger(),
  } = {}) {
    this.rooms = new Map();
    // Puissance pratique des équipements (docs/stats.md).
    this.stats = stats;
    this.now = now;
    // > 0: `sync` replies of one room share a snapshot built at most this many
    // ms earlier (see snapshot()). 0 keeps one exact snapshot per command.
    this.snapshotShareMs = snapshotShareMs;
    // true: a closed connection leaves its pilot in place for the presence
    // delay (PRESENCE_MS), so that a new connection can resume it (join with
    // `resume`). false: the pilot expires and releases its seat at once.
    this.resumable = resumable;
    // Colliders of the room being handled; a fixed list (tests) overrides them.
    this.fixedSolids = solids;
    this.roomTTL = roomTTL;
    this.maxRooms = maxRooms;
  }
  get solids() {
    return this.fixedSolids ?? layoutSolids();
  }
  set solids(list) {
    this.fixedSolids = list;
  }
  // Every operation on a room runs with that room's layout active.
  use(r) {
    setActiveLayout(r.layout);
    return r;
  }
  live(r) {
    return values(r.pilots).filter((p) => p.seen > this.now() - PRESENCE_MS);
  }
  join(b) {
    const code = String(b.code || 'BUREAU').toUpperCase();
    requireGame(/^[A-Z0-9]{3,10}$/.test(code), 'Code : 3 à 10 lettres ou chiffres.', 400);
    this.sweep();
    let r = this.rooms.get(code);
    if (!r) {
      requireGame(this.rooms.size < this.maxRooms, 'Le serveur est complet.', 503);
      // The plan is chosen by whoever opens the room, then fixed for its life.
      this.rooms.set(
        code,
        (r = roomState(code, this.now(), isLayoutId(b.layout) ? b.layout : DEFAULT_LAYOUT_ID)),
      );
    }
    this.use(r);
    this.advance(r);
    // Reconnection: reattach the same pilot (body, seat, life, papers) while it
    // is still present. Never creates another pilot: the caller reloads instead.
    if (b.resume !== undefined) {
      const resumed = r.pilots.get(b.resume);
      requireGame(
        this.resumable &&
          typeof b.resume === 'string' &&
          resumed &&
          resumed.seen > this.now() - RESUME_MS &&
          typeof b.resumeKey === 'string' &&
          r.identityTokens.get(resumed.id) === b.resumeKey,
        'Session expirée : rechargez la page.',
        410,
      );
      resumed.seen = this.now();
      r.touched = this.now();
      return clone({
        id: resumed.id,
        resumeKey: b.resumeKey,
        resumed: true,
        state: resumed.state,
        snapshot: this.snapshot(r),
      });
    }
    const active = this.live(r),
      used = new Set(active.map((p) => p.bay));
    requireGame(active.length < 100, 'La partie est complète (100 pilotes).');
    let bay = 0;
    while (used.has(bay)) bay++;
    const resumeKey =
      typeof b.resumeKey === 'string' && r.bedContracts.has(b.resumeKey) ? b.resumeKey : uid();
    if (!r.bedContracts.has(resumeKey)) {
      if (r.bedContracts.size >= 2048) {
        const activeTokens = new Set(r.identityTokens.values());
        for (const key of r.bedContracts.keys())
          if (key !== r.balanceOwnerToken && !activeTokens.has(key)) {
            r.bedContracts.delete(key);
            r.playerColors.delete(key);
            break;
          }
      }
      r.bedContracts.set(resumeKey, null);
    }
    const p = {
      id: uid(),
      bedId: r.bedContracts.get(resumeKey),
      room: code,
      name:
        String(b.name || 'Pilote')
          .trim()
          .slice(0, 20) || 'Pilote',
      // Character picked on the home screen; unknown values fall back to the default.
      appearance: appearanceId(b.appearance),
      bay,
      colorSequence:
        r.playerColors.get(resumeKey) ||
        (r.playerColors.set(resumeKey, ++r.playerSequence), r.playerSequence),
      seen: this.now(),
      life: 'alive',
      mode: 'foot',
      health: 100,
      incarnation: 0,
      board_paper: 0,
      vehicle_id: null,
      seat: null,
      occupation: 0,
      state: initialState(),
    };
    r.balanceOwnerToken ??= resumeKey;
    r.pilots.set(p.id, p);
    r.identityTokens.set(p.id, resumeKey);
    r.touched = this.now();
    return clone({ id: p.id, resumeKey, state: p.state, snapshot: this.snapshot(r) });
  }
  player(code, id) {
    const r = this.rooms.get(code),
      p = r?.pilots.get(id);
    requireGame(p, 'Connexion expirée. Rechargez la page.', 401);
    return { r: this.use(r), p };
  }
  release(r, p) {
    p.occupation++;
    const v = r.vehicles.get(p.vehicle_id);
    if (v?.seats.get(p.seat) === p.id) v.seats.delete(p.seat);
    p.vehicle_id = null;
    p.seat = null;
  }
  disconnect(code, id) {
    const r = this.rooms.get(code),
      p = r?.pilots.get(id);
    if (!p) return;
    this.use(r);
    // A resumable pilot stays until its presence expires (advance() then
    // releases its seat and refunds its orders), unless a connection resumes it.
    if (this.resumable) return;
    this.release(r, p);
    p.seen = this.now() - (PRESENCE_MS + 1);
  }
  sweep() {
    for (const [code, r] of this.rooms)
      if (!this.live(r).length && this.now() - r.touched > this.roomTTL) {
        r.parkedHost?.dispose();
        this.rooms.delete(code);
      }
  }
  fleet(r) {
    // The parked ones are judged by advanceParked (with its tolerance); the others, here.
    for (const vehicle of r.vehicles.values())
      if (!vehicle.state.landed && !vehicle.hosted) vehicle.ready = 0;
    // A replacement starter at most every STARTER_GAP_MS per type: whatever happens to the
    // vehicles, the pad never refills in a loop.
    r.starterAt ??= {};
    const used = {};
    for (const v of r.vehicles.values()) if (v.origin === 'starter' && v.seats.size) v.used = true;
    for (const v of r.vehicles.values()) if (v.origin === 'starter') used[v.type] = !!v.used;
    for (const type of ['fighter', 'bomber', 'tank'])
      if (
        !values(r.vehicles).some(
          (v) => v.type === type && v.origin === 'starter' && v.ready && v.state.hp > 0,
        ) &&
        // None left, or a pilot has used the previous one: replace at once. Otherwise (it died
        // or left the pad unflown) wait, so that nothing can refill the pad in a loop.
        (used[type] !== false || this.now() - (r.starterAt[type] ?? -Infinity) >= STARTER_GAP_MS)
      ) {
        r.starterAt[type] = this.now();
        this.createVehicle(r, type, 'starter');
      }
    for (const v of r.vehicles.values()) {
      const now = Math.max(this.now(), v.updated);
      v.supplies = {
        ...v.supplies,
        ...advanceSupplies(v.supplies, v.state, v.type, [], (now - v.updated) / 1000, r.balance),
        revision: v.supplies.revision + 1,
      };
      v.updated = now;
    }
    const now = this.now();
    const elapsed = Math.max(0, now - (r.lastPaidServiceAt ?? r.created));
    if (elapsed >= 1000) {
      const result = advancePaidService(
        values(r.vehicles),
        [...r.equipment, initialStation()],
        r.dollars,
        r.balance,
        Math.min(5, Math.floor(elapsed / 1000)),
        r.groundDefense,
      );
      r.dollars = result.dollars;
      r.lastPaidServiceAt = now;
      if (!r.lab.enabled)
        for (const [item, dollars] of Object.entries(result.spentBy))
          this.stats.service(r, item, dollars);
    }
  }
  createVehicle(r, type, origin = 'purchase', placement = null) {
    const id = uid(),
      state = vehiclePad(type);
    const near = values(r.vehicles).filter((v) => v.type === type && v.state.hp > 0).length;
    if (placement) {
      state.p = [placement.x, placement.y + VEHICLES[type].gear, placement.z];
      if (Number.isFinite(placement.angle))
        state.q = [0, Math.sin(placement.angle / 2), 0, Math.cos(placement.angle / 2)];
    } else {
      // A starter only counts the vehicles still standing on its pad: a replacement must not
      // be born inside the one it replaces (the physics would blow both up).
      const reach = MAP.metres(VEHICLES[type].span + VEHICLES[type].length);
      const crowd =
        origin === 'starter'
          ? values(r.vehicles).filter(
              (v) =>
                v.type === type &&
                v.state.hp > 0 &&
                Math.hypot(v.state.p[0] - state.p[0], v.state.p[2] - state.p[2]) < reach,
            ).length
          : near;
      if (crowd) {
        state.p[0] += (crowd % 4) * MAP.metres(VEHICLES[type].span + 5);
        state.p[2] += Math.ceil(crowd / 4) * MAP.metres(VEHICLES[type].length + 5);
      }
    }
    const vehicle = {
      id,
      origin,
      room: r.code,
      type,
      state,
      dirt: 0,
      ready: 1,
      created: this.now(),
      seats: new Map(),
      updated: this.now(),
      shots: new Set(),
      supplies: {
        fuel: FUEL_SECONDS * r.balance.fuel,
        ammo: fullAmmo(type, r.balance),
        sequence: ++r.sequence,
        revision: 0,
      },
    };
    // Born in the room's physics world like any parked vehicle: it settles on the pad, then
    // sleeps. `settleUntil`: while it settles it cannot count as having left the pad.
    if (isHosted(type)) {
      vehicle.hosted = true;
      vehicle.settleUntil = vehicle.created + SETTLE_MS;
    }
    r.vehicles.set(id, vehicle);
    return vehicle;
  }
  base(r, p = null, report = null) {
    reconcileBase(
      r.base,
      this.live(r).map((p) => ({ ...p, state: JSON.stringify(p.state) })),
      this.now(),
    );
    r.base.time = this.now();
    r.base.revision = (r.base.revision || 0) + 1;
    const body = p && r.base.bodies.find((b) => b.entity === p.id);
    if (body) relayBodyReport(r.base, body, report, this.now());
    return body;
  }
  soul(r, kind, entity, name, realm = 'purgatory', enemy_type = 'midge') {
    const s = {
      id: ++r.soulSeq,
      room: r.code,
      kind,
      entity,
      name,
      realm,
      enemy_type,
      place: r.soulSeq,
      paper: 0,
      status: 'waiting',
      damage: 0,
    };
    r.souls.set(s.id, s);
    return s;
  }
  releaseSoul(r, s) {
    if (s.status !== 'waiting') return;
    s.status = 'gone';
    if (s.kind === 'enemy') this.reward(r, ENEMY_TYPES[s.enemy_type].power);
  }
  reward(r, amount) {
    const credit = money(amount, r.balance.rewards);
    r.dollars = money(r.dollars + credit);
    const accumulated = money((r.rewardFraction || 0) + credit);
    r.rewardCount += Math.floor(accumulated);
    r.rewardFraction = money(accumulated % 1);
  }
  arena(r, realm, p = null, report = null) {
    const a = r[realm],
      now = this.now();
    const rows = values(r.souls).filter((s) => s.realm === realm && s.status === 'waiting');
    const shown = [
      ...rows.filter((s) => s.kind === 'player'),
      ...rows.filter((s) => s.kind === 'enemy').slice(0, 24),
    ];
    const ids = new Set(shown.map((s) => s.id));
    a.bodies = (a.bodies || []).filter((b) => ids.has(b.id));
    a.events ??= [];
    a.eventSeq ??= 0;
    a.time ??= now;
    for (const [i, s] of shown.entries()) {
      let b = a.bodies.find((b) => b.id === s.id);
      if (!b) {
        b = createSoul(s, i, now);
        // Players appear before both queues: the insects' (free) and the VIP lane.
        if (s.kind === 'player')
          Object.assign(b, { x: SOUL_ENTRANCE.x, z: SOUL_ENTRANCE.z + (i % 4) * 0.6 });
        a.bodies.push(b);
      }
      b.paper = s.paper;
      b.vip = !!s.vip;
      b.maxHealth = s.kind === 'enemy' ? ENEMY_TYPES[s.enemy_type].hp : 100;
      b.health =
        s.kind === 'enemy' ? b.maxHealth - s.damage : (r.pilots.get(s.entity)?.health ?? 100);
      b.enemyType = s.enemy_type;
    }
    // The VIP lane's ropes stand only in the ordinary purgatory.
    if (realm === 'purgatory') a.obstacles = VIP_LANE;
    a.host =
      shown
        .filter((s) => s.kind === 'player')
        .map((s) => s.entity)
        .sort()[0] || null;
    if (!a.host) advancePurgatory(a, now);
    else a.time = now;
    const body = p && a.bodies.find((b) => b.entity === p.id && b.kind === 'player');
    if (body) relayBodyReport(a, body, report, now);
    for (const b of a.bodies) if (b.gone) this.releaseSoul(r, r.souls.get(b.id));
    a.desk = deskOccupant(a)?.id ?? null;
    a.events = a.events.slice(-128);
    a.revision = (a.revision || 0) + 1;
    return body;
  }
  advanceGround(r, now) {
    // Ground insects always walk the shared flow field, with or without defenses,
    // with local crowd avoidance around the preparation forecast.
    if (r.phase !== 'combat') return;
    const elapsed = (now - r.started) / 1000;
    if (r.groundWave !== r.wave) {
      r.groundAgents = {};
      r.groundWave = r.wave;
      r.groundAt = r.groundEnabled ? 0 : elapsed;
      r.groundNavigation = null;
      r.groundNavRevision = -1;
    }
    r.groundEnabled = true;
    if (r.groundNavRevision !== r.groundDefense.navigationRevision) {
      r.groundNavigation = groundFlow(r.groundDefense);
      r.groundBaitFlows = new Map();
      r.groundNavRevision = r.groundDefense.navigationRevision;
    }
    const previous = Math.min(elapsed, r.groundAt);
    r.groundAt = elapsed;
    const baitFlow = (bait) => {
      if (!r.groundBaitFlows.has(bait.id)) {
        let path = null;
        try {
          path = groundFlow(r.groundDefense, feedingPoint(bait));
        } catch {
          // An obstructed sachet cannot be reached: creatures resume their bin goal.
        }
        r.groundBaitFlows.set(bait.id, path);
      }
      return r.groundBaitFlows.get(bait.id);
    };
    const world = {
      structures: floorStructures(r.groundDefense.structures),
      goalFlow: r.groundNavigation,
      baitFlow,
      damageWall: (id, amount) => damageBarricade(r.groundDefense, id, amount),
    };
    const roster = this.plan(r).roster;
    advanceGroundCrowd(r.groundAgents, roster, r.kills, previous, elapsed, world);
  }
  advanceSentries(r, now) {
    if (
      r.phase !== 'combat' ||
      !r.groundDefense.structures.some((s) => isTurret(s.kind) && s.hp > 0 && s.ammo >= 1)
    )
      return;
    const gatling = r.groundDefense.structures.some((s) => s.kind === 'gatling');
    if (now - r.sentryClock < (gatling ? GATLING.intervalMs / 2 : SENTRY.intervalMs)) return;
    r.sentryClock = now;
    const plan = this.plan(r);
    const frames = swarmFrame(plan.roster, (now - r.started) / 1000, r.groundAgents);
    const targets = frames.map((frame, index) =>
      frame && !r.kills.has(index) && (r.enemyDamage[index] || 0) < plan.roster[index].hp
        ? { id: index, p: frame.p, dead: false }
        : null,
    );
    // A Gatling fires up to two rounds per server tick: one effect per turret
    // and tick carries the count, the client spreads the rounds over time.
    const bursts = new Map();
    const fired = fireGroundSentries(
      r.groundDefense.structures,
      targets,
      now,
      (target, sentry, damage) => {
        const id = target.id;
        this.creditEnemy(
          r,
          sentry.kind === 'gatling' ? GATLING_SOURCE : SENTRY_SOURCE,
          id,
          plan.roster[id],
          damage * r.balance.damage,
        );
        r.enemyDamage[id] = (r.enemyDamage[id] || 0) + damage * r.balance.damage;
        if (r.enemyDamage[id] >= plan.roster[id].hp) {
          this.defeatEnemy(r, id, target.p);
          target.dead = true;
        }
        const burst = bursts.get(sentry.id);
        if (burst) {
          burst.shots++;
          burst.target = target.p;
          return;
        }
        const effect = {
          id: ++r.effectSeq,
          kind: 'sentry-shot',
          sentry: sentry.id,
          p: [sentry.position[0], (sentry.y || 0) + 0.03, sentry.position[1]],
          target: target.p,
          at: now,
        };
        if (sentry.kind === 'gatling') {
          effect.turret = 'gatling';
          effect.shots = 1;
          bursts.set(sentry.id, effect);
        }
        r.effects.push(effect);
      },
    );
    if (fired) r.groundDefense.revision++;
  }
  // ------------------------------------------------------------ statistiques
  // Poste tenu par un pilote vivant : { item, seat }, ou null (docs/stats.md).
  statSeat(r, p) {
    if (p.life !== 'alive') return null;
    if (p.mode === 'turret') {
      const kind = r.equipment[p.state?.turret]?.kind;
      return kind ? { item: kind, seat: 'operator' } : null;
    }
    const v = p.vehicle_id ? r.vehicles.get(p.vehicle_id) : null;
    if (v && p.seat) return { item: v.type, seat: p.seat };
    return null;
  }
  hitSource(r, p, b, rapid) {
    const seat = this.statSeat(r, p);
    if (!seat) return null;
    if (rapid) return { ...seat, weapon: 'rapid' };
    return { ...seat, weapon: typeof b.weapon === 'string' ? b.weapon.slice(0, 24) : 'mg' };
  }
  heavySource(r, p, shot) {
    const station = shot.station == null ? null : r.equipment[shot.station];
    if (station?.kind) return { item: station.kind, seat: 'operator', weapon: shot.weapon };
    const v = shot.vehicle ? r.vehicles.get(shot.vehicle) : null;
    if (!v) return null;
    return {
      item: v.type,
      seat: p.vehicle_id === v.id && p.seat ? p.seat : '?',
      weapon: shot.weapon,
    };
  }
  // Credits the shooter's seat with the share of the enemy's power the damage
  // removes: no last-hit bias, nothing for damage beyond the remaining HP.
  creditEnemy(r, source, index, enemy, amount) {
    if (r.lab.enabled || !source || !enemy || !(enemy.hp > 0)) return;
    const done = r.enemyDamage[index] || 0,
      effective = Math.max(0, Math.min(amount, enemy.hp - done));
    if (effective > 0)
      this.stats.credit(
        r,
        source,
        (effective / enemy.hp) * enemy.power,
        enemy.ground ? 'ground' : 'air',
      );
  }
  // Seat-seconds of the crews in combat; the clock only runs during a wave.
  sampleStats(r, now) {
    const dt = this.stats.step(r, now, r.phase === 'combat' && !r.lab.enabled);
    if (!dt) return;
    for (const p of r.pilots.values()) {
      const seat = this.statSeat(r, p);
      if (seat) this.stats.occupy(r, seat.item, seat.seat, dt);
    }
    for (const v of r.vehicles.values())
      if (v.seats.size && v.state.hp > 0)
        this.stats.vehicleTime(r, v.type, VEHICLES[v.type].seats.length, dt);
  }
  advance(r) {
    this.use(r);
    if (r.lab.enabled) r.dollars = LAB_FUNDS;
    const now = this.now();
    this.sampleStats(r, now);
    this.advanceGround(r, now);
    this.advanceSentries(r, now);
    this.expireOrdnance(r, now);
    this.advanceParked(r, now);
    this.vehicleContacts(r, now);
    // A destroyed hull can arrive through motion before the client's death
    // command. Resolve its crew here even if that client disconnects.
    for (const p of r.pilots.values()) {
      if (p.mode !== 'turret' || p.life !== 'alive') continue;
      const station = r.equipment[p.state.turret];
      if (isFortification(station?.kind) && station.hp <= 0) this.kill(r, p, p.incarnation);
    }
    for (const v of r.vehicles.values())
      if (v.state.hp <= 0) {
        if (!v.statLost && !r.lab.enabled) {
          v.statLost = true;
          this.stats.loss(r, v.type);
        }
        for (const id of [...v.seats.values()]) {
          const mate = r.pilots.get(id);
          if (mate) this.kill(r, mate, mate.incarnation);
          else for (const [seat, occupant] of v.seats) if (occupant === id) v.seats.delete(seat);
        }
      }
    for (const [id, p] of r.pilots)
      if (p.seen <= now - (this.resumable ? RESUME_MS : PRESENCE_MS)) {
        this.release(r, p);
        for (const s of r.souls.values())
          if (s.kind === 'player' && s.entity === id) s.status = 'gone';
        r.pilots.delete(id);
        r.identityTokens.delete(id);
        for (const [token, order] of r.purchases)
          if (order.owner === id && !order.placed) {
            r.dollars += order.price;
            r.purchases.delete(token);
          }
      }
    for (const q of r.requests.values())
      if (['signing', 'offered'].includes(q.status)) {
        const a = r.pilots.get(q.requester),
          b = r.pilots.get(q.recipient);
        if (
          now - q.created > 120000 ||
          !a ||
          a.life !== 'alive' ||
          a.vehicle_id !== q.vehicle ||
          a.seat !== q.from_seat ||
          (q.recipient &&
            (!b || b.life !== 'alive' || b.vehicle_id !== q.vehicle || b.seat !== q.to_seat))
        )
          q.status = 'cancelled';
      }
    if (r.phase === 'prep' && r.mission_started && r.next_wave_at && now >= r.next_wave_at)
      this.startWave(r);
    const plan = this.plan(r);
    const escaped = plan.roster.filter(
      (e, i) =>
        !r.kills.has(i) &&
        (e.ground && r.groundEnabled
          ? r.groundAgents[e.id]?.arrived === true
          : (now - r.started) / 1000 >= e.spawn + e.duration),
    );
    if (r.phase === 'combat' && r.kills.size + escaped.length >= plan.roster.length) {
      const leaked = escaped.reduce((n, e) => n + e.power, 0);
      r.infestation = money(r.infestation + leaked);
      if (!r.lab.enabled)
        this.stats.flush(r, {
          wave: r.wave,
          n: r.pilots.size,
          power: plan.roster.reduce((n, e) => n + e.power, 0),
          killed: plan.roster.reduce((n, e, i) => n + (r.kills.has(i) ? e.power : 0), 0),
          leaked,
          lost: r.infestation >= 20,
        });
      // Debug mode: bin damage keeps counting, but the room cannot be lost.
      r.phase = r.infestation >= 20 && !r.lab.enabled ? 'lost' : 'prep';
      r.next_wave_at = now + r.balance.pause * 1000;
      if (r.phase === 'prep') {
        this.prepareWave(r);
      }
      r.dollars = Math.round(r.dollars * 100 - settleLoans(r.bank, r.wave)) / 100;
    }
    this.advanceDeliveries(r, now);
    this.advanceGroundDrops(r, now);
    this.fleet(r);
    this.base(r);
    this.arena(r, 'purgatory');
    this.arena(r, 'super');
    r.effects = r.effects.filter((e) => e.at > now - 15000);
    r.damageEvents = r.damageEvents.filter((e) => e.at > now - 15000).slice(-256);
    for (const [id, s] of r.souls) if (s.status === 'gone') r.souls.delete(id);
    for (const [id, v] of r.vehicles) {
      if (v.state.hp <= 0 && !v.seats.size) {
        if (!v.crashEmitted) {
          v.crashEmitted = true;
          r.effects.push({
            id: ++r.effectSeq,
            kind: 'crash',
            vehicle: v.id,
            type: v.type,
            p: v.state.p,
            q: v.state.q,
            v: v.state.v,
            at: now,
          });
        }
        v.retiredAt ??= now;
        if (now - v.retiredAt > 15000) r.vehicles.delete(id);
      }
    }
    // Completed administrative records need no permanent archive on the server.
    for (const [id, q] of r.requests)
      if (!['signing', 'offered'].includes(q.status)) r.requests.delete(id);
    if (r.lab.enabled) r.dollars = LAB_FUNDS;
  }
  resetRoom(r, lab = r.lab) {
    this.stats.discard(r);
    const pilots = r.pilots;
    const identities = r.identityTokens;
    const balance = r.balance;
    const owner = r.balanceOwnerToken;
    const revision = r.balanceRevision;
    r.parkedHost?.dispose();
    r.parkedHost = null;
    Object.assign(r, roomState(r.code, this.now(), r.layout));
    r.balance = balance;
    r.balanceOwnerToken = owner;
    r.balanceRevision = revision + 1;
    r.lab = lab;
    r.dollars = lab.enabled ? LAB_FUNDS : balance.startingMoney;
    r.pilots = pilots;
    r.identityTokens = identities;
    r.playerSequence = Math.max(0, ...values(pilots).map((pilot) => pilot.colorSequence || 0));
    for (const pilot of pilots.values())
      r.playerColors.set(identities.get(pilot.id), pilot.colorSequence);
    for (const token of identities.values()) r.bedContracts.set(token, null);
    for (const pilot of pilots.values())
      Object.assign(pilot, {
        life: 'alive',
        health: 100,
        incarnation: pilot.incarnation + 1,
        occupation: pilot.occupation + 1,
        mode: 'foot',
        vehicle_id: null,
        seat: null,
        board_paper: 0,
        state: initialState(),
        bedId: null,
      });
  }
  setLabWave(r, wave) {
    requireGame(
      Number.isSafeInteger(wave) && wave >= 1 && wave <= 100,
      'Vague : entier de 1 à 100.',
      400,
    );
    r.wave = wave - 1;
    r.phase = 'prep';
    r.plan = { budget: 0, roster: [] };
    r.upcomingPlan = null;
    r.preparation = null;
    r.started = 0;
    r.mission_started = 1;
    r.next_wave_at = 0;
    r.infestation = 0;
    r.kills.clear();
    r.enemyDamage = {};
    r.enemyHits.clear();
    r.rosterRevision = 0;
    r.groundEnabled = false;
    r.groundAgents = {};
    r.groundWave = -1;
    r.groundAt = 0;
    r.ordnance = [];
    r.ordnanceShots.clear();
    r.fixedDcaShots.clear();
    r.rapidDcaShots.clear();
    this.prepareWave(r);
  }
  labCommand(r, b) {
    requireGame(b.epoch === r.base.epoch, 'La partie a changé ; rouvrez le mode debug.', 409);
    const action = b.action;
    if (action === 'enable') {
      requireGame(!r.lab.enabled, 'Le mode debug est déjà actif.');
      r.lab.enabled = true;
      r.dollars = LAB_FUNDS;
      if (!r.mission_started) this.setLabWave(r, 1);
      return;
    }
    // Enemies placed from the shop's debug columns (debug-enemies.ts), one per
    // order, appended to the running wave like a brood.
    if (action === 'place' || action === 'clear-dummies') {
      requireGame(r.lab.enabled, 'Activez le mode debug pour poser un ennemi.');
      requireGame(r.phase === 'combat', 'Lancez une vague pour poser un ennemi.');
      const plan = this.plan(r);
      if (action === 'clear-dummies') {
        for (const index of standingDummies(plan.roster, r.kills)) r.kills.add(index);
        return;
      }
      let placement;
      try {
        placement = debugPlacement(b);
      } catch (error) {
        requireGame(false, error.message, 400);
      }
      appendDebugEnemy(plan.roster, placement, {
        time: (this.now() - r.started) / 1000,
        balance: r.balance,
        seq: (r.debugEnemySeq = (r.debugEnemySeq || 0) + 1),
      });
      r.rosterRevision++;
      return;
    }
    // Issue #135: debug is otherwise a plain toggle; the former test tools
    // (cards, waves, scenarios) are gone. Leaving resets the game so no test
    // progress leaks into a normal game.
    requireGame(action === 'exit', 'Action de debug inconnue.', 400);
    requireGame(r.lab.enabled, 'Le mode debug est déjà inactif.');
    this.resetRoom(r, { enabled: false });
  }
  plan(r) {
    return r.plan || wavePlan(r.code, r.wave, r.started);
  }
  prepareWave(r) {
    // N counts every pilot of the room, those in purgatory included.
    const players = Math.max(1, r.pilots.size);
    r.upcomingPlan = prepareRoster(r.wave + 1, r.balance, undefined, players);
    r.preparation = {
      id: uid(),
      wave: r.wave + 1,
      power: money(r.upcomingPlan.budget),
      players,
      groups: forecast(r.upcomingPlan.roster),
    };
  }
  startWave(r) {
    if (r.preparation?.wave !== r.wave + 1) this.prepareWave(r);
    r.phase = 'combat';
    r.wave++;
    r.started = this.now();
    r.plan = r.upcomingPlan;
    r.upcomingPlan = r.preparation = null;
    r.rosterRevision = 0;
    r.next_wave_at = 0;
    r.kills.clear();
    r.enemyDamage = {};
    r.enemyHits.clear();
  }
  // Room snapshot for one reply. The room part (everything but the roster) is
  // cloned once; with snapshotShareMs and `share`, sync replies of all players
  // reuse it for at most that long instead of rebuilding and cloning the room
  // per player. Any other command rebuilds it, so its effects are seen at once.
  snapshot(r, { rosterKey = null, rosterMeta = null, share = false } = {}) {
    const now = this.now(),
      cached = r.sharedSnapshot;
    let room;
    if (
      share &&
      this.snapshotShareMs > 0 &&
      cached &&
      cached.key === snapshotRosterKey(r) &&
      now >= cached.at &&
      now - cached.at < this.snapshotShareMs
    )
      room = cached.room;
    else {
      this.advance(r);
      room = this.roomSnapshot(r);
      r.sharedSnapshot =
        this.snapshotShareMs > 0 ? { at: now, key: snapshotRosterKey(r), room } : null;
    }
    const plan = this.plan(r);
    return {
      ...room,
      ...(rosterKey === snapshotRosterKey(r)
        ? {}
        : rosterMeta?.core === snapshotRosterCore(r) &&
            rosterMeta.revision < r.rosterRevision &&
            rosterMeta.total < plan.roster.length
          ? { rosterAdd: clone(plan.roster.slice(rosterMeta.total)) }
          : { roster: clone(plan.roster) }),
      // The reply time stays exact: clients time the swarm from it.
      now,
      sentAt: now,
    };
  }
  roomSnapshot(r) {
    this.use(r);
    const now = this.now(),
      plan = this.plan(r),
      activePilots = this.live(r),
      pendingInstallations = Object.fromEntries(Object.keys(SHOP).map((item) => [item, 0])),
      purchases = [],
      arrived = [];
    for (const order of r.purchases.values())
      if (!order.placed) {
        pendingInstallations[order.item]++;
        const { token, item, owner, price } = order;
        purchases.push({ token, item, owner, price });
      }
    const bodies = {
      purgatory: new Map(r.purgatory.bodies.map((b) => [b.id, b])),
      super: new Map(r.super.bodies.map((b) => [b.id, b])),
    };
    const souls = { purgatory: [], super: [] };
    for (const soul of r.souls.values()) {
      if (soul.status !== 'waiting') continue;
      const body = bodies[soul.realm]?.get(soul.id);
      if (body)
        souls[soul.realm].push({
          ...soul,
          hp: body.health,
          body,
        });
    }
    const elapsed = (now - r.started) / 1000;
    for (const [index, enemy] of plan.roster.entries())
      if (
        !r.kills.has(index) &&
        (enemy.ground && r.groundEnabled
          ? r.groundAgents[enemy.id]?.arrived === true
          : elapsed >= enemy.spawn + enemy.duration)
      )
        arrived.push(enemy.id);
    const arrivedPower = arrived.reduce((sum, id) => sum + (plan.roster[id]?.power ?? 0), 0);
    return clone({
      code: r.code,
      balance: r.balance,
      ...(r.lab.enabled ? { lab: { enabled: true } } : {}),
      balanceRevision: r.balanceRevision,
      rosterRevision: r.rosterRevision,
      balanceOwner: activePilots
        .filter((p) => r.identityTokens.get(p.id) === r.balanceOwnerToken)
        .map((p) => p.id),
      wave: r.wave,
      started: r.started,
      phase: r.phase,
      infestation: r.infestation,
      mission_started: r.mission_started,
      next_wave_at: r.next_wave_at,
      preparation: r.preparation,
      groundNavigationActive: r.groundEnabled || r.groundDefense.structures.length > 0,
      dollars: r.dollars,
      bank: r.bank,
      rewardCount: r.rewardCount,
      equipment: r.equipment,
      groundDefense: groundSnapshot(r.groundDefense, this.now()),
      groundAgents: r.groundEnabled ? groundAgentsView(r.groundAgents) : {},
      deliveries: r.deliveries,
      pendingInstallations,
      purchases,
      initialStation: initialStation(),
      kills: valuesSet(r.kills),
      pilots: activePilots,
      vehicles: values(r.vehicles).map(
        ({ shots, updated, seats, contacts, contactPosition, contactWave, ...v }) => ({
          ...v,
          seats: [...seats].map(([seat, pilot]) => ({ vehicle: v.id, seat, pilot })),
        }),
      ),
      seatRequests: values(r.requests),
      effects: r.effects.slice(-64),
      ordnance: r.ordnance,
      difficulty: r.wave ? money(plan.budget) : 0,
      enemyDamage: r.enemyDamage,
      layout: r.layout,
      mapScale: { numerator: MAP.numerator, denominator: MAP.denominator },
      total: plan.roster.length,
      arrived,
      leaked: r.phase === 'combat' ? arrived.length : 0,
      leakedPower: r.phase === 'combat' ? money(arrivedPower) : 0,
      now,
      sentAt: now,
      souls: souls.purgatory,
      arena: r.purgatory,
      superSouls: souls.super,
      superArena: r.super.bodies.length ? r.super : null,
      base: r.base,
      damage: [],
    });
  }
  assign(r, p, v, seat, token) {
    this.release(r, p);
    p.occupation++;
    v.seats.set(seat, p.id);
    p.vehicle_id = v.id;
    p.seat = seat;
    p.mode = seat === 'pilot' ? 'flight' : 'crew';
    p.board_paper = 2;
    p.state = {
      ...p.state,
      ...v.state,
      vehicle: v.id,
      seat,
      parked: null,
      fire: false,
      boarding: null,
      permits: [...new Set([...(p.state.permits || []), v.id])],
    };
  }
  kill(r, p, incarnation) {
    if (p.state.awaitingPurgatory) return;
    if (incarnation !== undefined && incarnation !== null && incarnation !== p.incarnation) return;
    if (incarnation == null && p.life === 'dead') return;
    const before = world(p),
      realm = before === 'office' ? 'purgatory' : 'super';
    const deathPosition = this.playerPosition(r, p) || p.state.p;
    this.release(r, p);
    for (const arena of [r.base, r.purgatory, r.super])
      if (arena.bodies) arena.bodies = arena.bodies.filter((b) => b.entity !== p.id);
    for (const s of r.souls.values())
      if (s.kind === 'player' && s.entity === p.id) s.status = 'gone';
    p.life = 'dead';
    p.health = 100;
    p.incarnation++;
    p.mode = 'foot';
    p.board_paper = 0;
    p.state = {
      ...initialState(),
      realm,
      awaitingPurgatory: before !== 'super',
      observationRealm: before,
      deathPosition,
    };
    if (before === 'super') this.soul(r, 'player', p.id, p.name, realm);
  }
  sync(r, p, b) {
    if (p.state.awaitingPurgatory) return;
    if (
      (b.incarnation !== undefined && b.incarnation !== p.incarnation) ||
      (b.occupation !== undefined && b.occupation !== p.occupation)
    )
      return;
    requireGame(validMotion(b.state), 'État invalide.', 400);
    const s = b.state,
      old = p.state,
      flying = p.life === 'alive' && p.mode === 'flight' && b.mode === 'flight';
    const safe = {
      ...old,
      p: flying ? s.p : old.p,
      q: flying ? s.q : old.q,
      v: flying ? s.v : old.v,
      hp: Math.max(0, Math.min(vehicleMaxHP(r.vehicles.get(p.vehicle_id)?.type), s.hp)),
      type: r.vehicles.get(p.vehicle_id)?.type,
      rotorPower: Number.isFinite(s.rotorPower) ? Math.max(0, Math.min(1, s.rotorPower)) : 1,
      collective: Number.isFinite(s.collective) ? Math.max(-1, Math.min(1, s.collective)) : 0,
      wing: s.wing,
      engine: s.engine,
      fire: (flying || ['crew', 'turret'].includes(p.mode)) && s.fire,
      ground: s.ground || null,
      gas: Number.isFinite(s.gas) ? Math.max(0, Math.min(1, s.gas)) : (old.gas ?? 0.65),
      omega:
        Array.isArray(s.omega) && s.omega.length === 3 && s.omega.every(Number.isFinite)
          ? s.omega
          : old.omega || [0, 0, 0],
      trailerAngle: Number.isFinite(s.trailerAngle)
        ? Math.max(-TRAILER_LIMITS.yaw, Math.min(TRAILER_LIMITS.yaw, s.trailerAngle))
        : 0,
      trailerPitch: Number.isFinite(s.trailerPitch)
        ? Math.max(-TRAILER_LIMITS.pitch, Math.min(TRAILER_LIMITS.pitch, s.trailerPitch))
        : 0,
      steer: Number.isFinite(s.steer) ? Math.max(-1, Math.min(1, s.steer)) : 0,
      landed: flying ? !!s.landed : !!old.landed,
      aimPoint:
        Array.isArray(s.aimPoint) &&
        s.aimPoint.length === 3 &&
        s.aimPoint.every((v) => Number.isFinite(v) && Math.abs(v) < 10000)
          ? [...s.aimPoint]
          : undefined,
      turretDirection:
        Array.isArray(s.turretDirection) &&
        s.turretDirection.length === 3 &&
        s.turretDirection.every(Number.isFinite)
          ? s.turretDirection
          : [0, 0.3, -1],
    };
    p.state = safe;
    const v = r.vehicles.get(p.vehicle_id);
    if (v && p.seat === 'pilot' && flying) {
      v.state = {
        ...safe,
        hp: safe.hp === v.reportedHP ? v.state.hp : Math.min(v.state.hp, safe.hp),
        type: v.type,
      };
      v.reportedHP = safe.hp;
      if (!v.state.landed || v.state.hp <= 0) v.ready = 0;
    }
    // Motion reports have no vacant aircraft. Avoid sorting all connected pilots
    // 20 times/second per player just to iterate over an empty report list.
    if (p.life === 'alive' && p.mode === 'foot') this.base(r, p, b.ground);
    if (p.life === 'dead') this.arena(r, world(p), p, b.ground);
  }
  command(code, id, path, b = {}, options = {}) {
    const { r, p } = this.player(code, id);
    this.advance(r);
    requireGame(r.pilots.has(id), 'Connexion expirée. Rechargez la page.', 401);
    p.seen = this.now();
    r.touched = this.now();
    requireGame(
      !p.state.awaitingPurgatory ||
        [
          'sync',
          'enter-purgatory',
          'reset',
          'lab',
          'start',
          'leave',
          // A shell still in flight when its shooter dies keeps its effect.
          'heavy-impact',
          'heavy-bounce',
          'fixed-dca-impacts',
        ].includes(path),
      'Accédez au purgatoire avant d’agir.',
    );
    if (path === 'leave') {
      // Deliberate departure (tab closed): free the seat and leave at once.
      this.release(r, p);
      p.seen = this.now() - (RESUME_MS + 1);
    } else if (path === 'enter-purgatory') {
      requireGame(b.incarnation === p.incarnation && p.life === 'dead', 'Décès périmé.');
      if (p.state.awaitingPurgatory) {
        p.state.awaitingPurgatory = false;
        this.soul(r, 'player', p.id, p.name, p.state.realm);
      }
    } else if (path === 'lab') this.labCommand(r, b);
    else if (path === 'ground-defense') this.groundDefenseCommand(r, p, b);
    else if (path === 'sync') this.sync(r, p, b);
    else if (path === 'purchase-sign') this.purchaseSign(r, p, b);
    else if (path === 'place-purchase') this.placePurchase(r, p, b);
    else if (path === 'wash') this.wash(r, p, b);
    else if (path === 'fixed-dca-fire') {
      const result = this.fixedDcaFire(r, p, b);
      if (result) return result;
    } else if (path === 'antitank-fire' || path === 'heavy-dca-fire')
      this.fixedShellFire(r, p, b, path === 'antitank-fire' ? 'antitank' : 'dcaHeavy');
    else if (path === 'start') {
      if (!r.mission_started && !b.preparation) {
        r.mission_started = 1;
        r.next_wave_at = this.now() + r.balance.initialDelay * 1000;
        this.prepareWave(r);
      } else if (r.phase === 'prep' && r.preparation && b.preparation === r.preparation.id)
        // Any player may launch the announced wave before the countdown ends.
        this.startWave(r);
    } else if (path === 'reset') {
      if (b.epoch !== undefined && b.epoch !== r.base.epoch) return this.snapshot(r, options);
      this.resetRoom(r);
    } else if (path === 'bank-sign') {
      requireGame(
        b.epoch === undefined || b.epoch === r.base.epoch,
        'La partie a changé. Relisez le contrat.',
      );
      requireGame(
        Number.isInteger(b.slot) && b.slot >= 0 && b.slot < 3 && Number.isSafeInteger(b.serial),
        'Contrat bancaire invalide.',
        400,
      );
      requireGame(signature(b.signature), 'Signez le contrat bancaire.');
      try {
        const cents = Math.round(r.dollars * 100);
        r.dollars = (cents + signLoan(r.bank, b.slot, b.serial, cents, r.wave)) / 100;
      } catch (e) {
        requireGame(false, e.message);
      }
    } else if (path === 'bed-contract') {
      requireGame(
        p.life === 'alive' &&
          p.mode === 'foot' &&
          b.incarnation === p.incarnation &&
          b.epoch === r.base.epoch,
        'Corps ou partie périmés.',
      );
      const bed = r.equipment.find((e) => e.kind === 'bed' && e.slot === b.bed),
        body = this.base(r, p, b.ground);
      requireGame(
        bed && body && body.grounded && bedAccess(baseWorld(body), bed),
        'Approchez du lit avant de signer.',
      );
      requireGame(signature(b.signature), 'Signez le contrat personnel.');
      if (b.cancel) requireGame(p.bedId === bed.slot, 'Ce lit n’est pas votre point actif.');
      else
        requireGame(
          bedSpawn(bed, this.solids, r.equipment, values(r.vehicles)),
          'Lit impraticable.',
        );
      p.bedId = b.cancel ? null : bed.slot;
      r.bedContracts.set(r.identityTokens.get(p.id), p.bedId);
    } else if (path === 'fall-impact') {
      requireGame(
        p.life === 'alive' && p.mode === 'foot' && b.incarnation === p.incarnation,
        'Corps périmé.',
      );
      requireGame(
        typeof b.shot === 'string' &&
          b.shot.length < 160 &&
          Number.isFinite(b.speed) &&
          b.speed >= 0 &&
          b.speed <= 100,
        'Impact invalide.',
        400,
      );
      const impactKey = JSON.stringify(['fall', p.id, p.incarnation, b.shot]);
      if (!r.hits.has(impactKey)) {
        requireGame(r.hits.size < 128000, 'Registre d’impacts saturé.');
        r.hits.add(impactKey);
        // Debug mode: falls never hurt (issue #100).
        if (!r.lab.enabled) p.health = Math.max(0, p.health - impactDamage(b.speed));
        if (!p.health) this.kill(r, p, p.incarnation);
      }
    } else if (path === 'buy') {
      requireGame(SHOP[b.item]?.kind !== 'vehicle', 'Signez le bon puis posez le véhicule.');
      this.buy(r, p, b);
    } else if (['vehicle-select', 'vehicle-sign', 'vehicle-exit'].includes(path))
      this.vehicle(r, p, path, b);
    else if (['equipment-select', 'equipment-sign', 'turret'].includes(path))
      this.equipment(r, p, path, b);
    else if (['seat-request', 'seat-sign', 'seat-reject'].includes(path)) this.seat(r, p, path, b);
    else if (path === 'aircraft-fire') return clone(this.fire(r, p, b));
    else if (path === 'fixed-dca-impacts') return this.rapidDcaImpacts(r, p, b.impacts);
    else if (path === 'heavy-impact') this.heavyImpact(r, p, b);
    else if (path === 'heavy-bounce') this.heavyBounce(r, p, b);
    else if (path === 'heavy-fire') this.heavyFire(r, p, b);
    else if (path === 'hit') this.hit(r, p, b);
    else if (path === 'friendly-hit') this.friendly(r, p, b);
    else if (path === 'vip-pass') this.vipPass(r, p, b);
    else if (path === 'blast') {
      requireGame(
        p.life === 'alive' &&
          p.mode === 'turret' &&
          typeof b.shot === 'string' &&
          b.shot.length <= 120 &&
          Array.isArray(b.p) &&
          b.p.length === 3 &&
          b.p.every(Number.isFinite),
        'Explosion invalide.',
        400,
      );
      if (!r.effects.some((e) => e.shot === b.shot))
        r.effects.push({
          id: ++r.effectSeq,
          kind: 'blast',
          p: b.p,
          shot: b.shot,
          radius:
            Math.min(MAP.metres(FLAK.lightRadius), Math.max(0, Number(b.radius) || 0)) || undefined,
          at: this.now(),
        });
    } else if (path === 'death') {
      if (
        p.life === 'alive' &&
        p.seat === 'pilot' &&
        (b.incarnation === undefined || b.incarnation === p.incarnation)
      ) {
        const v = r.vehicles.get(p.vehicle_id);
        if (v) {
          if (b.state && validMotion(b.state)) v.state = { ...v.state, ...b.state };
          v.state.hp = 0;
          v.ready = 0;
          for (const id of [...v.seats.values()]) {
            const mate = r.pilots.get(id);
            if (mate && mate !== p) this.kill(r, mate, mate.incarnation);
          }
        }
      }
      this.kill(r, p, b.incarnation);
    } else if (path === 'sign') this.sign(r, p, b);
    else requireGame(false, 'Action inconnue.', 404);
    const result = this.snapshot(r, { ...options, share: path === 'sync' });
    result.damage = clone(
      r.damageEvents.filter(
        (e) =>
          e.target === p.id && e.id > (Number.isSafeInteger(b.damageSince) ? b.damageSince : 0),
      ),
    );
    return result;
  }
  groundDefenseCommand(r, p, b) {
    // The pilot may place a defense while driving, but the server uses only
    // its accepted vehicle position (never coordinates supplied by the client).
    const vehicle = r.vehicles.get(p.vehicle_id);
    const castor =
      p.life === 'alive' &&
      p.mode === 'flight' &&
      p.seat === 'pilot' &&
      vehicle?.type === 'castor' &&
      vehicle.seats.get('pilot') === p.id &&
      vehicle.state.hp > 0;
    // Castor volant: its pilot and its three passengers drop constructions.
    const airborne =
      p.life === 'alive' &&
      vehicle?.type === 'flyingcastor' &&
      vehicle.seats.get(p.seat) === p.id &&
      vehicle.state.hp > 0;
    requireGame(
      (p.life === 'alive' && p.mode === 'foot') || castor || airborne,
      'Construction réservée aux joueurs à pied et aux équipages des Castor.',
    );
    requireGame(b?.epoch === r.base.epoch, 'La partie a changé ; recommencez la pose.');
    const token = b.request;
    if (token !== undefined)
      requireGame(
        typeof token === 'string' && /^[a-zA-Z0-9:_-]{8,120}$/.test(token),
        'Identifiant de construction invalide.',
      );
    const key = token && p.id + ':' + token;
    if (key && r.groundDefenseOrders.has(key)) return;
    let w;
    if (airborne) {
      requireGame(
        vehicle.state.p?.length === 3 &&
          vehicle.state.p.every(Number.isFinite) &&
          vehicle.state.q?.length === 4 &&
          vehicle.state.q.every(Number.isFinite),
        'Position du Castor volant inconnue.',
      );
      w = { x: vehicle.state.p[0], z: vehicle.state.p[2] };
      if (b.action === 'build') {
        this.airdrop(r, vehicle, b.kind);
        this.rememberGroundOrder(r, key);
        return;
      }
    } else if (castor) {
      requireGame(
        vehicle.state.landed && Math.abs(vehicle.state.p[1] - VEHICLES.castor.gear) < 0.025,
        'Le Castor doit rouler sur le sol du bureau.',
      );
      w = { x: vehicle.state.p[0], z: vehicle.state.p[2] };
      if (b.action === 'build' && Array.isArray(b.b) && b.b.length === 2)
        requireGame(
          b.b.every(Number.isFinite) && Math.hypot(b.b[0] - w.x, b.b[1] - w.z) <= 0.27,
          'Le Castor doit rester près de la construction.',
        );
    } else {
      const body = this.base(r, p, b.ground);
      requireGame(
        body && body.grounded && !body.parachute && body.y < 0.025,
        'Rejoignez le sol du bureau pour construire.',
      );
      w = baseWorld(body);
    }
    let transaction;
    try {
      transaction = groundCommand(
        r.groundDefense,
        { ...b, id: b.target },
        [w.x, w.z],
        r.dollars,
        this.now(),
        { castor: castor || airborne },
      );
    } catch (error) {
      requireGame(false, error.message, 400);
    }
    r.dollars = money(r.dollars - transaction.price);
    if (!r.lab.enabled)
      this.stats.purchase(r, b.action === 'upgrade' ? b.variant : b.kind, transaction.price);
    if (b.action === 'build' && isFortification(b.kind))
      this.registerFortification(r, transaction.ids[0]);
    if (b.action === 'remove') {
      const station = r.equipment.find((s) => isFortification(s.kind) && s.id === b.target);
      if (station) {
        for (const occupant of r.pilots.values())
          if (
            occupant.life === 'alive' &&
            occupant.mode === 'turret' &&
            occupant.state.turret === station.slot
          )
            this.equipment(r, occupant, 'turret', {});
        r.equipment[station.slot] = {
          kind: 'retired',
          slot: station.slot,
          x: station.x,
          y: station.y,
          z: station.z,
        };
      }
    }
    this.rememberGroundOrder(r, key);
  }
  rememberGroundOrder(r, key) {
    if (!key) return;
    r.groundDefenseOrders.set(key, true);
    if (r.groundDefenseOrders.size > 2048)
      r.groundDefenseOrders.delete(r.groundDefenseOrders.keys().next().value);
  }
  // Occupiable posts are also equipment slots (signatures, seats, refills).
  registerFortification(r, id) {
    const structure = r.groundDefense.structures.find((s) => s.id === id);
    structure.slot = r.equipment.length;
    structure.x = structure.position[0];
    structure.y = Math.max(0.00005, structure.y || 0);
    structure.z = structure.position[1];
    structure.name = FORTIFICATIONS[structure.kind].name;
    r.equipment.push(structure);
  }
  // Castor volant drop: paid now, validated on a copy, built when it lands on
  // the first surface below the helicopter (refunded if the spot got taken).
  airdrop(r, vehicle, kind) {
    requireGame(AIRDROP_KINDS.includes(kind), 'Le Castor volant ne largue pas de mur LEGO.');
    const [x, y, z] = vehicle.state.p;
    const fromY = y - VEHICLES.flyingcastor.gear;
    const command = airdropCommand(kind, { x, z, yaw: headingOf(vehicle.state.q) });
    const landingY = airdropSurface(this.solids, x, z, Math.max(0, fromY));
    let price;
    try {
      price = groundCommand(
        structuredClone(r.groundDefense),
        command,
        [x, z],
        r.dollars,
        this.now(),
        {
          castor: true,
          y: landingY,
        },
      ).price;
    } catch (error) {
      requireGame(false, error.message, 400);
    }
    r.dollars = money(r.dollars - price);
    const now = this.now();
    r.groundDefense.drops ??= [];
    r.groundDefense.drops.push({
      id: 'drop-' + ++r.groundDefense.dropSeq,
      kind,
      command,
      price,
      x,
      z,
      angle: command.angle ?? 0,
      fromY: Math.max(landingY, fromY),
      landingY,
      startedAt: now,
      at: now,
    });
    r.groundDefense.revision++;
  }
  advanceGroundDrops(r, now) {
    const drops = r.groundDefense.drops;
    if (!drops?.length) return;
    for (const drop of [...drops]) {
      if (deliveryHeightAt(drop, now) > drop.landingY) continue;
      drops.splice(drops.indexOf(drop), 1);
      try {
        const { ids } = groundCommand(
          r.groundDefense,
          drop.command,
          [drop.x, drop.z],
          drop.price,
          now,
          { castor: true, y: drop.landingY },
        );
        if (isFortification(drop.kind)) this.registerFortification(r, ids[0]);
      } catch {
        r.dollars = money(r.dollars + drop.price); // the spot was taken meanwhile
      }
      r.groundDefense.revision++;
    }
  }

  fixedDcaFire(r, p, b) {
    const gun = r.equipment[b.station];
    requireGame(
      p.life === 'alive' &&
        p.mode === 'turret' &&
        Number.isInteger(b.station) &&
        p.state.turret === b.station &&
        (isFixedDca(gun?.kind) || (isFortification(gun?.kind) && gun.hp > 0)) &&
        p.incarnation === b.incarnation,
      'Occupez ce poste pour tirer.',
    );
    // The heavy gun fires server shells only (antitank-fire), never client rounds.
    requireGame(!['antitank', 'dcaHeavy'].includes(gun.kind), 'Le canon lourd tire des obus.');
    if (gun.kind === 'dcaRapid') return this.rapidDcaFire(r, p, gun, b.shots);
    requireGame(
      typeof b.shot === 'string' && b.shot.length > 0 && b.shot.length <= 120,
      'Identifiant de tir invalide.',
      400,
    );
    const key = p.id + ':' + p.incarnation + ':' + b.shot;
    if (r.fixedDcaShots.has(key)) return;
    requireGame(gun.ammo >= 1, 'Cette arme est à court de munitions.');
    requireGame(r.fixedDcaShots.size < 128000, 'Trop de tirs enregistrés.', 429);
    gun.ammo -= 1;
    gun.lastShotAt = this.now();
    r.fixedDcaShots.add(key);
  }
  rapidDcaFire(r, p, gun, shots) {
    requireGame(
      Array.isArray(shots) &&
        shots.length > 0 &&
        shots.length <= 8 &&
        new Set(shots).size === shots.length &&
        shots.every(
          (shot) =>
            typeof shot === 'string' && shot.startsWith(p.id + ':rapid:') && shot.length <= 120,
        ),
      'Rapport de tirs invalide.',
      400,
    );
    const now = this.now();
    // Retain launch IDs beyond round flight and reliable retries. This ledger
    // cannot exhaust the permanent budget of the slower emplacements.
    for (const [key, launchedAt] of r.rapidDcaShots) {
      if (now - launchedAt < 60000) break;
      r.rapidDcaShots.delete(key);
    }
    const interval = (FIXED_DCA.dcaRapid.interval * 1000) / (r.balance.fireRate || 1);
    // Accumulate a short burst of credit so packet timing does not set the rate.
    let credit = Math.min(8, (gun.rapidCredit ?? 8) + (now - (gun.lastShotAt ?? now)) / interval);
    const accepted = [];
    for (const shot of shots) {
      const key = p.id + ':' + p.incarnation + ':' + shot;
      if (r.rapidDcaShots.has(key)) accepted.push(shot);
      else if (credit >= 1 && gun.ammo >= 1 && r.rapidDcaShots.size < 128000) {
        credit--;
        gun.ammo--;
        r.rapidDcaShots.set(key, now);
        accepted.push(shot);
      }
    }
    gun.rapidCredit = credit;
    gun.lastShotAt = now;
    return { accepted, ammo: gun.ammo, at: now };
  }
  // Issue #113: the anti-materiel howitzer fires a server-simulated shell, like
  // the tank cannon, from its real muzzle along the barrel direction.
  fixedShellFire(r, p, b, weapon) {
    const gun = r.equipment[b.station];
    requireGame(
      p.life === 'alive' &&
        p.mode === 'turret' &&
        Number.isInteger(b.station) &&
        p.state.turret === b.station &&
        gun?.kind === weapon &&
        (weapon !== 'antitank' || gun.hp > 0) &&
        p.incarnation === b.incarnation,
      'Occupez ce canon lourd pour tirer.',
    );
    requireGame(
      typeof b.shot === 'string' && b.shot.length > 0 && b.shot.length <= 120,
      'Identifiant de tir invalide.',
      400,
    );
    const key = p.id + ':' + p.incarnation + ':' + b.shot;
    if (r.ordnanceShots.has(key)) return;
    const direction = b.direction;
    requireGame(
      Array.isArray(direction) &&
        direction.length === 3 &&
        direction.every(Number.isFinite) &&
        Math.hypot(...direction) > 0.5,
      'Visée invalide.',
      400,
    );
    requireGame(gun.ammo >= 1, 'Ce canon est à court d’obus.');
    const profile = HEAVY[weapon];
    requireGame(
      r.ordnance.length < MAX_ORDNANCE && r.ordnanceShots.size < 128000,
      'Trop de projectiles actifs.',
      429,
    );
    const n = Math.hypot(...direction),
      dir = direction.map((v) => v / n);
    gun.ammo -= 1;
    gun.lastShotAt = this.now();
    r.ordnanceShots.add(key);
    r.ordnance.push({
      shot: b.shot,
      weapon,
      vehicle: null,
      station: b.station,
      shooter: p.id,
      p: weapon === 'antitank' ? howitzerMuzzle(gun, dir) : heavyDcaMuzzle(gun, dir),
      ...(weapon === 'dcaHeavy' ? { proximity: clampProximity(b.proximity) } : {}),
      v: dir.map((v) => v * profile.speed),
      age: 0,
      at: this.now(),
      updated: this.now(),
      wave: r.wave,
      radiusFactor: 1,
      bonus: r.balance.damage,
    });
  }
  purchaseSnapshot(r) {
    return {
      equipment: r.equipment,
      deliveries: r.deliveries,
      pendingInstallations: Object.fromEntries(
        Object.keys(SHOP).map((k) => [
          k,
          values(r.purchases).filter((o) => o.item === k && !o.placed).length,
        ]),
      ),
    };
  }
  purchaseSign(r, p, b) {
    requireGame(
      p.life === 'alive' &&
        (p.mode === 'foot' || !!r.vehicles.get(p.vehicle_id)) &&
        b.epoch === r.base.epoch &&
        b.incarnation === p.incarnation,
      'Approchez à pied avec votre corps actuel.',
    );
    requireGame(
      ['placement', 'vehicle'].includes(SHOP[b.item]?.kind) && signature(b.signature),
      'Signez le bon de commande.',
    );
    requireGame(
      typeof b.request === 'string' && /^[a-zA-Z0-9:_-]{8,120}$/.test(b.request),
      'Référence invalide.',
    );
    const existing = r.purchases.get(b.request);
    if (existing) {
      requireGame(existing.owner === p.id && existing.item === b.item, 'Commande déjà utilisée.');
      return;
    }
    const pending = values(r.purchases).filter((o) => !o.placed);
    if (p.mode === 'foot')
      requireGame(r.equipment.length + pending.length < 24, 'Limite de 24 équipements atteinte.');
    const carrier = r.vehicles.get(p.vehicle_id);
    const drop =
      carrier &&
      deliveryStart(carrier, b.item, r.deliveries.length, this.solids, [
        ...r.equipment,
        ...r.deliveries,
        ...values(r.vehicles).map((v) => ({ x: v.state.p[0], y: v.state.p[1], z: v.state.p[2] })),
      ]);
    requireGame(!carrier || drop, 'Aucune colonne de livraison libre près de cet appareil.');
    const price = shopPrice(b.item, purchaseCount(this.purchaseSnapshot(r), b.item), r.balance);
    requireGame(price === b.expectedPrice, 'Le tarif a changé. Relisez le bon.');
    requireGame(r.dollars >= price, 'La caisse commune ne contient pas assez de dollars.');
    r.dollars = money(r.dollars - price);
    if (!r.lab.enabled) this.stats.purchase(r, b.item, price);
    r.purchases.set(b.request, {
      token: b.request,
      owner: p.id,
      item: b.item,
      price,
      placed: !!drop,
    });
    if (drop)
      r.deliveries.push({
        ...drop,
        fromY: drop.y,
        startedAt: this.now(),
        token: b.request,
        at: this.now(),
      });
  }
  advanceDeliveries(r, now) {
    for (const delivery of r.deliveries) {
      const landing = deliveryLanding(delivery, this.solids, [
        ...r.equipment,
        initialStation(),
        ...values(r.vehicles)
          .filter((v) => v.state.landed)
          .map((v) => ({
            x: v.state.p[0],
            y: v.state.p[1],
            z: v.state.p[2],
            clearance: (VEHICLES[v.type].span * ACTOR_UNIT) / 2,
          })),
      ]);
      delivery.fromY ??= delivery.y;
      delivery.startedAt ??= delivery.at;
      delivery.landingY = landing?.y ?? 0.00005;
      delivery.y = deliveryHeightAt(delivery, now);
      delivery.at = now;
      if (!landing) {
        delivery.y = Math.max(0.00005, delivery.y);
        continue;
      }
      if (delivery.y > landing.y) continue;
      if (VEHICLES[delivery.item]) this.createVehicle(r, delivery.item, 'purchase', landing);
      else this.installEquipment(r, delivery.item, landing);
      delivery.done = true;
    }
    r.deliveries = r.deliveries.filter((d) => !d.done);
  }
  placePurchase(r, p, b) {
    const order = r.purchases.get(b.token);
    requireGame(order && order.owner === p.id, 'Cet achat ne vous appartient pas.');
    if (order.placed) return;
    requireGame(
      b.epoch === r.base.epoch && b.incarnation === p.incarnation,
      'Corps ou partie périmés.',
    );
    // Use exactly the same placement rules as ordinary purchases, with a private
    // prepaid flag rather than crediting the wallet or temporarily removing an order.
    this.buy(r, p, { ...b, item: order.item, request: 'place:' + b.token }, order);
    order.placed = true;
  }
  // Enemy positions for vehicle contacts. advance() runs on every command of
  // every player (twice per sync); recomputing the whole swarm each time made
  // server cost grow as players × enemies. Positions are reused for at most
  // CONTACT_FRAME_MS, and recomputed at once if the roster, wave or clock
  // goes back. Vehicle segments are still swept exactly on every call.
  contactFrames(r, plan, now) {
    const c = r.contactFrameCache;
    if (
      c &&
      c.roster === plan.roster &&
      c.revision === r.rosterRevision &&
      c.wave === r.wave &&
      c.started === r.started &&
      c.ground === r.groundAgents &&
      c.agents === Object.keys(r.groundAgents).length &&
      now >= c.at &&
      now - c.at < CONTACT_FRAME_MS
    )
      return c.frames;
    const frames = swarmFrame(plan.roster, (now - r.started) / 1000, r.groundAgents);
    r.contactFrameCache = {
      roster: plan.roster,
      revision: r.rosterRevision,
      wave: r.wave,
      started: r.started,
      ground: r.groundAgents,
      agents: Object.keys(r.groundAgents).length,
      at: now,
      frames,
    };
    return frames;
  }
  vehicleContacts(r, now) {
    if (r.phase !== 'combat') {
      for (const v of r.vehicles.values()) {
        v.contacts = [];
        v.contactWave = r.wave;
        v.contactPosition = [...v.state.p];
      }
      return;
    }
    const plan = this.plan(r),
      frames = this.contactFrames(r, plan, now);
    for (const v of r.vehicles.values()) {
      if (v.state.hp <= 0) continue;
      const previous = v.contactWave === r.wave ? v.contactPosition || v.state.p : v.state.p;
      const contacts = [],
        latched = new Set(v.contactWave === r.wave ? v.contacts : []);
      frames.forEach((frame, i) => {
        // Debug dummies never wear vehicles down (their HP is symbolic).
        if (!frame || r.kills.has(i) || plan.roster[i].dummy) return;
        const radius = MAP.metres(
          plan.roster[i].size * 0.7 * enemySizeFactor(plan.roster[i].type) + 0.3,
        );
        // Fast conservative swept AABB reject; never skip an exact contact.
        if (!sweptSphereMayTouch(previous, v.state.p, frame.p, radius)) return;
        const touching = Math.hypot(...v.state.p.map((n, j) => n - frame.p[j])) <= radius;
        const impact = touching || segmentSphere(previous, v.state.p, frame.p, radius) !== null;
        if (impact && !latched.has(i)) {
          v.state.hp = Math.max(
            0,
            v.state.hp - collisionDamage(plan.roster[i].hp, r.enemyDamage[i] || 0),
          );
          v.dirt = Math.min(1, (v.dirt || 0) + WASH.dirtPerImpact);
        }
        if (impact) contacts.push(i);
      });
      v.contacts = contacts;
      v.contactWave = r.wave;
      v.contactPosition = [...v.state.p];
    }
  }
  wash(r, p, b) {
    requireGame(
      p.life === 'alive' &&
        p.mode === 'foot' &&
        b.epoch === r.base.epoch &&
        b.incarnation === p.incarnation,
      'Sortez du véhicule pour nettoyer.',
    );
    const body = this.base(r, p, b.ground),
      w = body && baseWorld(body);
    requireGame(
      w &&
        Array.isArray(b.direction) &&
        b.direction.length === 3 &&
        b.direction.every(Number.isFinite),
      'Jet invalide.',
    );
    const origin = [w.x, w.y + MAP.metres(0.9), w.z];
    const target = washTarget(origin, b.direction, values(r.vehicles), this.solids);
    const elapsed =
      p.washAt === undefined ? 0 : Math.max(0, Math.min(0.25, (this.now() - p.washAt) / 1000));
    p.washAt = this.now();
    p.state.washing = { origin, direction: b.direction, at: this.now() };
    if (!target || !target.dirt) return;
    const before = target.dirt;
    target.dirt = Math.max(0, before - elapsed / WASH.seconds);
    if (target.dirt < 1e-8) target.dirt = 0;
    if (before > 0 && !target.dirt)
      r.effects.push({
        id: ++r.effectSeq,
        kind: 'clean',
        vehicle: target.id,
        p: [...target.state.p],
        at: this.now(),
      });
  }
  buy(r, p, b, prepaid = null) {
    const item = SHOP[b.item],
      request = b.request;
    requireGame(
      item &&
        typeof request === 'string' &&
        /^[a-zA-Z0-9:_-]{8,120}$/.test(request) &&
        p.life === 'alive',
      'Achat invalide.',
    );
    if (r.orders.has(request)) {
      requireGame(r.orders.get(request) === b.item, 'Référence d’achat déjà utilisée.');
      return;
    }
    const price = shopPrice(b.item, purchaseCount(this.purchaseSnapshot(r), b.item), r.balance);
    requireGame(
      prepaid || b.expectedPrice === undefined || b.expectedPrice === price,
      'Le tarif a changé.',
    );
    requireGame(
      prepaid || r.dollars >= price,
      'La caisse commune ne contient pas assez de dollars.',
    );
    if (item.kind === 'placement' || (item.kind === 'vehicle' && prepaid)) {
      requireGame(
        p.mode === 'foot' &&
          b.position &&
          ['x', 'y', 'z'].every((k) => Number.isFinite(b.position[k])) &&
          (b.position.angle === undefined || Number.isFinite(b.position.angle)),
        'Posez cet équipement à pied.',
      );
      const body = this.base(r, p, b.ground),
        w = body && baseWorld(body);
      requireGame(
        body &&
          !body.parachute &&
          body.grounded !== false &&
          Math.hypot(w.x - b.position.x, w.z - b.position.z) <= MAP.metres(9),
        'Placez l’équipement près de vous, depuis le sol.',
      );
      requireGame(
        r.equipment.length + values(r.purchases).filter((o) => !o.placed && o !== prepaid).length <
          24,
        'Limite de 24 équipements atteinte.',
      );
      const placement = supportedPlacement(
        { ...b.position, y: w.y },
        this.solids,
        [
          ...r.equipment,
          initialStation(),
          ...values(r.vehicles)
            .filter((v) => v.state.landed)
            .map((v) => ({
              x: v.state.p[0],
              y: v.state.p[1],
              z: v.state.p[2],
              clearance: (VEHICLES[v.type].span * ACTOR_UNIT) / 2,
            })),
        ],
        b.item,
        // On furniture, the client found the surface on the props' triangles.
        decorTrust(this.solids, b.position.y - 0.00005),
      );
      requireGame(
        placement && Math.abs(placement.y - b.position.y) <= 0.0003,
        'La base entière doit reposer sur une surface libre.',
      );
      if (item.kind === 'vehicle') this.createVehicle(r, b.item, 'purchase', placement);
      else this.installEquipment(r, b.item, placement);
    } else if (item.kind === 'vehicle') this.createVehicle(r, b.item);
    if (!prepaid) {
      r.dollars = money(r.dollars - price);
      if (!r.lab.enabled) this.stats.purchase(r, b.item, price);
    }
    r.orders.set(request, b.item);
  }
  installEquipment(r, kind, placement) {
    r.equipment.push({
      ...placement,
      kind,
      name: SHOP[kind].name,
      slot: r.equipment.length,
      ...(isFixedDca(kind) ? { ammo: FIXED_DCA[kind].ammo } : {}),
    });
  }
  vehicle(r, p, path, b) {
    if (path === 'vehicle-exit') {
      const v = r.vehicles.get(p.vehicle_id);
      requireGame(v, 'Vous n’êtes pas à bord.');
      if (p.seat === 'pilot' && b.state && validMotion(b.state))
        v.state = { ...v.state, ...b.state, hp: Math.min(v.state.hp, b.state.hp) };
      // Leaving is always possible. Touching the ground and (nearly) still: at the door;
      // otherwise where the vehicle is, carrying its speed.
      const grounded = !!v.state.landed && Math.hypot(...v.state.v) <= MAP.metres(3);
      // The server parks the vehicle the driver leaves (src/parked-host.ts): brakes on, engine off.
      if (p.seat === 'pilot' && isHosted(v.type)) {
        v.hosted = true;
        v.state = { ...v.state, gas: 0 };
      }
      const e = vehicleEntry(v, p.seat);
      const occupants = [p];
      for (const mate of occupants) {
        const pos = grounded ? e : { x: v.state.p[0], y: v.state.p[1], z: v.state.p[2] };
        mate.state.walkSpawn = {
          x: (pos.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
          z: (OFFICE_LAYOUT.base.originZ - pos.z) / ACTOR_UNIT,
          y: pos.y,
          parachute: false,
          airborne: !grounded,
          vx: v.state.v[0],
          vy: v.state.v[1],
          vz: v.state.v[2],
        };
        this.release(r, mate);
        mate.mode = 'foot';
        Object.assign(mate.state, { vehicle: null, seat: null, fire: false, parked: null });
      }
      return;
    }
    const v = r.vehicles.get(b.vehicle),
      seat = b.seat || 'pilot';
    requireGame(
      p.life === 'alive' && p.mode === 'foot' && v,
      'Approchez d’un appareil disponible.',
    );
    const body = this.base(r, p, b.ground);
    requireGame(body && vehicleAccess(baseWorld(body), v, seat), 'Approchez-vous de cet appareil.');
    requireGame(VEHICLES[v.type].seats.includes(seat), 'Poste invalide.');
    requireGame(!v.seats.has(seat), 'Ce poste est occupé.');
    if (path === 'vehicle-select') {
      if (p.state.boarding?.vehicle === v.id && p.state.boarding.seat === seat) return;
      p.state.equipmentBoarding = null;
      p.state.boarding = { vehicle: v.id, seat, token: uid() };
      p.board_paper = 0;
      return;
    }
    requireGame(signature(b.signature), 'Tracez votre signature dans le cadre.');
    requireGame(
      p.state.boarding?.vehicle === v.id && p.state.boarding.seat === seat,
      'Choisissez cet appareil avant de signer.',
    );
    requireGame(b.form === p.board_paper + 1 && b.form <= 2, 'Signez les documents dans l’ordre.');
    if (b.form === 2) this.assign(r, p, v, seat, p.state.boarding.token);
    else p.board_paper = 1;
  }
  equipment(r, p, path, b) {
    requireGame(p.life === 'alive', 'Revenez à la vie avant de servir une défense.');
    if (p.mode === 'turret') {
      const s = r.equipment[p.state.turret];
      requireGame(s, 'Poste invalide.');
      const exit = stationExit(s);
      p.state.walkSpawn = {
        x: (exit.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
        z: (OFFICE_LAYOUT.base.originZ - exit.z) / ACTOR_UNIT,
        y: exit.y,
        parachute: false,
      };
      this.release(r, p);
      p.mode = 'foot';
      p.state.turret = null;
      p.state.fire = false;
      return;
    }
    const s = r.equipment[b.station],
      body = this.base(r, p, b.ground);
    requireGame(
      p.mode === 'foot' &&
        Number.isInteger(b.station) &&
        (isFixedDca(s?.kind) || (isFortification(s?.kind) && s.hp > 0)) &&
        body &&
        !body.parachute &&
        stationAccess(baseWorld(body), s),
      'Approchez de la défense à pied.',
    );
    if (path === 'equipment-select') {
      if (p.state.equipmentBoarding?.station === b.station) return;
      p.state.boarding = null;
      p.state.equipmentBoarding = { station: b.station, paper: 0, token: uid() };
      return;
    }
    const current = p.state.equipmentBoarding;
    requireGame(
      path === 'equipment-sign' &&
        signature(b.signature) &&
        current?.station === b.station &&
        b.form === current.paper + 1 &&
        b.form <= 2,
      'Signez le dossier dans l’ordre.',
    );
    if (b.form === 1) {
      current.paper = 1;
      return;
    }
    requireGame(
      !this.live(r).some((x) => x.mode === 'turret' && x.state.turret === b.station),
      'Cette défense est déjà occupée.',
    );
    p.mode = 'turret';
    Object.assign(p.state, {
      equipmentBoarding: null,
      turret: b.station,
      turretDirection: [0, 0.3, -1],
      fire: false,
    });
  }
  seat(r, p, path, b) {
    if (path === 'seat-request') {
      const v = r.vehicles.get(p.vehicle_id);
      requireGame(
        p.life === 'alive' && v && b.seat !== p.seat && VEHICLES[v.type].seats.includes(b.seat),
        'Choisissez un autre poste de votre appareil.',
      );
      requireGame(
        !values(r.requests).some((q) => q.requester === p.id),
        'Terminez ou annulez votre demande actuelle.',
      );
      const q = {
        id: uid(),
        room: r.code,
        vehicle: v.id,
        requester: p.id,
        recipient: v.seats.get(b.seat) || null,
        from_seat: p.seat,
        to_seat: b.seat,
        created: this.now(),
        status: 'signing',
      };
      r.requests.set(q.id, q);
      return;
    }
    const q = r.requests.get(b.request);
    requireGame(
      q && ['signing', 'offered'].includes(q.status) && [q.requester, q.recipient].includes(p.id),
      'Demande expirée.',
    );
    if (path === 'seat-reject') {
      q.status = 'cancelled';
      return;
    }
    requireGame(signature(b.signature), 'Signez le contrat de transfert.');
    requireGame(
      p.id === (q.status === 'signing' ? q.requester : q.recipient),
      'La signature de l’autre joueur est nécessaire.',
    );
    if (q.status === 'signing' && q.recipient) {
      q.status = 'offered';
      return;
    }
    const v = r.vehicles.get(q.vehicle),
      a = r.pilots.get(q.requester),
      other = r.pilots.get(q.recipient);
    requireGame(
      v &&
        v.seats.get(q.from_seat) === q.requester &&
        (q.recipient ? v.seats.get(q.to_seat) === q.recipient : !v.seats.has(q.to_seat)),
      'Postes modifiés : transfert annulé.',
    );
    v.seats.delete(q.from_seat);
    v.seats.delete(q.to_seat);
    this.assign(r, a, v, q.to_seat, q.id + ':' + a.id);
    if (other) this.assign(r, other, v, q.from_seat, q.id + ':' + other.id);
    q.status = 'completed';
  }
  heavyFire(r, p, b) {
    const v = r.vehicles.get(p.vehicle_id),
      weapon = b.weapon;
    requireGame(
      typeof b.shot === 'string' && b.shot.length > 0 && b.shot.length <= 120,
      'Identifiant de tir invalide.',
      400,
    );
    if (r.ordnanceShots.has(p.id + ':' + b.shot)) return;
    requireGame(
      p.life === 'alive' && v && HEAVY[weapon] && canUseWeapon(v.type, p.seat, weapon),
      'Arme indisponible.',
    );
    requireGame(
      (b.vehicle === undefined || b.vehicle === v.id) &&
        (b.occupation === undefined || b.occupation === p.occupation),
      'Poste modifié.',
    );
    if (b.state) this.sync(r, p, { state: b.state, mode: p.mode, occupation: p.occupation });
    if (weapon === 'missile') {
      requireGame(
        !r.ordnance.some((s) => !s.done && s.vehicle === v.id && s.weapon === 'missile'),
        'Un missile est déjà en vol.',
      );
      v.missileOccupation = p.occupation;
    }
    const selected =
      weapon === 'he' || weapon === 'ap' ? availableShell(v.supplies.ammo, weapon) : weapon;
    requireGame(selected && v.supplies.ammo[selected] >= 1, 'Réserve vide.');
    const lane = selected === 'bomb' ? 'bomb' : 'cannon';
    v.lastHeavy ??= {};
    requireGame(
      r.ordnance.length < MAX_ORDNANCE && r.ordnanceShots.size < 128000,
      'Trop de projectiles actifs.',
      429,
    );
    const direction = b.direction || [0, 0, -1];
    requireGame(
      Array.isArray(direction) &&
        direction.length === 3 &&
        direction.every(Number.isFinite) &&
        Math.hypot(...direction) > 0.5,
      'Visée invalide.',
      400,
    );
    if (selected === 'rocket') v.rocketSide = -(v.rocketSide || -1);
    if (selected === 'proximity') v.proximity = clampProximity(b.proximity);
    v.supplies.ammo[selected]--;
    v.supplies.revision++;
    v.lastHeavy[lane] = this.now();
    r.ordnanceShots.add(p.id + ':' + b.shot);
    r.ordnance.push(
      createOrdnance({
        shot: b.shot,
        weapon: selected,
        vehicle: v,
        shooter: p.id,
        direction,
        now: this.now(),
        wave: r.wave,
      }),
    );
    r.ordnance.at(-1).bonus *= r.balance.damage;
    // A parked tank (nobody drives it) recoils on the server's physics.
    if (v.type === 'tank' && selected !== 'bomb') r.parkedHost?.kick(v.id, direction);
  }
  // Heavy weapons are simulated by their shooter (src/heavy-sim.js): the room
  // keeps each launch (origin, velocity, time) for the other players' display
  // and forgets it on its impact report or after its lifetime plus a delay.
  // Parked vehicles (the pilot left them): the room's physics world brings them to rest
  // where they stand, brakes on, and the engine puts them to sleep. Only vehicles left by
  // a pilot are simulated; the others keep their state without any computation.
  advanceParked(r, now) {
    const wanted = [];
    for (const v of r.vehicles.values()) {
      if (!v.hosted) continue;
      if (v.seats.has('pilot') || v.state.hp <= 0) {
        v.hosted = false;
        continue;
      }
      wanted.push({ id: v.id, type: v.type, state: v.state, profile: VEHICLES[v.type] });
    }
    if (!wanted.length) {
      r.parkedHost?.sync([]);
      return;
    }
    const R = physicsEngine();
    if (!R) return; // still loading: the aircraft stays where it was left
    r.parkedHost ??= new ParkedHost(R, decorFor(r.layout), this.fixedSolids ?? layoutSolids());
    r.parkedHost.sync(wanted);
    for (const u of r.parkedHost.step(now)) {
      const v = r.vehicles.get(u.id);
      if (!v) continue;
      v.state = { ...v.state, ...u.state, ...(u.destroyed ? { hp: 0 } : {}) };
      if (u.destroyed) v.hosted = false;
      // Left the pad: dead, or in the air for a while once it has settled (a bounce or a
      // gust on the pad is not leaving it).
      if (v.state.landed || now < (v.settleUntil ?? 0)) v.airSince = null;
      else v.airSince ??= now;
      if (v.state.hp <= 0 || (v.airSince !== null && now - v.airSince >= AIRBORNE_MS)) v.ready = 0;
    }
  }
  expireOrdnance(r, now) {
    if (!r.ordnance.length) return;
    r.ordnance = r.ordnance.filter((shot) => {
      const alive = now <= shot.at + HEAVY[shot.weapon].lifetime * 1000 + IMPACT_GRACE_MS;
      if (!alive) this.endOrdnance(r, shot, now);
      return alive;
    });
  }
  endOrdnance(r, shot, now) {
    if (shot.weapon !== 'missile') return;
    const v = r.vehicles.get(shot.vehicle);
    if (v) v.nextMissileAt = now + 2000 / r.balance.fireRate;
  }
  // A shell that ricocheted: its flight restarts from the shooter's new position and velocity,
  // for the players who fly it from the record. Same trust as the impact.
  heavyBounce(r, p, b) {
    requireGame(typeof b.shot === 'string' && b.shot.length <= 120, 'Rebond invalide.', 400);
    const shot = r.ordnance.find((s) => s.shot === b.shot && s.shooter === p.id);
    if (!shot) return;
    const vector = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
    requireGame(
      vector(b.p) &&
        vector(b.v) &&
        Number.isFinite(b.age) &&
        Number.isFinite(b.updated) &&
        Number.isInteger(b.bounces),
      'Rebond invalide.',
      400,
    );
    // Only the latest bounce counts if reports arrive out of order.
    if (b.bounces <= (shot.bounces ?? 0)) return;
    Object.assign(shot, {
      p: [...b.p],
      v: [...b.v],
      age: b.age,
      updated: b.updated,
      bounces: b.bounces,
    });
  }
  // Impact computed by the shooter and trusted: applied once. Damage to friends is the
  // shooter's decision too.
  heavyImpact(r, p, b) {
    requireGame(typeof b.shot === 'string' && b.shot.length <= 120, 'Impact invalide.', 400);
    const shot = r.ordnance.find((s) => s.shot === b.shot && s.shooter === p.id);
    if (!shot) return; // already applied, expired or unknown: idempotent
    // Ended without blast (inert contact, lifetime, lost helicopter).
    if (b.fizzle === true) {
      r.ordnance = r.ordnance.filter((s) => s !== shot);
      this.endOrdnance(r, shot, this.now());
      return;
    }
    const list = (value) => (Array.isArray(value) ? value.slice(0, 512) : []);
    const point = b.p;
    requireGame(
      Array.isArray(point) && point.length === 3 && point.every(Number.isFinite),
      'Impact invalide.',
      400,
    );
    const now = this.now(),
      profile = HEAVY[shot.weapon],
      // A piercing shell reports each enemy it crosses while it flies on.
      partial = shot.weapon === 'ap' && b.partial === true,
      // The shooter's report is trusted as is (cooperative game, no cheat control).
      amount = (n) => (Number.isFinite(n) ? Math.max(0, n) : 0);
    if (!partial) {
      r.ordnance = r.ordnance.filter((s) => s !== shot);
      this.endOrdnance(r, shot, now);
    }
    r.effects.push({
      id: ++r.effectSeq,
      kind: shot.weapon === 'ap' ? 'piercing' : 'blast',
      p: point,
      shot: shot.shot,
      shooter: p.id,
      radius: profile.radius * (shot.radiusFactor || 1),
      at: now,
    });
    if (r.phase === 'combat' && shot.wave === r.wave) {
      const roster = this.plan(r).roster;
      for (const [index, damage, position] of list(b.enemies)) {
        const e = roster[index];
        if (!Number.isInteger(index) || !e || r.kills.has(index)) continue;
        this.creditEnemy(r, this.heavySource(r, p, shot), index, e, amount(damage));
        r.enemyDamage[index] = (r.enemyDamage[index] || 0) + amount(damage);
        if (r.enemyDamage[index] >= e.hp)
          this.defeatEnemy(
            r,
            index,
            Array.isArray(position) && position.length === 3 && position.every(Number.isFinite)
              ? position
              : undefined,
          );
      }
    }
    for (const [id, damage] of list(b.vehicles)) {
      const v = r.vehicles.get(id);
      if (!v || v.state.hp <= 0) continue;
      v.state.hp = Math.max(0, v.state.hp - amount(damage));
      if (v.state.hp === 0) {
        v.ready = 0;
        for (const crew of [...v.seats.values()]) {
          const mate = r.pilots.get(crew);
          if (mate) this.kill(r, mate, mate.incarnation);
        }
      }
    }
    const target = (id) => {
      const t = r.pilots.get(id);
      return t?.life === 'alive' && !t.vehicle_id ? t : null;
    };
    for (const [id, damage] of list(b.players)) {
      const t = target(id);
      if (!t) continue;
      t.health = Math.max(0, t.health - amount(damage));
      if (!t.health) this.kill(r, t, t.incarnation);
    }
    // Only an armour-piercing shell kills outright on a direct hit.
    if (shot.weapon === 'ap')
      for (const id of list(b.kills)) {
        const t = target(id);
        if (t) this.kill(r, t, t.incarnation);
      }
  }
  playerPosition(r, p) {
    if (p.mode === 'turret') {
      const s = r.equipment[p.state.turret];
      return s ? [s.x, s.y + MAP.metres(1), s.z] : null;
    }
    const body = r.base.bodies?.find((b) => b.entity === p.id),
      position = body && baseWorld(body);
    return position ? [position.x, position.y + MAP.metres(0.9), position.z] : null;
  }
  fire(r, p, b) {
    const shots = Array.isArray(b.shots) ? b.shots : [b.shot],
      v = r.vehicles.get(p.vehicle_id),
      seat = p.seat,
      weapon = b.weapon || seat;
    requireGame(
      shots.length > 0 &&
        shots.length <= 32 &&
        new Set(shots).size === shots.length &&
        shots.every(
          (s) => typeof s === 'string' && s.length > 0 && s.length <= 120 && !s.startsWith('used:'),
        ),
      'Rapport de tirs invalide.',
      400,
    );
    requireGame(
      p.life === 'alive' &&
        v &&
        ['flight', 'crew'].includes(p.mode) &&
        (!b.vehicle || b.vehicle === v.id) &&
        (!b.seat || b.seat === seat) &&
        !HEAVY[weapon] &&
        canUseWeapon(v.type, seat, weapon) &&
        ammoCapacity(v.type, weapon),
      'Poste armé requis.',
    );
    if (v.type === 'helicopter')
      requireGame(
        !r.ordnance.some(
          (s) =>
            s.weapon === 'missile' &&
            s.vehicle === v.id &&
            s.shooter === p.id &&
            s.occupation === p.occupation,
        ),
        'Guidage en cours.',
      );
    let allowed = false;
    for (const shot of shots) {
      const key = p.id + ':' + shot;
      if (v.shots.has(key)) {
        allowed = true;
        continue;
      }
      if (v.supplies.ammo[weapon] >= 1) {
        requireGame(
          v.shots.size < 128000,
          'Limite de rapports de tirs atteinte ; changez d’appareil.',
          429,
        );
        v.supplies.ammo[weapon]--;
        v.supplies.revision++;
        v.shots.add(key);
        allowed = true;
      }
    }
    return {
      allowed,
      shots,
      vehicle: v.id,
      seat,
      ammo: v.supplies.ammo,
      revision: v.supplies.revision,
    };
  }
  once(r, key, action, ledger = r.hits) {
    if (ledger.has(key)) return;
    requireGame(ledger.size < 128000, 'Limite d’impacts atteinte ; relancez la partie.', 429);
    action();
    ledger.add(key);
  }
  defeatEnemy(r, index, position = null) {
    if (r.kills.has(index)) return false;
    const plan = this.plan(r),
      e = plan.roster[index];
    if (!e) return false;
    r.kills.add(index);
    this.soul(r, 'enemy', r.wave + ':' + index, e.name, 'purgatory', e.type);
    if (e.onDeath?.spawn) {
      const at = (this.now() - r.started) / 1000;
      const location = position || swarmFrame(plan.roster, at, r.groundAgents)[index]?.p;
      if (location) {
        const children = spawnOffspring(
          e,
          location,
          at,
          r.balance,
          plan.roster.length,
          r.wave,
          Math.max(0, MAX_OFFSPRING_ROSTER - plan.roster.length),
        );
        if (children.length) {
          plan.roster.push(...children);
          assignMidgeSwarmSizes(plan.roster);
          r.rosterRevision++;
        }
      }
    }
    return true;
  }
  rapidDcaImpacts(r, p, impacts) {
    requireGame(Array.isArray(impacts) && impacts.length <= 16, 'Impacts invalides.', 400);
    for (const impact of impacts) {
      if (typeof impact?.shot !== 'string' || !this.rapidImpactAllowed(r, p, impact.shot)) continue;
      if (Number.isInteger(impact.enemy)) this.hit(r, p, impact);
      else if (impact.vehicle ? r.vehicles.has(impact.vehicle) : r.pilots.has(impact.target)) {
        try {
          this.friendly(r, p, impact);
        } catch (error) {
          // The target can disappear or move between realms before arrival.
          if (error.status !== 409) throw error;
        }
      }
    }
    return {};
  }
  rapidImpactAllowed(r, p, shot) {
    return r.rapidDcaShots.has(p.id + ':' + p.incarnation + ':' + shot);
  }
  hit(r, p, b) {
    const e = this.plan(r).roster[b.enemy];
    if (
      p.life !== 'alive' ||
      r.phase !== 'combat' ||
      b.wave !== r.wave ||
      !Number.isInteger(b.enemy) ||
      !e
    )
      return;
    if (r.kills.has(b.enemy)) return;
    const rapid = typeof b.shot === 'string' && b.shot.startsWith(p.id + ':rapid:');
    // Nobody carries a weapon on foot (docs/gameplay.md).
    if (rapid ? !this.rapidImpactAllowed(r, p, b.shot) : p.mode === 'foot') return;
    const damage = rapid
      ? RAPID_DCA_DAMAGE
      : Math.max(1, Math.min(800, Number(b.amount) || PROJECTILES.mg.damage));
    const amount = damage * r.balance.damage;
    this.once(
      r,
      JSON.stringify(['enemy', r.wave, b.enemy, p.id, String(b.shot || 'legacy').slice(0, 120)]),
      () => {
        this.creditEnemy(r, this.hitSource(r, p, b, rapid), b.enemy, e, amount);
        r.enemyDamage[b.enemy] = (r.enemyDamage[b.enemy] || 0) + amount;
        if (r.enemyDamage[b.enemy] >= e.hp) this.defeatEnemy(r, b.enemy);
      },
      r.enemyHits,
    );
  }
  friendly(r, p, b) {
    requireGame(typeof b.shot === 'string' && b.shot.length <= 120, 'Impact invalide.');
    const rapid = b.shot.startsWith(p.id + ':rapid:');
    if (rapid ? !this.rapidImpactAllowed(r, p, b.shot) : p.mode === 'foot') return;
    const vehicle = r.vehicles.get(p.vehicle_id),
      key = b.weapon || p.seat;
    const tankDamage =
      vehicle?.type === 'tank' && canUseWeapon('tank', p.seat, key)
        ? TANK_MG[key]?.damage
        : undefined;
    const amount =
      (rapid
        ? RAPID_DCA_DAMAGE
        : p.mode === 'turret'
          ? Math.max(0, Math.min(200, Math.round(Number(b.amount) || 80)))
          : (tankDamage ?? PROJECTILES.mg.damage)) * r.balance.damage;
    if (b.vehicle) {
      const v = r.vehicles.get(b.vehicle);
      requireGame(world(p) === 'office' && v, 'Appareil hors de cet espace.');
      this.once(r, JSON.stringify(['hull', v.id, p.id, b.shot]), () => {
        v.state.hp = Math.max(0, v.state.hp - amount);
      });
      if (v.state.hp <= 0) {
        v.ready = 0;
        for (const id of [...v.seats.values()]) {
          const mate = r.pilots.get(id);
          if (mate) this.kill(r, mate, mate.incarnation);
        }
      }
      return;
    }
    const target = r.pilots.get(b.target);
    requireGame(
      target &&
        target !== p &&
        world(target) === world(p) &&
        (b.incarnation === undefined || b.incarnation === target.incarnation),
      'Cible absente de cet espace.',
    );
    this.once(r, JSON.stringify(['health', target.id, target.incarnation, p.id, b.shot]), () => {
      r.damageEvents.push({
        id: ++r.damageSeq,
        target: target.id,
        shooter: p.id,
        amount,
        at: this.now(),
      });
      target.health = Math.max(0, target.health - amount);
      if (!target.health) this.kill(r, target, target.incarnation);
    });
  }
  // VIP lane pass (docs/purgatory-queue.md): a signed slip, paid once from the
  // common fund at the wave's price; refused when the fund cannot pay it.
  vipPass(r, p, b) {
    requireGame(
      p.life === 'dead' && world(p) === 'purgatory' && signature(b.signature),
      'Signez le coupe-file au purgatoire.',
    );
    requireGame(
      b.epoch === r.base.epoch && b.incarnation === p.incarnation,
      'Partie ou décès périmés.',
    );
    const s = values(r.souls).find(
      (s) =>
        s.kind === 'player' &&
        s.entity === p.id &&
        s.realm === 'purgatory' &&
        s.status === 'waiting',
    );
    requireGame(s, 'Âme absente de la file.');
    if (s.vip) return;
    const price = vipPrice(r.wave);
    requireGame(
      Math.round(r.dollars * 100) >= price * 100,
      `Caisse commune insuffisante : le coupe-file coûte ${price} $.`,
    );
    r.dollars = money(r.dollars - price);
    s.vip = true;
  }
  sign(r, p, b) {
    requireGame(p.life === 'dead' && signature(b.signature), 'Signez au purgatoire.');
    const realm = world(p),
      body = this.arena(r, realm, p, b.ground),
      a = r[realm],
      s = body && r.souls.get(body.id),
      forms = realm === 'super' ? 5 : 3;
    requireGame(
      body && (deskOccupant(a)?.id === body.id || (s?.vip && inVipDesk(body))),
      'Placez votre corps dans la zone du guichet.',
    );
    requireGame(
      Number.isInteger(b.form) && b.form === s.paper + 1 && b.form <= forms,
      'Signez les documents dans l’ordre.',
    );
    s.paper = b.form;
    body.paper = b.form;
    a.events.push({
      id: ++a.eventSeq,
      at: this.now(),
      kind: 'stamp',
      origin: p.id,
      target: s.id,
      x: 0,
      z: -1,
    });
    if (b.form === forms) {
      s.status = 'gone';
      body.gone = true;
      p.health = 100;
      p.incarnation++;
      p.mode = 'foot';
      p.board_paper = 0;
      p.life = realm === 'super' ? 'dead' : 'alive';
      p.state = initialState();
      if (realm !== 'super') {
        const bed = r.equipment.find((e) => e.kind === 'bed' && e.slot === p.bedId),
          destination = bedSpawn(bed, this.solids, r.equipment, values(r.vehicles));
        const start = baseBody({ id: p.id, name: p.name, bay: p.bay }, this.now());
        const spawn = destination || {
          x: start.x,
          z: start.z,
          y: start.y,
          airborne: false,
          vy: 0,
          vx: 0,
          vz: 0,
          parachute: false,
        };
        p.state.walkSpawn = spawn;
        const w = baseWorld(spawn);
        p.state.p = [w.x, w.y, w.z];
        p.state.v = [0, 0, 0];
        if (p.bedId !== null && p.bedId !== undefined && !destination)
          p.state.spawnMessage = 'Lit absent ou impraticable : retour à la zone de départ.';
      }
      r.base.bodies = (r.base.bodies || []).filter((body) => body.entity !== p.id);
      if (realm === 'super') {
        p.state.realm = 'purgatory';
        this.soul(r, 'player', p.id, p.name);
      }
    }
  }
}
function valuesSet(s) {
  return [...s];
}
