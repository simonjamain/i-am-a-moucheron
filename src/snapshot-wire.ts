// Compact immutable insect rosters by consecutive swarms. All individual
// IDs and trajectory parameters remain exact; only repeated object fields
// are stored once per run. This is a wire format, not gameplay authority.
type Json = unknown;
type JsonObject = Record<string, Json>;
/** One enemy of the roster as produced by the server (fields vary per species). */
export type RosterEnemy = JsonObject & { type?: string };
/** [enemy] for a run of one, or [count, fixed fields, varying columns]. */
export type RosterGroup = [RosterEnemy] | [number, JsonObject, Record<string, Json[]>];
/** Structural patch node (see the format comment above diffValue). */
export type PatchNode =
  | { $: Json }
  | { o: Record<string, PatchNode>; d?: string[] }
  | { a: Record<number, PatchNode>; n: number };
type EnemyId = string | number;
/**
 * Room snapshot as it crosses the reliable channel. Only the fields this codec
 * reads are named; everything else is patched structurally.
 */
export interface WireSnapshot {
  code?: string;
  base?: { epoch?: number; bodies?: WireBody[] } & JsonObject;
  wave?: number;
  started?: number | boolean;
  balanceRevision?: number;
  rosterRevision?: number;
  roster?: RosterEnemy[];
  rosterAdd?: RosterEnemy[];
  rosterGroups?: RosterGroup[];
  rosterAddGroups?: RosterGroup[];
  kills?: EnemyId[];
  killsAdded?: EnemyId[];
  enemyDamage?: Record<string, number>;
  enemyDamageChanged?: Record<string, number>;
  pilots?: WirePilot[];
  vehicles?: WireVehicle[];
  $patch?: PatchNode;
  [field: string]: unknown;
}
interface WirePilot {
  id?: string;
  incarnation?: unknown;
  occupation?: unknown;
  mode?: unknown;
  vehicle_id?: unknown;
  seen?: unknown;
  state?: JsonObject;
}
interface WireVehicle {
  id?: string;
  seats?: { pilot?: string }[];
  state?: JsonObject;
}
interface WireBody extends JsonObject {
  id?: string;
  kind?: string;
  entity?: string;
}
/** Per-connection baseline returned by encode/decode and passed back next time. */
export interface WireState {
  key: string;
  kills: Set<EnemyId>;
  damage: Record<string, number>;
  fields?: JsonObject;
  core?: string;
  roster?: RosterEnemy[];
}

export function snapshotRosterCore(s: WireSnapshot): string {
  return [s.code, s.base?.epoch, s.wave, s.started, s.balanceRevision].join(':');
}

export function snapshotRosterKey(s: WireSnapshot): string {
  return [snapshotRosterCore(s), s.rosterRevision].join(':');
}

const same = (a: Json, b: Json): boolean =>
  Object.is(a, b) ||
  (a !== null &&
    b !== null &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    JSON.stringify(a) === JSON.stringify(b));

export function packRoster(roster: readonly RosterEnemy[]): RosterGroup[] {
  const groups: RosterGroup[] = [];
  for (let start = 0; start < roster.length;) {
    const keys = Object.keys(roster[start]);
    const signature = keys.join('\0');
    let end = start + 1;
    while (
      end < roster.length &&
      roster[end].type === roster[start].type &&
      Object.keys(roster[end]).join('\0') === signature
    )
      end++;
    if (end - start === 1) {
      groups.push([roster[start]]);
    } else {
      const fixed: JsonObject = {},
        columns: Record<string, Json[]> = {};
      for (const key of keys) {
        const first = roster[start][key];
        let varies = false;
        for (let i = start + 1; i < end; i++)
          if (!same(roster[i][key], first)) {
            varies = true;
            break;
          }
        if (varies) columns[key] = roster.slice(start, end).map((enemy) => enemy[key]);
        else fixed[key] = first;
      }
      groups.push([end - start, fixed, columns]);
    }
    start = end;
  }
  return groups;
}

