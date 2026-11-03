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
  for (let start = 0; start < roster.length; ) {
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
  return next;
}

export function decodeSnapshotFromWire(snapshot, previous = null) {
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
    core: snapshotRosterCore(snapshot),
    roster: snapshot.roster || previous?.roster,
    kills: new Set(snapshot.kills),
    damage: { ...snapshot.enemyDamage },
  };
}
