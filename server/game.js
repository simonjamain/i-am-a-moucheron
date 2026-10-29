import { randomUUID } from 'node:crypto';
import { MAP, ACTOR_UNIT } from '../src/scale.js';
import { OFFICE_LAYOUT, RAID_DURATION } from '../src/layout.js';
import { VEHICLES, vehiclePad, vehicleEntry, vehicleAccess, leftVehiclePad } from '../src/fleet.js';
import { baseWorld, reconcileBase } from '../src/base.js';
import {
  createSoul,
  advanceArena,
  relayBodyReport,
  deskOccupant,
} from '../src/purgatory-physics.js';
import { wavePlan, ENEMY_TYPES } from '../src/waves.js';
import { SHOP, shopPrice, supportedPlacement, waveStipend } from '../src/equipment.js';
import {
  fullAmmo,
  ammoCapacity,
  advanceSupplies,
  FUEL_SECONDS,
  installationCount,
} from '../src/logistics.js';
import { drawClause, clauseFactors } from '../src/malice.js';
import { stationAccess } from '../src/sortie.js';
import { validMotion } from '../src/network.js';

const uid = () => randomUUID();
const values = (m) => [...m.values()];
const clone = (x) => structuredClone(x);
function requireGame(ok, message, status = 409) {
  if (!ok) throw Object.assign(new Error(message), { status });
}
const world = (p) =>
  p.life === 'alive' ? 'office' : p.state.realm === 'super' ? 'super' : 'purgatory';
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
    created: now,
    touched: now,
    wave: 0,
    started: 0,
    phase: 'prep',
    fan: 0,
    infestation: 0,
    mission_started: 0,
    next_wave_at: 0,
    dollars: 0,
    rewardCount: 0,
    upgrades: {},
    pilots: new Map(),
    vehicles: new Map(),
    dossiers: new Map(),
    requests: new Map(),
    souls: new Map(),
    orders: new Map(),
    hits: new Set(),
    kills: new Set(),
    enemyDamage: {},
    equipment: [],
    effects: [],
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