export function unpackRoster(groups: readonly RosterGroup[]): RosterEnemy[] {
  const roster: RosterEnemy[] = [];
  for (const group of groups) {
    if (group.length === 1) {
      roster.push(group[0]);
      continue;
    }
    const [count, fixed, columns] = group;
    if (!Number.isSafeInteger(count) || count < 1 || count > 20000)
      throw Error('Groupe de nuée invalide.');
    for (let i = 0; i < count; i++) {
      const enemy: RosterEnemy = { ...fixed };
      for (const [key, values] of Object.entries(columns)) {
        if (!Array.isArray(values) || values.length !== count)
          throw Error('Colonne de nuée invalide.');
        enemy[key] = values[i];
      }
      roster.push(enemy);
    }
    if (roster.length > 20000) throw Error('Roster trop volumineux.');
  }
  return roster;
}

// Structural patches between two JSON values. A snapshot repeats almost all of
// its content from one reply to the next (pilots, arenas, bank, equipment...):
// only changed values cross the wire. Node shapes:
//   { $: value }                       replace (or set) a value
//   { o: { key: node }, d: [keys] }    patch an object; d lists removed keys
//   { a: { index: node }, n: length }  patch an array; n is the new length
// JSON semantics apply: undefined is absent, the receiver works on parsed JSON.
// Not a type guard: diffValue/applyPatch walk `any` JSON and must keep indexing it.
const plain = (v: unknown): boolean => v !== null && typeof v === 'object';
const absent = (v: unknown): boolean => v === undefined || typeof v === 'function';
// Callers pass parsed JSON; `any` lets the walk index arrays and objects alike.
export function diffValue(prev: any, next: any): PatchNode | undefined {
  if (absent(next)) return absent(prev) ? undefined : { $: null };
  if (Object.is(prev, next)) return undefined;
  if (!plain(next) || !plain(prev) || Array.isArray(next) !== Array.isArray(prev))
    return { $: next };
  if (Array.isArray(next)) {
    // Vectors and other lists of plain values are cheaper to resend whole.
    if (!next.some(plain)) {
      if (next.length !== prev.length) return { $: next };
      for (let i = 0; i < next.length; i++)
        if (!Object.is(absent(prev[i]) ? null : prev[i], absent(next[i]) ? null : next[i]))
          return { $: next };
      return undefined;
    }
    const a: Record<number, PatchNode> = {};
    let changed = next.length !== prev.length;
    for (let i = 0; i < next.length; i++) {
      // Array holes and undefined entries are null in JSON.
      const d = diffValue(
        i < prev.length ? (absent(prev[i]) ? null : prev[i]) : undefined,
        absent(next[i]) ? null : next[i],
      );
      if (d) {
        a[i] = d;
        changed = true;
      }
    }
    return changed ? { a, n: next.length } : undefined;
  }
  const o: Record<string, PatchNode> = {},
    d: string[] = [];
  let changed = false;
  for (const key of Object.keys(next)) {
    const node = absent(next[key])
      ? absent(prev[key])
        ? undefined
        : (d.push(key), undefined)
      : diffValue(prev[key], next[key]);
    if (node) {
      o[key] = node;
      changed = true;
    }
  }
  for (const key of Object.keys(prev))
    if (!absent(prev[key]) && !Object.hasOwn(next, key)) d.push(key);
  if (d.length) changed = true;
  if (!changed) return undefined;
  return d.length ? { o, d } : { o };
}
const MAX_PATCH_DEPTH = 64;
export function applyPatch(prev: any, node: any, depth = 0): any {
  if (depth > MAX_PATCH_DEPTH || !plain(node)) throw Error('Patch de snapshot invalide.');
  if (Object.hasOwn(node, '$')) return structuredClone(node.$);
  if (node.a) {
    if (!Array.isArray(prev) || !Number.isSafeInteger(node.n) || node.n < 0 || node.n > 1e6)
      throw Error('Patch de liste invalide.');
    const out: Json[] = prev.slice(0, node.n);
    while (out.length < node.n) out.push(null);
    for (const [index, child] of Object.entries(node.a)) {
      const i = Number(index);
      if (!Number.isSafeInteger(i) || i < 0 || i >= node.n) throw Error('Patch de liste invalide.');
      out[i] = applyPatch(i < prev.length ? prev[i] : undefined, child, depth + 1);
    }
    return out;
  }
  if (!plain(node.o) || !plain(prev) || Array.isArray(prev)) throw Error('Patch d’objet invalide.');
  if (Object.hasOwn(node.o, '__proto__')) throw Error('Patch d’objet invalide.');
  const out: JsonObject = { ...prev };
  for (const key of node.d || []) delete out[key];
  for (const [key, child] of Object.entries(node.o))
    out[key] = applyPatch(Object.hasOwn(prev, key) ? prev[key] : undefined, child, depth + 1);
  return out;
}
// Roster, kills and damage keep their dedicated encoding above.
const UNPATCHED = new Set([
  'roster',
  'rosterAdd',
  'rosterGroups',
  'rosterAddGroups',
  'kills',
  'enemyDamage',
  'killsAdded',
  'enemyDamageChanged',
]);
function patchable(snapshot: WireSnapshot): JsonObject {
  const fields: JsonObject = {};
  for (const [key, value] of Object.entries(snapshot))
    if (!UNPATCHED.has(key) && !absent(value)) fields[key] = value;
  return fields;
}

