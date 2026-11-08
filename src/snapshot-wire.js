// Compact immutable insect rosters by consecutive swarms. All individual
// IDs and trajectory parameters remain exact; only repeated object fields
// are stored once per run. This is a wire format, not gameplay authority.
export function snapshotRosterCore(s) {
  return [s.code, s.base?.epoch, s.wave, s.started, s.balanceRevision].join(':');
}

export function snapshotRosterKey(s) {
  return [snapshotRosterCore(s), s.rosterRevision].join(':');
}

const same = (a, b) =>
  Object.is(a, b) ||
  (a !== null &&
    b !== null &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    JSON.stringify(a) === JSON.stringify(b));

export function packRoster(roster) {
  const groups = [];
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
      const fixed = {},
        columns = {};
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

export function unpackRoster(groups) {
  const roster = [];
  for (const group of groups) {
    if (group.length === 1) {
      roster.push(group[0]);
      continue;
    }
    const [count, fixed, columns] = group;
    if (!Number.isSafeInteger(count) || count < 1 || count > 20000)
      throw Error('Groupe de nuée invalide.');
    for (let i = 0; i < count; i++) {
      const enemy = { ...fixed };
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
const plain = (v) => v !== null && typeof v === 'object';
const absent = (v) => v === undefined || typeof v === 'function';
export function diffValue(prev, next) {
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
    const a = {};
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
  const o = {},
    d = [];
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
export function applyPatch(prev, node, depth = 0) {
  if (depth > MAX_PATCH_DEPTH || !plain(node)) throw Error('Patch de snapshot invalide.');
  if (Object.hasOwn(node, '$')) return structuredClone(node.$);
  if (node.a) {
    if (!Array.isArray(prev) || !Number.isSafeInteger(node.n) || node.n < 0 || node.n > 1e6)
      throw Error('Patch de liste invalide.');
    const out = prev.slice(0, node.n);
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
  const out = { ...prev };
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
function patchable(snapshot) {
  const fields = {};
  for (const [key, value] of Object.entries(snapshot))
    if (!UNPATCHED.has(key) && !absent(value)) fields[key] = value;
  return fields;
}

// Keep only changes after an acknowledged state on this ordered reliable
// connection. Changes to wave/balance/roster reset the baseline.
export function encodeSnapshotForWire(snapshot, previous = null) {
  const key = snapshotRosterKey(snapshot);
  const next = {
    key,
    kills: new Set(snapshot.kills),
    damage: { ...snapshot.enemyDamage },
  };
  if (previous?.key === key) {
    snapshot.killsAdded = snapshot.kills.filter((id) => !previous.kills.has(id));
    snapshot.enemyDamageChanged = Object.fromEntries(
      Object.entries(snapshot.enemyDamage).filter(([id, amount]) => previous.damage[id] !== amount),
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
  const fields = patchable(snapshot);
  next.fields = fields;
  if (previous?.fields) {
    for (const key of Object.keys(fields)) delete snapshot[key];
    snapshot.$patch = diffValue(previous.fields, fields) || { o: {} };
  }
  return next;
}

export function decodeSnapshotFromWire(snapshot, previous = null) {
  if (Object.hasOwn(snapshot, '$patch')) {
    if (!previous?.fields) throw Error('Patch de snapshot sans état initial.');
    const fields = applyPatch(previous.fields, snapshot.$patch);
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
    snapshot.kills = [...previous.kills, ...snapshot.killsAdded];
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
