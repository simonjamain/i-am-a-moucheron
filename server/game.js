import { airField } from '../src/air-current.js';
import {
  prepareRoster,
  forecast,
  drawCards,
  resolveVote,
  purchaseBlueprint,
  equipPurchased,
} from './wave-preparation.js';
import { feedingPoint } from '../src/ground-defense-state.js';
import { DEFAULT_BALANCE, money } from '../src/balance.js';
import { BLUEPRINTS } from '../src/wave-blueprints.js';
import { deliveryStart, deliveryLanding, deliveryHeightAt } from '../src/delivery.js';
import {
  newGroundDefense,
  groundCommand,
  groundSnapshot,
  groundFlow,
  damageBarricade,
} from '../src/ground-defense-state.js';
import { groundUnit, advanceGroundUnit } from '../src/ground-creatures.js';
import { HELI, rotateLocal, steerMissile } from '../src/helicopter.js';
import {
  sweptVehicle,
  clampProximity,
  proximityRadius,
  fuseSegment,
  sweptBoxProximity,
  sweptSphereProximity,
  closestSphereProximity,
} from '../src/mobile-flak.js';
import { collisionDamage, washTarget, WASH } from '../src/vehicle-care.js';
import { purchaseCount } from '../src/equipment.js';
import { bedAccess, bedSpawn } from '../src/beds.js';
import { impactDamage } from '../src/field-physics.js';
import { randomUUID } from 'node:crypto';
import {
  MAP,
  ACTOR_UNIT,
  FLAK,
  enemySizeFactor,
  INSECT_SCALE,
  MIDGE_SPHERE_RADIUS,
} from '../src/scale.js';
import { OFFICE_LAYOUT, RAID_DURATION } from '../src/layout.js';
import { VEHICLES, vehiclePad, vehicleEntry, vehicleAccess, leftVehiclePad } from '../src/fleet.js';
import { baseWorld, baseBody, reconcileBase } from '../src/base.js';
import {
  createSoul,
  advanceArena,
  relayBodyReport,
  deskOccupant,
} from '../src/purgatory-physics.js';
import {
  wavePlan,
  ENEMY_TYPES,
  swarmFrame,
  spawnOffspring,
  assignMidgeSwarmSizes,
  MAX_OFFSPRING_ROSTER,
} from '../src/waves.js';
import { SHOP, shopPrice, supportedPlacement, waveStipend } from '../src/equipment.js';
import { advancePaidService } from '../src/paid-service.js';
import { SENTRY, fireGroundSentries } from '../src/ground-sentry.js';
import { FORTIFICATIONS, isFortification } from '../src/ground-fortifications.js';
import { FIXED_DCA_AMMO, PISTOL_CAPACITY } from '../src/ground-ammo.js';
import {
  fullAmmo,
  ammoCapacity,
  advanceSupplies,
  FUEL_SECONDS,
  installationCount,
} from '../src/logistics.js';
import { drawClause, clauseFactors } from '../src/malice.js';
import { stationAccess, stationExit } from '../src/sortie.js';
import { howitzerMuzzle, howitzerPitchAllowed } from '../src/howitzer-geometry.js';
import { validMotion } from '../src/network.js';
import { snapshotRosterCore, snapshotRosterKey } from '../src/snapshot-wire.js';
import { newBank, signLoan, settleLoans, repayLoan } from '../src/bank.js';
import { canUseWeapon, HEAVY, TANK_MG, availableShell } from '../src/armament.js';
import { sweptSphereMayTouch } from '../src/swept-broadphase.js';
import { createOrdnance, integrateOrdnance, segmentSphere, segmentBox } from '../src/ordnance.js';
import { heavyDamage } from '../src/armament.js';

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
    x: b.originX,
    y: b.deckY + 0.00005,
    z: b.originZ - 5 * ACTOR_UNIT,
    slot: -1,
    kind: 'refuel',
    name: 'Ravitaillement Alpha',
    free: true,
  };
}
function roomState(code, now) {
  return {
    code,
    balance: { ...DEFAULT_BALANCE },
    lab: { enabled: false },
    balanceRevision: 0,
    rosterRevision: 0,
    balanceOwnerToken: null,
    plan: null,
    upcomingPlan: null,
    preparation: null,
    blueprintLevels: {},
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
    upgrades: {},
    activeBlueprints: {},
    bank: newBank(),
    pilots: new Map(),
    vehicles: new Map(),
    dossiers: new Map(),
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
    pistolImpacts: new Set(),
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
    damageEvents: [],
    damageSeq: 0,
    enemyHits: new Set(),
    sequence: 0,
    soulSeq: 0,
    effectSeq: 0,
    base: { epoch: uid() },
    purgatory: { epoch: uid(), respectQueue: true },
    super: { epoch: uid(), respectQueue: true },
  };
}