// Positions of other players already travel at 20 Hz on the lossy motion
// channel; in reliable replies they only serve as a fallback when that channel
// goes quiet (see client accept()). Between refreshes, these values are copied
// from the previous reply so that the patch omits them. Gameplay fields (hp,
// fire, seats, mode, life...) are never held.
export const MOTION_REFRESH_MS = 1000;
const PILOT_MOTION = [
  'p',
  'q',
  'v',
  'omega',
  'aimPoint',
  'turretDirection',
  'rotorPower',
  'collective',
  'trailerAngle',
  'trailerPitch',
  'steer',
  'ground',
];
const BODY_MOTION = ['x', 'z', 'y', 'vx', 'vz', 'vy', 'face', 'input', 'inputAt'];
function holdKeys<O extends JsonObject>(next: O, prev: JsonObject, keys: readonly string[]): O {
  let out: JsonObject | null = null;
  for (const key of keys)
    if (Object.hasOwn(prev, key) && !Object.is(prev[key], next[key])) {
      out ||= { ...next };
      out[key] = prev[key];
    }
  return (out || next) as O;
}
// Returns fields with other players' motion held at the previous values. Never
// mutates `fields`, which may be shared between connections.
export function holdRemoteMotion(
  fields: WireSnapshot,
  previous: WireSnapshot | null | undefined,
  self: string,
): WireSnapshot {
  if (!previous) return fields;
  const out: WireSnapshot = { ...fields };
  if (Array.isArray(fields.pilots) && Array.isArray(previous.pilots)) {
    const before = new Map(previous.pilots.map((p) => [p?.id, p]));
    out.pilots = fields.pilots.map((p): WirePilot => {
      const old = before.get(p?.id);
      // A new life, seat or mode is a discontinuity: send it at once.
      if (
        !old ||
        p.id === self ||
        old.incarnation !== p.incarnation ||
        old.occupation !== p.occupation ||
        old.mode !== p.mode ||
        old.vehicle_id !== p.vehicle_id ||
        !old.state ||
        !p.state
      )
        return p;
      const state = holdKeys(p.state, old.state, PILOT_MOTION);
      return state === p.state && old.seen === p.seen ? p : { ...p, state, seen: old.seen };
    });
  }
  if (Array.isArray(fields.vehicles) && Array.isArray(previous.vehicles)) {
    const before = new Map(previous.vehicles.map((v) => [v?.id, v]));
    out.vehicles = fields.vehicles.map((v): WireVehicle => {
      const old = before.get(v?.id);
      const crew = Array.isArray(v?.seats) ? v.seats.map((seat) => seat.pilot) : [];
      if (!old?.state || !v.state || !crew.length || crew.includes(self)) return v;
      const state = holdKeys(v.state, old.state, PILOT_MOTION);
      return state === v.state ? v : { ...v, state };
    });
  }
  if (Array.isArray(fields.base?.bodies) && Array.isArray(previous.base?.bodies)) {
    const before = new Map(previous.base!.bodies!.map((b) => [b?.id, b]));
    out.base = {
      ...fields.base,
      bodies: fields.base!.bodies!.map((b) => {
        const old = before.get(b?.id);
        if (!old || b.kind !== 'player' || b.entity === self || old.entity !== b.entity) return b;
        return holdKeys(b, old, BODY_MOTION);
      }),
    };
  }
  return out;
}