// One synchronous domain operation is one atomic turn of Node's event loop.
// No SQL adapter, database, disk state or asynchronous transaction boundary.
export class Game {
  constructor({ now = Date.now, solids = [], roomTTL = 30 * 60_000, maxRooms = 128 } = {}) {
    this.rooms = new Map();
    this.now = now;
    this.solids = solids;
    this.roomTTL = roomTTL;
    this.maxRooms = maxRooms;
  }
  live(r) {
    return values(r.pilots).filter((p) => p.seen > this.now() - 12000);
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
    const active = this.live(r),
      used = new Set(active.map((p) => p.bay));
    requireGame(active.length < 100, 'La partie est complète (100 pilotes).');
    let bay = 0;
    while (used.has(bay)) bay++;
    const p = {
      id: uid(),
      room: code,
      name:
        String(b.name || 'Pilote')
          .trim()
          .slice(0, 20) || 'Pilote',
      bay,
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
    r.pilots.set(p.id, p);
    r.touched = this.now();
    return clone({ id: p.id, state: p.state, snapshot: this.snapshot(r) });
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
    this.release(r, p);
    p.seen = this.now() - 12001;
  }
  sweep() {
    for (const [code, r] of this.rooms)
      if (!this.live(r).length && this.now() - r.touched > this.roomTTL) this.rooms.delete(code);
  }
  fleet(r) {
    for (const type of Object.keys(VEHICLES).filter(
      (t) => t !== 'interceptor' || r.upgrades.interceptor,
    ))
      if (!values(r.vehicles).some((v) => v.type === type && v.ready)) {
        const id = uid();
        r.vehicles.set(id, {
          id,
          room: r.code,
          type,
          state: vehiclePad(type),
          ready: 1,
          created: this.now(),
          seats: new Map(),
          updated: this.now(),
          shots: new Set(),
          supplies: {
            fuel: FUEL_SECONDS,
            ammo: fullAmmo(type),
            sequence: ++r.sequence,
            revision: 0,
          },
        });
      }
    for (const v of r.vehicles.values()) {
      const now = Math.max(this.now(), v.updated);
      v.supplies = {
        ...v.supplies,
        ...advanceSupplies(
          v.supplies,
          v.state,
          v.type,
          [...r.equipment, initialStation()],
          (now - v.updated) / 1000,
        ),
        revision: v.supplies.revision + 1,
      };
      v.updated = now;
    }
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
    if (s.kind === 'enemy') {
      r.dollars++;
      r.rewardCount++;
    }
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
      if (!b) a.bodies.push((b = createSoul(s, i, now)));
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
  advance(r) {
    const now = this.now();
    for (const [id, p] of r.pilots)
      if (p.seen <= now - 12000) {
        this.release(r, p);
        for (const s of r.souls.values())
          if (s.kind === 'player' && s.entity === id) s.status = 'gone';
        r.pilots.delete(id);
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
    const plan = wavePlan(r.code, r.wave, r.started);
    const escaped = plan.roster.filter(
      (e, i) => !r.kills.has(i) && (now - r.started) / 1000 >= e.spawn + e.duration,
    );
    if (r.phase === 'combat' && r.kills.size + escaped.length >= plan.roster.length) {
      r.infestation += escaped.reduce((n, e) => n + e.leak, 0);
      r.phase = r.infestation >= 20 ? 'lost' : 'prep';
      r.next_wave_at = now + 10000;
      if (r.phase === 'prep') {
        const n = waveStipend(r.wave);
        r.dollars += n;
        r.rewardCount += n;
      }
    }
    this.fleet(r);
    this.base(r);
    this.arena(r, 'purgatory');
    this.arena(r, 'super');
    r.effects = r.effects.filter((e) => e.at > now - 15000);
    r.damageEvents = r.damageEvents.filter((e) => e.at > now - 15000).slice(-256);
    for (const [id, s] of r.souls) if (s.status === 'gone') r.souls.delete(id);
    for (const [id, v] of r.vehicles) {
      if (v.state.hp <= 0 && !v.seats.size) {
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
  }
  startWave(r) {
    r.phase = 'combat';
    r.wave++;
    r.started = this.now();
    r.next_wave_at = 0;
    r.kills.clear();
    r.enemyDamage = {};
    r.enemyHits.clear();
  }
  snapshot(r) {
    this.advance(r);
    const now = this.now(),
      plan = wavePlan(r.code, r.wave, r.started);
    const souls = (realm) =>
      values(r.souls)
        .filter(
          (s) =>
            s.realm === realm &&
            s.status === 'waiting' &&
            r[realm].bodies.some((b) => b.id === s.id),
        )
        .map((s) => {
          const b = r[realm].bodies.find((b) => b.id === s.id);
          return { ...s, ...(b ? { hp: b.health, stunned_until: b.koUntil, body: b } : {}) };
        });
    return clone({
      code: r.code,
      wave: r.wave,
      started: r.started,
      phase: r.phase,
      fan: r.fan,
      infestation: r.infestation,
      mission_started: r.mission_started,
      next_wave_at: r.next_wave_at,
      dollars: r.dollars,
      upgrades: r.upgrades,
      rewardCount: r.rewardCount,
      equipment: r.equipment,
      initialStation: initialStation(),
      kills: valuesSet(r.kills),
      pilots: this.live(r).map((p) => ({ ...p, contractClause: this.clause(r, p) })),
      vehicles: values(r.vehicles).map(({ shots, updated, seats, ...v }) => ({
        ...v,
        seats: [...seats].map(([seat, pilot]) => ({ vehicle: v.id, seat, pilot })),
      })),
      dossiers: values(r.dossiers),
      seatRequests: values(r.requests),
      effects: r.effects.slice(-64),
      waveReward: waveStipend(r.wave),
      roster: plan.roster,
      difficulty: r.wave ? plan.budget : 0,
      enemyDamage: r.enemyDamage,
      raidDuration: RAID_DURATION,
      mapScale: { numerator: MAP.numerator, denominator: MAP.denominator },
      total: plan.roster.length,
      leaked:
        r.phase === 'combat'
          ? plan.roster.filter(
              (e, i) => !r.kills.has(i) && (now - r.started) / 1000 >= e.spawn + e.duration,
            ).length
          : 0,
      now,
      sentAt: now,
      souls: souls('purgatory'),
      arena: r.purgatory,
      superSouls: souls('super'),
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
    if (incarnation !== undefined && incarnation !== null && incarnation !== p.incarnation) return;
    if (incarnation == null && p.life === 'dead') return;
    const realm = world(p) === 'office' ? 'purgatory' : 'super';
    this.release(r, p);
    for (const s of r.souls.values())
      if (s.kind === 'player' && s.entity === p.id) s.status = 'gone';
    p.life = 'dead';
    p.health = 100;
    p.incarnation++;
    p.mode = 'foot';
    p.board_paper = 0;
    p.state = { ...initialState(), realm };
    this.soul(r, 'player', p.id, p.name, realm);
  }
  sync(r, p, b) {
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
      hp: Math.max(0, Math.min(100, s.hp)),
      wing: s.wing,
      engine: s.engine,
      fire: (flying || ['crew', 'turret'].includes(p.mode)) && s.fire,
      ground: s.ground || null,
      gas: Number.isFinite(s.gas) ? Math.max(0, Math.min(1, s.gas)) : (old.gas ?? 0.65),
      omega:
        Array.isArray(s.omega) && s.omega.length === 3 && s.omega.every(Number.isFinite)
          ? s.omega
          : old.omega || [0, 0, 0],
      landed: flying ? !!s.landed : !!old.landed,
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
      v.state = { ...safe, hp: Math.min(v.state.hp, safe.hp), type: v.type };
      if (leftVehiclePad(v) || v.state.hp <= 0) v.ready = 0;
    }
    const host = this.live(r)
      .map((p) => p.id)
      .sort()[0];
    if (p.id === host)
      for (const report of (Array.isArray(b.vacant) ? b.vacant : []).slice(0, 100)) {
        const v = r.vehicles.get(report.id);
        if (!v || v.seats.has('pilot') || !validMotion(report.state)) continue;
        v.state = { ...report.state, hp: Math.min(v.state.hp, report.state.hp) };
        if (leftVehiclePad(v) || v.state.hp <= 0) v.ready = 0;
        if (v.state.hp <= 0)
          for (const id of [...v.seats.values()]) {
            const mate = r.pilots.get(id);
            if (mate) this.kill(r, mate, mate.incarnation);
          }
      }
    if (p.life === 'alive' && p.mode === 'foot') this.base(r, p, b.ground);
    if (p.life === 'dead') this.arena(r, world(p), p, b.ground);
  }
  command(code, id, path, b = {}) {
    const { r, p } = this.player(code, id);
    this.advance(r);
    requireGame(r.pilots.has(id), 'Connexion expirée. Rechargez la page.', 401);
    p.seen = this.now();
    r.touched = this.now();
    if (path === 'sync') this.sync(r, p, b);
    else if (path === 'start') {
      if (!r.mission_started) {
        r.mission_started = 1;
        r.next_wave_at = this.now() + 10000;
      } else if (r.phase === 'prep' && r.wave > 0) this.startWave(r);
    } else if (path === 'fan') r.fan = 1 - r.fan;
    else if (path === 'reset') {
      const pilots = r.pilots;
      Object.assign(r, roomState(r.code, this.now()));
      r.pilots = pilots;
      for (const p of pilots.values())
        Object.assign(p, {
          life: 'alive',
          health: 100,
          incarnation: p.incarnation + 1,
          occupation: p.occupation + 1,
          mode: 'foot',
          vehicle_id: null,
          seat: null,
          board_paper: 0,
          state: initialState(),
        });
    } else if (path === 'buy') this.buy(r, p, b);
    else if (['vehicle-select', 'vehicle-sign', 'vehicle-exit'].includes(path))
      this.vehicle(r, p, path, b);
    else if (['equipment-select', 'equipment-sign', 'turret'].includes(path))
      this.equipment(r, p, path, b);
    else if (path === 'dossier-choice') this.choice(r, p, b);
    else if (['seat-request', 'seat-sign', 'seat-reject'].includes(path)) this.seat(r, p, path, b);
    else if (path === 'aircraft-fire') return clone(this.fire(r, p, b));
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
    const result = this.snapshot(r);
    result.damage = clone(
      r.damageEvents.filter(
        (e) =>
          e.target === p.id && e.id > (Number.isSafeInteger(b.damageSince) ? b.damageSince : 0),
      ),
    );
    return result;
  }
  buy(r, p, b) {
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
    const price = shopPrice(b.item, r.upgrades, installationCount(r.equipment, b.item));
    requireGame(b.expectedPrice === undefined || b.expectedPrice === price, 'Le tarif a changé.');
    requireGame(r.dollars >= price, 'La caisse commune ne contient pas assez de dollars.');
    requireGame(!item.max || (r.upgrades[b.item] || 0) < item.max, 'Amélioration déjà au maximum.');
    if (item.kind === 'placement') {
      requireGame(
        p.mode === 'foot' &&
          b.position &&
          ['x', 'y', 'z'].every((k) => Number.isFinite(b.position[k])),
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
      requireGame(r.equipment.length < 24, 'Limite de 24 équipements atteinte.');
      const placement = supportedPlacement(
        { ...b.position, y: w.y },
        this.solids,
        [...r.equipment, initialStation()],
        b.item,
      );
      requireGame(
        placement && Math.abs(placement.y - b.position.y) <= 0.0003,
        'La base entière doit reposer sur une surface libre.',
      );
      requireGame(
        !values(r.vehicles).some(
          (v) =>
            v.state.landed &&
            Math.abs(v.state.p[1] - placement.y) < MAP.metres(4) &&
            Math.hypot(v.state.p[0] - placement.x, v.state.p[2] - placement.z) <
              (VEHICLES[v.type].span * ACTOR_UNIT) / 2 +
                (b.item === 'refuel' ? 0.065 : MAP.metres(2.1)),
        ),
        'Éloignez l’installation des appareils garés.',
      );
      r.equipment.push({ ...placement, kind: b.item, name: item.name, slot: r.equipment.length });
    } else r.upgrades[b.item] = (r.upgrades[b.item] || 0) + 1;
    r.dollars -= price;
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
      const ejectAll = p.seat === 'pilot' && !grounded,
        e = vehicleEntry(v);
      const occupants = ejectAll ? values(r.pilots).filter((x) => x.vehicle_id === v.id) : [p];
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
      if (ejectAll) r.vehicles.delete(v.id);
      return;
    }
    const v = r.vehicles.get(b.vehicle),
      seat = b.seat || 'pilot';
    requireGame(
      p.life === 'alive' && p.mode === 'foot' && v,
      'Approchez d’un appareil disponible.',
    );
    const body = this.base(r, p, b.ground);
    requireGame(body && vehicleAccess(baseWorld(body), v), 'Rejoignez la porte de cet appareil.');
    requireGame(VEHICLES[v.type].seats.includes(seat), 'Poste invalide.');
    requireGame(!v.seats.has(seat), 'Ce poste est occupé.');
    if (path === 'vehicle-select') {
      if (p.state.boarding?.vehicle === v.id && p.state.boarding.seat === seat) return;
      const d = this.dossier(r, p, v.id, seat, !(v.type === 'bomber' && seat === 'pilot'));
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
    requireGame(p.life === 'alive', 'Revenez à la vie avant de servir une DCA.');
    if (p.mode === 'turret') {
      const s = r.equipment[p.state.turret];
      requireGame(s, 'Poste invalide.');
      p.state.walkSpawn = {
        x: (s.x + MAP.metres(3) - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
        z: (OFFICE_LAYOUT.base.originZ - s.z) / ACTOR_UNIT,
        y: s.y + 0.05 * ACTOR_UNIT,
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
        s?.kind === 'dca' &&
        body &&
        !body.parachute &&
        stationAccess(baseWorld(body), s),
      'Approchez de la DCA à pied.',
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
      'Cette DCA est déjà occupée.',
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
      this.dossier(
        r,
        p,
        v.id,
        b.seat,
        !(v.type === 'bomber' && b.seat === 'pilot'),
        q.id + ':' + p.id,
        0,
      );
      if (q.recipient)
        this.dossier(
          r,
          r.pilots.get(q.recipient),
          v.id,
          p.seat,
          !(v.type === 'bomber' && p.seat === 'pilot'),
          q.id + ':' + q.recipient,
          0,
        );
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
  fire(r, p, b) {
    const shots = Array.isArray(b.shots) ? b.shots : [b.shot],
      v = r.vehicles.get(p.vehicle_id),
      seat = p.seat;
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
        ammoCapacity(v.type, seat),
      'Poste armé requis.',
    );
    let allowed = false;
    for (const shot of shots) {
      const key = p.id + ':' + shot;
      if (v.shots.has(key)) {
        allowed = true;
        continue;
      }
      if (v.supplies.ammo[seat] >= 1) {
        requireGame(
          v.shots.size < 128000,
          'Limite de rapports de tirs atteinte ; changez d’appareil.',
          429,
        );
        v.supplies.ammo[seat]--;
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
  hit(r, p, b) {
    const e = wavePlan(r.code, r.wave, r.started).roster[b.enemy];
    if (
      p.life !== 'alive' ||
      r.phase !== 'combat' ||
      b.wave !== r.wave ||
      !Number.isInteger(b.enemy) ||
      !e
    )
      return;
    const amount = Math.max(1, Math.min(800, Number(b.amount) || 75));
    this.once(
      r,
      JSON.stringify(['enemy', r.wave, b.enemy, p.id, String(b.shot || 'legacy').slice(0, 120)]),
      () => {
        r.enemyDamage[b.enemy] = (r.enemyDamage[b.enemy] || 0) + amount;
        if (r.enemyDamage[b.enemy] >= e.hp && !r.kills.has(b.enemy)) {
          r.kills.add(b.enemy);
          this.soul(r, 'enemy', r.wave + ':' + b.enemy, e.name, 'purgatory', e.type);
        }
      },
      r.enemyHits,
    );
  }
  friendly(r, p, b) {
    requireGame(typeof b.shot === 'string' && b.shot.length <= 120, 'Impact invalide.');
    const amount =
      (p.mode === 'foot'
        ? 10
        : p.mode === 'turret'
          ? Math.max(0, Math.min(200, Math.round(Number(b.amount) || 80)))
          : 75) * (p.mode === 'foot' ? 1 : clauseFactors(this.clause(r, p)).damage);
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
    this.once(r, JSON.stringify(['soul', s.id, p.id, b.shot]), () => {
      if (s.status === 'waiting') {
        s.damage += 10;
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
      p.incarnation++;
      p.mode = 'foot';
      p.board_paper = 0;
      p.life = realm === 'super' ? 'dead' : 'alive';
      p.state = initialState();
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