// One synchronous domain operation is one atomic turn of Node's event loop.
// No SQL adapter, database, disk state or asynchronous transaction boundary.
export class Game {
  constructor({
    now = Date.now,
    solids = [],
    roomTTL = 30 * 60_000,
    maxRooms = 128,
    snapshotShareMs = 0,
    resumable = false,
  } = {}) {
    this.rooms = new Map();
    this.now = now;
    // > 0: `sync` replies of one room share a snapshot built at most this many
    // ms earlier (see snapshot()). 0 keeps one exact snapshot per command.
    this.snapshotShareMs = snapshotShareMs;
    // true: a closed connection leaves its pilot in place for the presence
    // delay (PRESENCE_MS), so that a new connection can resume it (join with
    // `resume`). false: the pilot expires and releases its seat at once.
    this.resumable = resumable;
    this.solids = solids;
    this.roomTTL = roomTTL;
    this.maxRooms = maxRooms;
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
      this.rooms.set(code, (r = roomState(code, this.now())));
    }
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
      bay,
      colorSequence:
        r.playerColors.get(resumeKey) ||
        (r.playerColors.set(resumeKey, ++r.playerSequence), r.playerSequence),
      seen: this.now(),
      life: 'alive',
      mode: 'foot',
      health: 100,
      pistolAmmo: PISTOL_CAPACITY,
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
    return { r, p };
  }
  release(r, p) {
    p.occupation++;
    const v = r.vehicles.get(p.vehicle_id);
    if (v?.seats.get(p.seat) === p.id) v.seats.delete(p.seat);
    for (const d of r.dossiers.values()) if (d.pilot === p.id) d.active = 0;
    p.vehicle_id = null;
    p.seat = null;
  }
  disconnect(code, id) {
    const r = this.rooms.get(code),
      p = r?.pilots.get(id);
    if (!p) return;
    // A resumable pilot stays until its presence expires (advance() then
    // releases its seat and refunds its orders), unless a connection resumes it.
    if (this.resumable) return;
    this.release(r, p);
    p.seen = this.now() - (PRESENCE_MS + 1);
  }
  sweep() {
    for (const [code, r] of this.rooms)
      if (!this.live(r).length && this.now() - r.touched > this.roomTTL) this.rooms.delete(code);
  }
  fleet(r) {
    for (const vehicle of r.vehicles.values()) if (!vehicle.state.landed) vehicle.ready = 0;
    for (const type of ['fighter', 'bomber'])
      if (
        !values(r.vehicles).some(
          (v) => v.type === type && v.origin === 'starter' && v.ready && v.state.hp > 0,
        )
      )
        this.createVehicle(r, type, 'starter');
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
    } else if (near && origin !== 'starter') {
      state.p[0] += (near % 4) * MAP.metres(VEHICLES[type].span + 5);
      state.p[2] += Math.ceil(near / 4) * MAP.metres(VEHICLES[type].length + 5);
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
    equipPurchased(r, vehicle);
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
    if (s.kind === 'enemy') this.reward(r, 1);
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
        if (s.kind === 'player') Object.assign(b, { x: 3.2, z: Math.max(3.2, 1.1 + i * 1.85) });
        a.bodies.push(b);
      }
      b.paper = s.paper;
      b.maxHealth = s.kind === 'enemy' ? ENEMY_TYPES[s.enemy_type].hp : 100;
      b.health =
        s.kind === 'enemy' ? b.maxHealth - s.damage : (r.pilots.get(s.entity)?.health ?? 100);
      b.enemyType = s.enemy_type;
      b.koUntil = 0;
      b.attack = null;
    }
    a.host =
      shown
        .filter((s) => s.kind === 'player')
        .map((s) => s.entity)
        .sort()[0] || null;
    if (!a.host) advanceArena(a, now);
    else a.time = now;
    const body = p && a.bodies.find((b) => b.entity === p.id && b.kind === 'player');
    if (body) relayBodyReport(a, body, report, now);
    for (const b of a.bodies) if (b.gone) this.releaseSoul(r, r.souls.get(b.id));
    a.desk = deskOccupant(a, now)?.id ?? null;
    a.events = a.events.slice(-128);
    a.revision = (a.revision || 0) + 1;
    return body;
  }
  advanceGround(r, now) {
    // Ground insects always walk the shared flow field, with or without defenses,
    // so the preparation forecast is the path walked during the wave.
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
      structures: r.groundDefense.structures,
      goalFlow: r.groundNavigation,
      baitFlow,
      damageWall: (id, amount) => damageBarricade(r.groundDefense, id, amount),
    };
    const roster = this.plan(r).roster;
    for (let i = 0; i < roster.length; i++) {
      const enemy = roster[i];
      if (!enemy.ground || r.kills.has(i)) continue;
      const availableAt = enemy.spawn + (enemy.entryHold || 0);
      if (elapsed < availableAt) continue;
      const unit =
        r.groundAgents[enemy.id] ||
        (r.groundAgents[enemy.id] = groundUnit(enemy, Math.max(previous, availableAt)));
      if (unit.arrived) continue;
      advanceGroundUnit(
        unit,
        enemy,
        elapsed,
        Math.max(0, elapsed - Math.max(previous, availableAt)),
        world,
      );
    }
  }
  advanceSentries(r, now) {
    if (
      r.phase !== 'combat' ||
      !r.groundDefense.structures.some((s) => s.kind === 'sentry' && s.hp > 0 && s.ammo >= 1)
    )
      return;
    if (now - r.sentryClock < SENTRY.intervalMs) return;
    r.sentryClock = now;
    const plan = this.plan(r);
    const frames = swarmFrame(
      plan.roster,
      (now - r.started) / 1000,
      r.groundAgents,
      airField(r.groundDefense, now),
    );
    const targets = frames.map((frame, index) =>
      frame && !r.kills.has(index) && (r.enemyDamage[index] || 0) < plan.roster[index].hp
        ? { id: index, p: frame.p, dead: false }
        : null,
    );
    const fired = fireGroundSentries(
      r.groundDefense.structures,
      targets,
      now,
      (target, sentry, damage) => {
        const id = target.id;
        r.enemyDamage[id] = (r.enemyDamage[id] || 0) + damage * r.balance.damage;
        if (r.enemyDamage[id] >= plan.roster[id].hp) this.defeatEnemy(r, id, target.p);
        r.effects.push({
          id: ++r.effectSeq,
          kind: 'sentry-shot',
          sentry: sentry.id,
          p: [sentry.position[0], 0.03, sentry.position[1]],
          target: target.p,
          at: now,
        });
      },
    );
    if (fired) r.groundDefense.revision++;
  }
  advance(r) {
    if (r.lab.enabled) r.dollars = LAB_FUNDS;
    const now = this.now();
    this.advanceGround(r, now);
    this.advanceSentries(r, now);
    this.advanceOrdnance(r, now);
    this.vehicleContacts(r, now);
    // A destroyed hull can arrive through motion before the client's death
    // command. Resolve its crew here even if that client disconnects.
    for (const p of r.pilots.values()) {
      if (p.mode !== 'turret' || p.life !== 'alive') continue;
      const station = r.equipment[p.state.turret];
      if (isFortification(station?.kind) && station.hp <= 0) this.kill(r, p, p.incarnation);
    }
    for (const v of r.vehicles.values())
      if (v.state.hp <= 0)
        for (const id of [...v.seats.values()]) {
          const mate = r.pilots.get(id);
          if (mate) this.kill(r, mate, mate.incarnation);
          else for (const [seat, occupant] of v.seats) if (occupant === id) v.seats.delete(seat);
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
    if (r.preparation) resolveVote(r);
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
      r.infestation += escaped.reduce((n, e) => n + e.leak, 0);
      // Debug mode: bin damage keeps counting, but the room cannot be lost.
      r.phase = r.infestation >= 20 && !r.lab.enabled ? 'lost' : 'prep';
      r.next_wave_at = now + r.balance.pause * 1000;
      if (r.phase === 'prep') {
        this.reward(r, waveStipend(r.wave));
        this.prepareWave(r);
      }
      r.dollars = Math.round(r.dollars * 100 - settleLoans(r.bank, r.wave)) / 100;
    }
    this.advanceDeliveries(r, now);
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
    for (const [token, d] of r.dossiers) {
      const p = r.pilots.get(d.pilot);
      if (
        !p ||
        (d.active &&
          (p.life !== 'alive' ||
            !(
              (p.vehicle_id === d.target && p.seat === d.seat) ||
              (p.mode === 'turret' && d.target === 'dca:' + p.state.turret)
            )))
      )
        d.active = 0;
      if (
        !d.active &&
        p?.state.boarding?.token !== token &&
        p?.state.equipmentBoarding?.token !== token &&
        !values(r.requests).some((q) => token === q.id + ':' + p?.id)
      )
        r.dossiers.delete(token);
    }
    if (r.lab.enabled) r.dollars = LAB_FUNDS;
  }
  resetRoom(r, lab = r.lab) {
    const pilots = r.pilots;
    const identities = r.identityTokens;
    const balance = r.balance;
    const owner = r.balanceOwnerToken;
    const revision = r.balanceRevision;
    Object.assign(r, roomState(r.code, this.now()));
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
        pistolAmmo: PISTOL_CAPACITY,
        incarnation: pilot.incarnation + 1,
        occupation: pilot.occupation + 1,
        mode: 'foot',
        vehicle_id: null,
        seat: null,
        board_paper: 0,
        state: initialState(),
        bedId: null,
      });
    if (lab.enabled)
      for (const card of Object.keys(BLUEPRINTS))
        r.blueprintLevels[card] = Math.max(1, r.blueprintLevels[card] || 0);
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
    this.prepareWave(r);
  }
  labCommand(r, b) {
    requireGame(b.epoch === r.base.epoch, 'La partie a changé ; rouvrez le mode debug.', 409);
    const action = b.action;
    if (action === 'enable') {
      requireGame(!r.lab.enabled, 'Le mode debug est déjà actif.');
      r.lab.enabled = true;
      r.dollars = LAB_FUNDS;
      for (const card of Object.keys(BLUEPRINTS))
        r.blueprintLevels[card] = Math.max(1, r.blueprintLevels[card] || 0);
      if (!r.mission_started) this.setLabWave(r, 1);
      return;
    }
    // Issue #135: debug is a plain toggle. Only enable/exit exist; the former
    // test tools (cards, waves, scenarios) are gone. Leaving resets the game so
    // no test progress leaks into a normal game.
    requireGame(action === 'exit', 'Action de debug inconnue.', 400);
    requireGame(r.lab.enabled, 'Le mode debug est déjà inactif.');
    this.resetRoom(r, { enabled: false });
  }
  plan(r) {
    return r.plan || wavePlan(r.code, r.wave, r.started);
  }
  prepareWave(r) {
    r.upcomingPlan = prepareRoster(r.wave + 1, r.balance);
    r.preparation = {
      id: uid(),
      wave: r.wave + 1,
      groups: forecast(r.upcomingPlan.roster),
      cards: drawCards(r.blueprintLevels),
      votes: {},
      winner: null,
    };
  }
  startWave(r) {
    if (r.preparation?.wave !== r.wave + 1) this.prepareWave(r);
    resolveVote(r, true);
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
    const now = this.now(),
      plan = this.plan(r),
      activePilots = this.live(r),
      pendingInstallations = Object.fromEntries(Object.keys(SHOP).map((item) => [item, 0])),
      purchases = [],
      clauses = new Map(),
      arrived = [];
    for (const order of r.purchases.values())
      if (!order.placed) {
        pendingInstallations[order.item]++;
        const { token, item, owner, price } = order;
        purchases.push({ token, item, owner, price });
      }
    for (const dossier of r.dossiers.values())
      if (dossier.active && !clauses.has(dossier.pilot)) clauses.set(dossier.pilot, dossier.clause);
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
          stunned_until: body.koUntil,
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
      blueprints: Object.keys(r.blueprintLevels),
      blueprintLevels: r.blueprintLevels,
      activeBlueprints: r.activeBlueprints,
      groundNavigationActive:
        r.groundEnabled || r.groundDefense.structures.some((s) => s.kind !== 'fan'),
      dollars: r.dollars,
      bank: r.bank,
      upgrades: r.upgrades,
      rewardCount: r.rewardCount,
      equipment: r.equipment,
      groundDefense: groundSnapshot(r.groundDefense, this.now()),
      groundAgents: r.groundEnabled ? r.groundAgents : {},
      deliveries: r.deliveries,
      pendingInstallations,
      purchases,
      initialStation: initialStation(),
      kills: valuesSet(r.kills),
      pilots: activePilots.map((p) => ({ ...p, contractClause: clauses.get(p.id) || null })),
      vehicles: values(r.vehicles).map(
        ({ shots, updated, seats, contacts, contactPosition, contactWave, ...v }) => ({
          ...v,
          seats: [...seats].map(([seat, pilot]) => ({ vehicle: v.id, seat, pilot })),
        }),
      ),
      dossiers: values(r.dossiers),
      seatRequests: values(r.requests),
      effects: r.effects.slice(-64),
      ordnance: r.ordnance,
      waveReward: money(waveStipend(r.wave), r.balance.rewards),
      difficulty: r.wave ? plan.budget : 0,
      enemyDamage: r.enemyDamage,
      raidDuration: RAID_DURATION,
      mapScale: { numerator: MAP.numerator, denominator: MAP.denominator },
      total: plan.roster.length,
      arrived,
      leaked: r.phase === 'combat' ? arrived.length : 0,
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
  clause(r, p) {
    return values(r.dossiers).find((d) => d.pilot === p.id && d.active)?.clause || null;
  }
  dossier(
    r,
    p,
    target,
    seat,
    armed = true,
    token = uid(),
    position = Math.floor(Math.random() * 2),
  ) {
    const d = {
      token,
      room: r.code,
      pilot: p.id,
      target,
      seat,
      clause: drawClause(seat, armed),
      position,
      choice: null,
      active: 0,
    };
    r.dossiers.set(token, d);
    return d;
  }
  due(r, token, paper) {
    const d = r.dossiers.get(token);
    requireGame(
      !d?.clause || d.choice || d.position > paper,
      'Traitez le feuillet courant avant de continuer.',
    );
  }
  activate(r, p, token) {
    for (const d of r.dossiers.values())
      if (d.pilot === p.id) d.active = +(d.token === token && d.choice === 'sign');
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
    this.activate(r, p, token);
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
    p.pistolAmmo = PISTOL_CAPACITY;
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
      hp: Math.max(
        0,
        Math.min(r.vehicles.get(p.vehicle_id)?.type === 'helicopter' ? 200 : 100, s.hp),
      ),
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
        ? Math.max(-0.65, Math.min(0.65, s.trailerAngle))
        : 0,
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
    const vacant = Array.isArray(b.vacant) ? b.vacant : [];
    if (vacant.length) {
      let host = null;
      const liveSince = this.now() - PRESENCE_MS;
      for (const candidate of r.pilots.values())
        if (candidate.seen > liveSince && (host === null || candidate.id < host))
          host = candidate.id;
      if (p.id === host)
        for (const report of vacant.slice(0, 100)) {
          const v = r.vehicles.get(report.id);
          if (!v || v.seats.has('pilot') || !validMotion(report.state)) continue;
          v.state = {
            ...report.state,
            hp:
              report.state.hp === v.reportedHP ? v.state.hp : Math.min(v.state.hp, report.state.hp),
          };
          v.reportedHP = report.state.hp;
          if (!v.state.landed || v.state.hp <= 0) v.ready = 0;
          if (v.state.hp <= 0)
            for (const id of [...v.seats.values()]) {
              const mate = r.pilots.get(id);
              if (mate) this.kill(r, mate, mate.incarnation);
            }
        }
    }
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
          'wave-vote',
          'wave-buy',
          'start',
          'leave',
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
    else if (path === 'pistol-trace') this.pistolTrace(r, p, b);
    else if (path === 'fixed-dca-fire') this.fixedDcaFire(r, p, b);
    else if (path === 'antitank-fire') this.antitankFire(r, p, b);
    else if (path === 'wave-vote') {
      const prep = r.preparation;
      requireGame(prep && b.preparation === prep.id && !prep.winner, 'Ce vote est clos.');
      requireGame(prep.cards.includes(b.card), 'Carte inconnue.');
      prep.votes[p.id] = b.card;
      resolveVote(r);
    } else if (path === 'wave-buy') {
      requireGame(b.epoch === r.base.epoch, 'Partie périmée.');
      try {
        purchaseBlueprint(r, b);
      } catch (error) {
        requireGame(false, error.message);
      }
    } else if (path === 'start') {
      if (!r.mission_started && !b.preparation) {
        r.mission_started = 1;
        r.next_wave_at = this.now() + r.balance.initialDelay * 1000;
        this.prepareWave(r);
      } else if (r.phase === 'prep' && r.preparation?.winner && b.preparation === r.preparation.id)
        this.startWave(r);
    } else if (path === 'reset') {
      if (b.epoch !== undefined && b.epoch !== r.base.epoch) return this.snapshot(r, options);
      this.resetRoom(r);
    } else if (path === 'bank-sign' || path === 'bank-repay') {
      requireGame(
        b.epoch === undefined || b.epoch === r.base.epoch,
        'La partie a changé. Relisez le contrat.',
      );
      if (path === 'bank-repay' && b.expectedRemaining !== undefined)
        requireGame(
          b.expectedRemaining === r.bank.slots[b.slot]?.remaining,
          'Le capital restant a changé. Relisez le remboursement.',
        );
      requireGame(
        Number.isInteger(b.slot) && b.slot >= 0 && b.slot < 3 && Number.isSafeInteger(b.serial),
        'Contrat bancaire invalide.',
        400,
      );
      requireGame(signature(b.signature), 'Signez le contrat bancaire.');
      try {
        const cents = Math.round(r.dollars * 100);
        r.dollars =
          (cents +
            (path === 'bank-sign'
              ? signLoan(r.bank, b.slot, b.serial, cents, r.wave)
              : -repayLoan(r.bank, b.slot, b.serial, cents))) /
          100;
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
    else if (path === 'dossier-choice') this.choice(r, p, b);
    else if (['seat-request', 'seat-sign', 'seat-reject'].includes(path)) this.seat(r, p, path, b);
    else if (path === 'aircraft-fire') return clone(this.fire(r, p, b));
    else if (path === 'missile-detonate') this.detonateMissile(r, p, b);
    else if (path === 'heavy-fire') this.heavyFire(r, p, b);
    else if (path === 'hit') this.hit(r, p, b);
    else if (path === 'friendly-hit') this.friendly(r, p, b);
    else if (path === 'soul-hit') this.soulHit(r, p, b);
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
        r.effects.push({ id: ++r.effectSeq, kind: 'blast', p: b.p, shot: b.shot, at: this.now() });
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
    requireGame(
      (p.life === 'alive' && p.mode === 'foot') || castor,
      'Construction réservée aux joueurs à pied et au conducteur du Castor.',
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
    if (castor) {
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
        { castor, blueprintLevels: r.blueprintLevels },
      );
    } catch (error) {
      requireGame(false, error.message, 400);
    }
    r.dollars = money(r.dollars - transaction.price);
    if (b.action === 'build')
      for (const structure of r.groundDefense.structures)
        if (transaction.ids.includes(structure.id) && equipPurchased(r, structure))
          r.groundDefense.revision++;
    if (b.action === 'build' && isFortification(b.kind)) {
      const structure = r.groundDefense.structures.find((s) => s.id === transaction.ids[0]);
      structure.slot = r.equipment.length;
      structure.x = structure.position[0];
      structure.y = 0.00005;
      structure.z = structure.position[1];
      structure.name = FORTIFICATIONS[b.kind].name;
      r.equipment.push(structure);
    }
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
    if (key) {
      r.groundDefenseOrders.set(key, true);
      if (r.groundDefenseOrders.size > 2048)
        r.groundDefenseOrders.delete(r.groundDefenseOrders.keys().next().value);
    }
  }
  fixedDcaFire(r, p, b) {
    const gun = r.equipment[b.station];
    requireGame(
      p.life === 'alive' &&
        p.mode === 'turret' &&
        Number.isInteger(b.station) &&
        p.state.turret === b.station &&
        (gun?.kind === 'dca' || (isFortification(gun?.kind) && gun.hp > 0)) &&
        p.incarnation === b.incarnation,
      'Occupez ce poste pour tirer.',
    );
    // The heavy gun fires server shells only (antitank-fire), never client rounds.
    requireGame(gun.kind !== 'antitank', 'Le canon lourd tire des obus.');
    requireGame(
      typeof b.shot === 'string' && b.shot.length > 0 && b.shot.length <= 120,
      'Identifiant de tir invalide.',
      400,
    );
    const key = p.id + ':' + p.incarnation + ':' + b.shot;
    if (r.fixedDcaShots.has(key)) return;
    requireGame(gun.ammo >= 1, 'Cette arme est à court de munitions.');
    const interval =
      ((FORTIFICATIONS[gun.kind]?.interval ?? FLAK.interval) *
        1000 *
        clauseFactors(this.clause(r, p)).interval) /
      (r.balance.fireRate || 1);
    requireGame(
      this.now() >= (gun.lastShotAt ?? -Infinity) + interval,
      'Cette arme recharge son canon.',
    );
    requireGame(r.fixedDcaShots.size < 128000, 'Trop de tirs enregistrés.', 429);
    gun.ammo -= 1;
    gun.lastShotAt = this.now();
    r.fixedDcaShots.add(key);
  }
  // Issue #113: the anti-materiel howitzer fires a server-simulated shell, like
  // the tank cannon, from its real muzzle along the barrel direction.
  antitankFire(r, p, b) {
    const gun = r.equipment[b.station];
    requireGame(
      p.life === 'alive' &&
        p.mode === 'turret' &&
        Number.isInteger(b.station) &&
        p.state.turret === b.station &&
        gun?.kind === 'antitank' &&
        gun.hp > 0 &&
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
        Math.hypot(...direction) > 0.5 &&
        howitzerPitchAllowed(direction),
      'Visée invalide.',
      400,
    );
    requireGame(gun.ammo >= 1, 'Ce canon est à court d’obus.');
    const profile = HEAVY.antitank,
      factors = clauseFactors(this.clause(r, p));
    requireGame(
      this.now() >=
        (gun.lastShotAt ?? -Infinity) +
          (profile.interval * 1000 * factors.interval) / (r.balance.fireRate || 1),
      'Ce canon recharge.',
    );
    requireGame(
      r.ordnance.length < 128 && r.ordnanceShots.size < 128000,
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
      weapon: 'antitank',
      vehicle: null,
      station: b.station,
      shooter: p.id,
      p: howitzerMuzzle(gun, dir),
      v: dir.map((v) => v * profile.speed),
      age: 0,
      at: this.now(),
      updated: this.now(),
      wave: r.wave,
      radiusFactor: 1,
      bonus: factors.damage * r.balance.damage,
    });
  }
  pistolImpact(r, p, shot) {
    // A foot soldier has no other damaging firearm. Require a validated
    // trace and allow only one impact (enemy, friendly or soul) per shot.
    if (p.mode !== 'foot') return true;
    requireGame(
      typeof shot === 'string' &&
        r.hits.has(JSON.stringify(['pistol-trace', p.id, p.incarnation, shot])),
      'Tir de pistolet non validé.',
    );
    const key = JSON.stringify(['pistol-impact', p.id, p.incarnation, shot]);
    if (r.pistolImpacts.has(key)) return false;
    requireGame(r.pistolImpacts.size < 128000, 'Trop de tirs enregistrés.', 429);
    r.pistolImpacts.add(key);
    return true;
  }
  pistolTrace(r, p, b) {
    // The pistol only exists in purgatory: nobody fires on foot in the office.
    requireGame(world(p) !== 'office', 'Aucune arme à pied dans le bureau.');
    requireGame(
      !p.state.awaitingPurgatory &&
        p.mode === 'foot' &&
        !p.vehicle_id &&
        b.incarnation === p.incarnation,
      'Pistolet indisponible.',
    );
    requireGame(
      typeof b.shot === 'string' &&
        b.shot.length <= 120 &&
        ['origin', 'direction'].every(
          (k) => Array.isArray(b[k]) && b[k].length === 3 && b[k].every(Number.isFinite),
        ),
      'Trace invalide.',
    );
    requireGame(Math.abs(Math.hypot(...b.direction) - 1) < 0.01, 'Direction invalide.');
    const key = JSON.stringify(['pistol-trace', p.id, p.incarnation, b.shot]);
    if (r.hits.has(key)) return;
    requireGame(p.pistolAmmo >= 1, 'Pistolet à court de munitions.');
    this.once(r, key, () => {
      p.pistolAmmo--;
      r.effects.push({
        id: ++r.effectSeq,
        kind: 'pistol-trace',
        shooter: p.id,
        p: b.origin,
        direction: b.direction,
        distance: Math.max(
          0,
          Math.min(
            150 * (world(p) === 'office' ? MAP.ratio : 1),
            Number.isFinite(b.distance)
              ? b.distance
              : 150 * (world(p) === 'office' ? MAP.ratio : 1),
          ),
        ),
        realm: world(p),
        at: this.now(),
      });
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
    const price = shopPrice(
      b.item,
      r.upgrades,
      purchaseCount(this.purchaseSnapshot(r), b.item),
      r.balance,
    );
    requireGame(price === b.expectedPrice, 'Le tarif a changé. Relisez le bon.');
    requireGame(r.dollars >= price, 'La caisse commune ne contient pas assez de dollars.');
    r.dollars = money(r.dollars - price);
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
      else
        r.equipment.push({
          ...landing,
          kind: delivery.item,
          name: SHOP[delivery.item].name,
          slot: r.equipment.length,
        });
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
    const frames = swarmFrame(
      plan.roster,
      (now - r.started) / 1000,
      r.groundAgents,
      airField(r.groundDefense, now),
    );
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
        if (!frame || r.kills.has(i)) return;
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
    const price = shopPrice(
      b.item,
      r.upgrades,
      purchaseCount(this.purchaseSnapshot(r), b.item),
      r.balance,
    );
    requireGame(
      prepaid || b.expectedPrice === undefined || b.expectedPrice === price,
      'Le tarif a changé.',
    );
    requireGame(
      prepaid || r.dollars >= price,
      'La caisse commune ne contient pas assez de dollars.',
    );
    requireGame(!item.max || (r.upgrades[b.item] || 0) < item.max, 'Amélioration déjà au maximum.');
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
      );
      requireGame(
        placement && Math.abs(placement.y - b.position.y) <= 0.0003,
        'La base entière doit reposer sur une surface libre.',
      );
      if (item.kind === 'vehicle') this.createVehicle(r, b.item, 'purchase', placement);
      else
        r.equipment.push({
          ...placement,
          kind: b.item,
          name: item.name,
          slot: r.equipment.length,
          ...(b.item === 'dca' ? { ammo: FIXED_DCA_AMMO } : {}),
        });
    } else if (item.kind === 'vehicle') this.createVehicle(r, b.item);
    else r.upgrades[b.item] = (r.upgrades[b.item] || 0) + 1;
    if (!prepaid) r.dollars = money(r.dollars - price);
    r.orders.set(request, b.item);
  }
  vehicle(r, p, path, b) {
    if (path === 'vehicle-exit') {
      const v = r.vehicles.get(p.vehicle_id);
      requireGame(v, 'Vous n’êtes pas à bord.');
      if (p.seat === 'pilot' && b.state && validMotion(b.state))
        v.state = { ...v.state, ...b.state, hp: Math.min(v.state.hp, b.state.hp) };
      const grounded = !!v.state.landed;
      requireGame(
        !grounded || Math.hypot(...v.state.v) <= MAP.metres(3),
        'Arrêtez l’avion avant de sortir.',
      );
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
    requireGame(
      body && vehicleAccess(baseWorld(body), v, seat),
      'Rejoignez le cercle de ce poste.',
    );
    requireGame(VEHICLES[v.type].seats.includes(seat), 'Poste invalide.');
    requireGame(!v.seats.has(seat), 'Ce poste est occupé.');
    if (path === 'vehicle-select') {
      if (p.state.boarding?.vehicle === v.id && p.state.boarding.seat === seat) return;
      const d = this.dossier(r, p, v.id, seat, true);
      p.state.equipmentBoarding = null;
      p.state.boarding = { vehicle: v.id, seat, token: d.token };
      p.board_paper = 0;
      return;
    }
    requireGame(signature(b.signature), 'Tracez votre signature dans le cadre.');
    requireGame(
      p.state.boarding?.vehicle === v.id && p.state.boarding.seat === seat,
      'Choisissez cet appareil avant de signer.',
    );
    this.due(r, p.state.boarding.token, p.board_paper);
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
        (s?.kind === 'dca' || (isFortification(s?.kind) && s.hp > 0)) &&
        body &&
        !body.parachute &&
        stationAccess(baseWorld(body), s),
      'Approchez de la défense à pied.',
    );
    if (path === 'equipment-select') {
      if (p.state.equipmentBoarding?.station === b.station) return;
      const d = this.dossier(r, p, 'dca:' + b.station, 'dca');
      p.state.boarding = null;
      p.state.equipmentBoarding = { station: b.station, paper: 0, token: d.token };
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
    this.due(r, current.token, current.paper);
    if (b.form === 1) {
      current.paper = 1;
      return;
    }
    requireGame(
      !this.live(r).some((x) => x.mode === 'turret' && x.state.turret === b.station),
      'Cette défense est déjà occupée.',
    );
    this.activate(r, p, current.token);
    p.mode = 'turret';
    Object.assign(p.state, {
      equipmentBoarding: null,
      turret: b.station,
      turretDirection: [0, 0.3, -1],
      fire: false,
    });
  }
  choice(r, p, b) {
    const current = p.state.equipmentBoarding || p.state.boarding;
    const transfer = values(r.requests).find(
      (q) =>
        b.token === q.id + ':' + p.id &&
        ((q.requester === p.id && q.status === 'signing') ||
          (q.recipient === p.id && q.status === 'offered')),
    );
    requireGame(
      p.life === 'alive' &&
        ['sign', 'tear'].includes(b.choice) &&
        (transfer || (p.mode === 'foot' && current?.token === b.token)),
      'Ce dossier n’est plus ouvert.',
    );
    const d = r.dossiers.get(b.token),
      paper = transfer ? 0 : p.state.equipmentBoarding ? current.paper : p.board_paper;
    requireGame(
      d?.pilot === p.id && d.clause && d.position <= paper,
      'Traitez les documents dans l’ordre.',
    );
    requireGame(!d.choice || d.choice === b.choice, 'Ce feuillet a déjà été traité.');
    requireGame(
      b.choice !== 'sign' || signature(b.signature),
      'Signez ce feuillet ou déchirez-le.',
    );
    d.choice = b.choice;
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
      this.dossier(r, p, v.id, b.seat, true, q.id + ':' + p.id, 0);
      if (q.recipient)
        this.dossier(r, r.pilots.get(q.recipient), v.id, p.seat, true, q.id + ':' + q.recipient, 0);
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
    this.due(r, q.id + ':' + p.id, 0);
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
      requireGame(this.now() >= (v.nextMissileAt || 0), 'Missile en recharge.');
      v.missileOccupation = p.occupation;
    }
    const selected =
      weapon === 'he' || weapon === 'ap' ? availableShell(v.supplies.ammo, weapon) : weapon;
    requireGame(selected && v.supplies.ammo[selected] >= 1, 'Réserve vide.');
    const lane = selected === 'bomb' ? 'bomb' : 'cannon';
    const factors = clauseFactors(this.clause(r, p));
    v.lastHeavy ??= {};
    requireGame(
      this.now() >=
        (v.lastHeavy[lane] ?? -Infinity) +
          (HEAVY[selected].interval / r.balance.fireRate) *
            1000 *
            (['proximity', 'rocket'].includes(selected)
              ? Math.max(1, factors.interval)
              : factors.interval),
      'Arme en recharge.',
    );
    requireGame(
      r.ordnance.length < 128 && r.ordnanceShots.size < 128000,
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
    if (selected === 'missile') {
      const local = rotateLocal(
        [-v.state.q[0], -v.state.q[1], -v.state.q[2], v.state.q[3]],
        direction,
      );
      requireGame(local[2] <= 1e-8 && local[1] <= 1e-8, 'Butée du copilote atteinte.');
    }
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
    r.ordnance.at(-1).bonus *= factors.damage * r.balance.damage;
  }
  advanceOrdnance(r, now) {
    if (!r.ordnance.length) return;
    const plan = this.plan(r);
    const frameCache = new Map();
    const framesAt = (time) => {
      const at = Math.round(time / 50) * 50;
      if (!frameCache.has(at))
        frameCache.set(
          at,
          swarmFrame(
            plan.roster,
            (at - r.started) / 1000,
            r.groundAgents,
            airField(r.groundDefense, at),
          ),
        );
      return frameCache.get(at);
    };
    for (const projectile of r.ordnance) {
      if (projectile.weapon === 'proximity') {
        this.advanceProximity(r, projectile, now, plan, framesAt);
        continue;
      }
      const vehicle = r.vehicles.get(projectile.vehicle);
      if (projectile.weapon === 'missile' && (!vehicle || vehicle.state.hp <= 0)) {
        projectile.done = true;
        continue;
      }
      const profile = HEAVY[projectile.weapon],
        end = Math.min(now, projectile.at + profile.lifetime * 1000);
      const horizon = Math.max(0, (end - projectile.updated) / 1000);
      const lower = projectile.p.map(
        (v, i) =>
          v +
          Math.min(0, projectile.v[i]) * horizon -
          (i === 1 ? MAP.metres(9.81) * horizon * horizon : 0),
      );
      const upper = projectile.p.map((v, i) => v + Math.max(0, projectile.v[i]) * horizon);
      const nearbySolids = this.solids.filter(
        (box) =>
          projectile.weapon === 'missile' ||
          ['x', 'y', 'z'].every(
            (key, i) => box.max[key] >= lower[i] - 0.001 && box.min[key] <= upper[i] + 0.001,
          ),
      );
      while (projectile.updated < end && !projectile.done) {
        const dt = Math.min(1 / 120, (end - projectile.updated) / 1000);
        if (projectile.weapon === 'missile') {
          const owner = r.pilots.get(projectile.shooter);
          if (
            owner?.life === 'alive' &&
            owner.vehicle_id === projectile.vehicle &&
            owner.seat === 'copilot' &&
            owner.occupation === projectile.occupation
          ) {
            const direction = owner.state.turretDirection || [0, 0, -1];
            // Directional guidance must not chase a fixed point behind the missile.
            const length = Math.hypot(...direction) || 1;
            steerMissile(
              projectile,
              projectile.p.map((v, i) => v + direction[i] / length),
              dt,
            );
          }
        }
        const a = integrateOrdnance(projectile, dt),
          b = projectile.p;
        projectile.updated += dt * 1000;
        let hit = null;
        const consider = (t, target) => {
          if (t !== null && t >= 0 && t <= 1 && (!hit || t < hit.t)) hit = { t, ...target };
        };
        for (const solid of nearbySolids) consider(segmentBox(a, b, solid), { solid: true });
        if (b[1] <= 0) consider(a[1] / Math.max(1e-12, a[1] - b[1]), { solid: true });
        const frames =
          r.phase === 'combat' && projectile.wave === r.wave ? framesAt(projectile.updated) : [];
        for (let i = 0; i < frames.length; i++) {
          if (!frames[i] || r.kills.has(i)) continue;
          const enemy = plan.roster[i];
          const radius =
            enemy.type === 'midge' || enemy.type === 'spiderling'
              ? INSECT_SCALE *
                enemy.size *
                enemySizeFactor(enemy.type) *
                (enemy.type === 'midge' ? MIDGE_SPHERE_RADIUS : 1.2)
              : MAP.metres(enemy.size * 0.7 * enemySizeFactor(enemy.type));
          // Cheap swept-AABB rejection before the exact segment/sphere calculation.
          if (!sweptSphereMayTouch(a, b, frames[i].p, radius)) continue;
          consider(segmentSphere(a, b, frames[i].p, radius), { enemy: i });
        }
        for (const v of r.vehicles.values())
          if (v.id !== projectile.vehicle && v.state.hp > 0)
            consider(segmentSphere(a, b, v.state.p, MAP.metres(VEHICLES[v.type].span * 0.3)), {
              vehicle: v.id,
            });
        for (const p of r.pilots.values())
          // A fixed gun's own crew stands behind the muzzle, never in its path.
          if (p.life === 'alive' && !p.vehicle_id && p.id !== projectile.shooter) {
            const point = this.playerPosition(r, p);
            if (point) consider(segmentSphere(a, b, point, MAP.metres(0.6)), { player: p.id });
          }
        if (hit) {
          const point = a.map((v, i) => v + (b[i] - v) * hit.t);
          projectile.p = point;
          projectile.done = true;
          this.ordnanceImpact(r, projectile, hit, frames, point);
        }
      }
      if (
        projectile.age >= profile.lifetime ||
        projectile.updated >= projectile.at + profile.lifetime * 1000
      )
        projectile.done = true;
    }
    for (const shot of r.ordnance)
      if (shot.done && shot.weapon === 'missile') {
        const v = r.vehicles.get(shot.vehicle);
        if (v) v.nextMissileAt = now + 2000 / r.balance.fireRate;
      }
    r.ordnance = r.ordnance.filter((p) => !p.done);
  }
  detonateMissile(r, p, b) {
    const v = r.vehicles.get(p.vehicle_id);
    requireGame(
      p.life === 'alive' &&
        v?.type === 'helicopter' &&
        p.seat === 'copilot' &&
        b.occupation === p.occupation,
      'Guidage indisponible.',
    );
    const shot = r.ordnance.find(
      (s) =>
        s.weapon === 'missile' &&
        s.vehicle === v.id &&
        s.shooter === p.id &&
        s.occupation === p.occupation &&
        s.shot === b.shot,
    );
    requireGame(shot, 'Missile absent.');
    const plan = this.plan(r);
    const frames =
      r.phase === 'combat' && shot.wave === r.wave
        ? swarmFrame(
            plan.roster,
            (this.now() - r.started) / 1000,
            r.groundAgents,
            airField(r.groundDefense, this.now()),
          )
        : [];
    this.ordnanceImpact(r, shot, {}, frames, shot.p);
    r.ordnance = r.ordnance.filter((s) => s !== shot);
    v.nextMissileAt = this.now() + 2000 / r.balance.fireRate;
  }
  advanceProximity(r, projectile, now, plan, framesAt) {
    const profile = HEAVY.proximity,
      end = Math.min(now, projectile.at + profile.lifetime * 1000);
    const radius = proximityRadius(projectile.proximity);
    const horizon = Math.max(0, (end - projectile.updated) / 1000);
    const nearby = this.solids.filter((box) =>
      ['x', 'y', 'z'].every((key, i) => {
        const reach =
          Math.abs(projectile.v[i]) * horizon +
          (i === 1 ? MAP.metres(9.81) * horizon * horizon : 0) +
          radius;
        return box.max[key] >= projectile.p[i] - reach && box.min[key] <= projectile.p[i] + reach;
      }),
    );
    while (projectile.updated < end && !projectile.done) {
      const ageBefore = projectile.age;
      const dt = Math.min(
        1 / 120,
        (end - projectile.updated) / 1000,
        ageBefore < 0.3 - 1e-12 ? 0.3 - ageBefore : Infinity,
      );
      const a = integrateOrdnance(projectile, dt),
        b = projectile.p;
      projectile.updated += dt * 1000;
      const frames =
        r.phase === 'combat' && projectile.wave === r.wave ? framesAt(projectile.updated) : [];
      const armed = fuseSegment(a, b, ageBefore, projectile.age);
      let hit = null;
      const consider = (t, kind) => {
        if (t !== null && (!hit || t < hit.t)) hit = { t, kind };
      };
      const solid = (box) => {
        const impact = segmentBox(a, b, box);
        // A contact strictly before arming is inert, including on thin geometry.
        if (impact !== null && (!armed || impact < armed.t - 1e-12)) consider(impact, 'inert');
        if (armed) {
          const t = sweptBoxProximity(armed.a, b, box, radius, true);
          if (t !== null) consider(armed.t + t * (1 - armed.t), 'fuse');
        }
      };
      for (const box of nearby) solid(box);
      solid({ min: { x: -100, y: -100, z: -100 }, max: { x: 100, y: 0, z: 100 } });
      const previousFrames = armed && frames.length ? framesAt(projectile.updated - dt * 1000) : [];
      const sphere = (centre, size, own = false, previous = centre) => {
        const impact = sweptSphereProximity(a, b, centre, size);
        if (!own && impact !== null && (!armed || impact < armed.t - 1e-12))
          consider(impact, 'inert');
        if (armed) {
          const start = previous.map((v, i) => v + (centre[i] - v) * armed.t);
          const relativeEnd = b.map((v, i) => v - (centre[i] - start[i]));
          const t = closestSphereProximity(armed.a, relativeEnd, start, size, radius);
          if (t !== null) consider(armed.t + t * (1 - armed.t), 'fuse');
        }
      };
      frames.forEach((f, i) => {
        if (f && !r.kills.has(i))
          sphere(
            f.p,
            MAP.metres(
              plan.roster[i].size *
                0.7 *
                (enemySizeFactor(plan.roster[i].type) *
                  (plan.roster[i].type === 'midge' ? 1.2 : 1)),
            ),
            false,
            previousFrames[i]?.p || f.p,
          );
      });
      for (const v of r.vehicles.values())
        if (v.state.hp > 0) {
          const impact = sweptVehicle(a, b, v, 0);
          if (
            v.id !== projectile.vehicle &&
            impact !== null &&
            (!armed || impact < armed.t - 1e-12)
          )
            consider(impact, 'inert');
          if (armed) {
            const t = sweptVehicle(armed.a, b, v, radius, true);
            if (t !== null) consider(armed.t + t * (1 - armed.t), 'fuse');
          }
        }
      for (const p of r.pilots.values())
        if (p.life === 'alive' && !p.vehicle_id) {
          const point = this.playerPosition(r, p);
          if (point) sphere(point, MAP.metres(0.6));
        }
      for (const e of r.equipment) sphere([e.x, e.y + MAP.metres(1), e.z], MAP.metres(1));
      if (hit) {
        projectile.done = true;
        projectile.p = a.map((v, i) => v + (b[i] - v) * hit.t);
        if (hit.kind === 'fuse') this.ordnanceImpact(r, projectile, {}, frames, projectile.p);
      }
    }
    if (projectile.updated >= projectile.at + profile.lifetime * 1000) projectile.done = true;
  }
  ordnanceImpact(r, projectile, hit, frames, point) {
    const weapon = projectile.weapon,
      profile = HEAVY[weapon];
    r.effects.push({
      id: ++r.effectSeq,
      kind: weapon === 'ap' ? 'piercing' : 'blast',
      p: point,
      shot: projectile.shot,
      radius: profile.radius * (projectile.radiusFactor || 1),
      at: this.now(),
    });
    const enemy = (index, damage) => {
      const e = this.plan(r).roster[index];
      if (!e || r.kills.has(index)) return;
      r.enemyDamage[index] = (r.enemyDamage[index] || 0) + damage;
      if (r.enemyDamage[index] >= e.hp) this.defeatEnemy(r, index, frames[index]?.p);
    };
    const hull = (id, damage) => {
      const v = r.vehicles.get(id);
      if (!v) return;
      v.state.hp = Math.max(0, v.state.hp - damage);
      if (v.state.hp === 0)
        for (const id of [...v.seats.values()]) {
          const p = r.pilots.get(id);
          if (p) this.kill(r, p, p.incarnation);
        }
    };
    if (weapon === 'ap') {
      if (hit.enemy !== undefined) enemy(hit.enemy, profile.damage * projectile.bonus);
      if (hit.vehicle) hull(hit.vehicle, profile.damage * projectile.bonus);
      if (hit.player) {
        const p = r.pilots.get(hit.player);
        if (p) this.kill(r, p, p.incarnation);
      }
      return;
    }
    const damage = (position) => {
      const distance = Math.hypot(...point.map((v, i) => v - position[i]));
      if (distance > profile.radius * (projectile.radiusFactor || 1)) return 0;
      const obstructed = this.solids.some((box) => {
        const t = segmentBox(
          point.map((v, i) => v + (i === 1 ? MAP.metres(0.05) : 0)),
          position,
          box,
        );
        return t !== null && t > 0.001 && t < 0.999;
      });
      return obstructed
        ? 0
        : heavyDamage(weapon, distance, projectile.bonus, projectile.radiusFactor || 1);
    };
    // The heavy gun's small blast is narrower than a large insect: the target it
    // strikes takes the full charge, the blast only reaches the others.
    const direct = weapon === 'antitank';
    if (direct && hit.enemy !== undefined) enemy(hit.enemy, profile.damage * projectile.bonus);
    if (direct && hit.vehicle) hull(hit.vehicle, profile.damage * projectile.bonus);
    frames.forEach((f, i) => {
      if (f && !(direct && hit.enemy === i)) {
        const n = damage(f.p);
        if (n) enemy(i, n);
      }
    });
    for (const v of r.vehicles.values())
      if (v.state.hp > 0 && !(direct && hit.vehicle === v.id)) {
        const n = damage(v.state.p);
        if (n) hull(v.id, n);
      }
    for (const p of r.pilots.values())
      if (p.life === 'alive' && !p.vehicle_id) {
        const position = this.playerPosition(r, p);
        if (!position) continue;
        const n = damage(position);
        if (n) {
          p.health = Math.max(0, p.health - n);
          if (!p.health) this.kill(r, p, p.incarnation);
        }
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
    if (!e.offspringOnly) this.soul(r, 'enemy', r.wave + ':' + index, e.name, 'purgatory', e.type);
    if (e.onDeath?.spawn) {
      const at = (this.now() - r.started) / 1000;
      const location =
        position ||
        swarmFrame(
          plan.roster,
          at,
          r.groundAgents,
          airField(r.groundDefense, r.started + at * 1000),
        )[index]?.p;
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
    if (!this.pistolImpact(r, p, b.shot)) return;
    const amount = Math.max(1, Math.min(800, Number(b.amount) || 75)) * r.balance.damage;
    this.once(
      r,
      JSON.stringify(['enemy', r.wave, b.enemy, p.id, String(b.shot || 'legacy').slice(0, 120)]),
      () => {
        r.enemyDamage[b.enemy] = (r.enemyDamage[b.enemy] || 0) + amount;
        if (r.enemyDamage[b.enemy] >= e.hp) this.defeatEnemy(r, b.enemy);
      },
      r.enemyHits,
    );
  }
  friendly(r, p, b) {
    requireGame(typeof b.shot === 'string' && b.shot.length <= 120, 'Impact invalide.');
    const vehicle = r.vehicles.get(p.vehicle_id),
      key = b.weapon || p.seat;
    const tankDamage =
      vehicle?.type === 'tank' && canUseWeapon('tank', p.seat, key)
        ? TANK_MG[key]?.damage
        : undefined;
    const amount =
      (p.mode === 'foot'
        ? 10
        : p.mode === 'turret'
          ? Math.max(0, Math.min(200, Math.round(Number(b.amount) || 80)))
          : (tankDamage ?? 75)) *
      (p.mode === 'foot' ? 1 : clauseFactors(this.clause(r, p)).damage) *
      r.balance.damage;
    if (b.vehicle) {
      const v = r.vehicles.get(b.vehicle);
      requireGame(world(p) === 'office' && v, 'Appareil hors de cet espace.');
      if (!this.pistolImpact(r, p, b.shot)) return;
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
    if (!this.pistolImpact(r, p, b.shot)) return;
    this.once(r, JSON.stringify(['health', target.id, target.incarnation, p.id, b.shot]), () => {
      r.damageEvents.push({
        id: ++r.damageSeq,
        target: target.id,
        shooter: p.id,
        amount,
        at: this.now(),
      });
      const shelter = target.mode === 'turret' ? r.equipment[target.state.turret] : null;
      let toBody = amount;
      if (shelter?.kind === 'bunker' && shelter.hp > 0) {
        const absorbed = Math.min(shelter.hp, amount * 0.85);
        shelter.hp = Math.max(0, shelter.hp - absorbed);
        toBody -= absorbed;
        r.groundDefense.revision++;
        if (shelter.hp === 0) r.groundDefense.navigationRevision++;
      }
      target.health = Math.max(0, target.health - toBody);
      if (!target.health) this.kill(r, target, target.incarnation);
    });
  }
  soulHit(r, p, b) {
    requireGame(
      p.mode === 'foot' &&
        world(p) !== 'office' &&
        typeof b.shot === 'string' &&
        b.shot.length <= 120,
      'Pistolet indisponible.',
    );
    if (r.hits.has(JSON.stringify(['soul', Number(b.soul), p.id, b.shot]))) return;
    const s = r.souls.get(Number(b.soul));
    requireGame(s?.kind === 'enemy' && s.realm === world(p), 'Âme absente.');
    if (!this.pistolImpact(r, p, b.shot)) return;
    this.once(r, JSON.stringify(['soul', s.id, p.id, b.shot]), () => {
      if (s.status === 'waiting') {
        s.damage += 10 * r.balance.damage;
        if (s.damage >= ENEMY_TYPES[s.enemy_type].hp) this.releaseSoul(r, s);
      }
    });
  }
  sign(r, p, b) {
    requireGame(p.life === 'dead' && signature(b.signature), 'Signez au purgatoire.');
    const realm = world(p),
      body = this.arena(r, realm, p, b.ground),
      a = r[realm],
      s = body && r.souls.get(body.id),
      forms = realm === 'super' ? 5 : 3;
    requireGame(
      body && deskOccupant(a, this.now())?.id === body.id,
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
      p.pistolAmmo = PISTOL_CAPACITY;
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