// Keep only changes after an acknowledged state on this ordered reliable
// connection. Changes to wave/balance/roster reset the baseline.
export function encodeSnapshotForWire(
  snapshot: WireSnapshot,
  previous: WireState | null = null,
  { holdMotionOf }: { holdMotionOf?: string } = {},
): WireState {
  const key = snapshotRosterKey(snapshot);
  const next: WireState = {
    key,
    kills: new Set(snapshot.kills),
    damage: { ...snapshot.enemyDamage },
  };
  if (previous?.key === key) {
    snapshot.killsAdded = snapshot.kills!.filter((id) => !previous.kills.has(id));
    snapshot.enemyDamageChanged = Object.fromEntries(
      Object.entries(snapshot.enemyDamage!).filter(
        ([id, amount]) => previous.damage[id] !== amount,
      ),
    );
    delete snapshot.kills;
    delete snapshot.enemyDamage;
  }
  if (snapshot.roster) {
    snapshot.rosterGroups = packRoster(snapshot.roster);
    delete snapshot.roster;
  }
  if (snapshot.rosterAdd) {
    snapshot.rosterAddGroups = packRoster(snapshot.rosterAdd);
    delete snapshot.rosterAdd;
  }
  // Every other field travels as a patch against the previous reply's fields.
  // The snapshot is already a private copy (Game.snapshot clones the room) and
  // is never mutated after encoding, so its values serve as the baseline.
  // diffValue applies JSON semantics (undefined absent, NaN as sent).
  let fields = patchable(snapshot);
  // holdMotionOf: this connection's player ID, when its motion refresh is not due.
  if (holdMotionOf !== undefined && previous?.fields) {
    fields = holdRemoteMotion(fields, previous.fields, holdMotionOf);
    Object.assign(snapshot, fields);
  }
  next.fields = fields;
  if (previous?.fields) {
    for (const key of Object.keys(fields)) delete snapshot[key];
    snapshot.$patch = diffValue(previous.fields, fields) || { o: {} };
  }
  return next;
}

export function decodeSnapshotFromWire(
  snapshot: WireSnapshot,
  previous: WireState | null = null,
): WireState {
  if (Object.hasOwn(snapshot, '$patch')) {
    if (!previous?.fields) throw Error('Patch de snapshot sans état initial.');
    const fields: JsonObject = applyPatch(previous.fields, snapshot.$patch);
    delete snapshot.$patch;
    for (const [field, value] of Object.entries(fields))
      if (!UNPATCHED.has(field)) snapshot[field] = value;
  }
  // Keep a private copy: the game mutates the snapshot it receives.
  const fields = structuredClone(patchable(snapshot));
  const key = snapshotRosterKey(snapshot);
  if (snapshot.rosterGroups) {
    snapshot.roster = unpackRoster(snapshot.rosterGroups);
    delete snapshot.rosterGroups;
  }
  if (snapshot.rosterAddGroups) {
    if (previous?.core !== snapshotRosterCore(snapshot) || !previous.roster)
      throw Error('Ajout de nuée sans roster initial.');
    snapshot.roster = [...previous.roster, ...unpackRoster(snapshot.rosterAddGroups)];
    delete snapshot.rosterAddGroups;
  }
  if (!snapshot.roster && previous?.key !== key)
    throw Error('Roster manquant pour une nouvelle révision.');
  if (Object.hasOwn(snapshot, 'killsAdded')) {
    if (previous?.key !== key || !Object.hasOwn(snapshot, 'enemyDamageChanged'))
      throw Error('Synchronisation différentielle sans état initial.');
    snapshot.kills = [...previous.kills, ...snapshot.killsAdded!];
    snapshot.enemyDamage = { ...previous.damage, ...snapshot.enemyDamageChanged };
    delete snapshot.killsAdded;
    delete snapshot.enemyDamageChanged;
  }
  return {
    key,
    fields,
    core: snapshotRosterCore(snapshot),
    roster: snapshot.roster || previous?.roster,
    kills: new Set(snapshot.kills),
    damage: { ...snapshot.enemyDamage },
  };
}
