const { AA_STATIONS, stationAccess } = SORTIE_ENGINE;
const { aircraftBay, baseWorld, baseBody, baseAccess, reconcileBase, aircraftPose } = BASE_ENGINE;
const { createSoul, deskOccupant, relayBodyReport } = ARENA_ENGINE;
const json = (v, status = 200) =>
  new Response(
    JSON.stringify(
      v?.snapshot?.now
        ? { ...v, snapshot: { ...v.snapshot, sentAt: Date.now() } }
        : v?.now
          ? { ...v, sentAt: Date.now() }
          : v,
    ),
    {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    },
  );
function spawn(i) {
  return {
    p: [
      OFFICE_LAYOUT.base.originX + (i % 6) * 2,
      OFFICE_LAYOUT.base.departureY,
      OFFICE_LAYOUT.base.originZ - 8,
    ],
    q: [0, 0, 0, 1],
    v: [0, 0, -12],
    hp: 100,
    wing: 1,
    engine: 1,
    fire: false,
  };
}
function validSignature(points) {
  if (points === true) return true;
  if (!Array.isArray(points) || points.length < 8 || points.length > 180) return false;
  let length = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (
      !Array.isArray(p) ||
      p.length !== 3 ||
      !p.every(Number.isFinite) ||
      p[0] < 0 ||
      p[0] > 1 ||
      p[1] < 0 ||
      p[1] > 1 ||
      ![0, 1].includes(p[2])
    )
      return false;
    if (i && p[2]) length += Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]);
  }
  return length > 0.12;
}
function initialStation() {
  const base = OFFICE_LAYOUT.base;
  return {
    x: base.originX,
    y: base.deckY + 0.00005,
    z: base.originZ - 5 * ACTOR_UNIT,
    slot: -1,
    kind: 'refuel',
    name: 'Ravitaillement Alpha',
    free: true,
  };
}
async function roomInstallations(db, code) {
  return [...(await roomStations(db, code)), initialStation()];
}
async function roomStations(db, code) {
  return (
    await db.prepare('SELECT slot,state FROM equipment WHERE room=? ORDER BY slot').bind(code).all()
  ).results.map((row) => ({ kind: 'dca', ...JSON.parse(row.state), slot: row.slot }));
}
async function buyEquipment(db, pilot, b, now) {
  const code = pilot.room,
    item = SHOP[b.item],
    request = String(b.request || '');
  if (!item || !/^[a-zA-Z0-9:_-]{8,120}$/.test(request) || pilot.life !== 'alive')
    return 'Achat invalide.';
  const prior = await db
    .prepare('SELECT item,done FROM purchase_orders WHERE room=? AND request=?')
    .bind(code, request)
    .first();
  if (prior?.done) return prior.item === b.item ? null : 'Référence d’achat déjà utilisée.';
  const room = await db
      .prepare('SELECT dollars,upgrades FROM rooms WHERE code=?')
      .bind(code)
      .first(),
    upgrades = JSON.parse(room.upgrades);
  const installations = await roomStations(db, code);
  const installed = installations.length;
  const typeCount = installationCount(installations, b.item);
  const price = shopPrice(b.item, upgrades, typeCount);
  if (b.expectedPrice !== undefined && b.expectedPrice !== price)
    return 'Le tarif a changé. Consultez le nouveau prix avant de confirmer.';
  if (room.dollars < price) return 'La caisse commune ne contient pas assez de dollars.';
  if (item.max && (upgrades[b.item] || 0) >= item.max) return 'Amélioration déjà au maximum.';
  let placement = null;
  if (item.kind === 'placement') {
    if (
      pilot.mode !== 'foot' ||
      !b.position ||
      !['x', 'y', 'z'].every((k) => Number.isFinite(b.position[k]))
    )
      return 'Posez cet équipement à pied.';
    const base = await baseSnapshot(db, code, now, {
        type: 'input',
        entity: pilot.id,
        report: b.ground,
      }),
      body = base.arena?.bodies.find((x) => x.entity === pilot.id),
      w = body && baseWorld(body);
    if (
      !body ||
      body.parachute ||
      body.grounded === false ||
      Math.hypot(w.x - b.position.x, w.z - b.position.z) > MAP.metres(9)
    )
      return 'Placez l’équipement près de vous, depuis le sol.';
    const occupied = await roomInstallations(db, code);
    if (installed >= 24) return 'Limite de 24 équipements atteinte.';
    placement = supportedPlacement({ ...b.position, y: w.y }, OFFICE_SOLIDS, occupied, b.item);
    if (!placement || Math.abs(placement.y - b.position.y) > 0.0003)
      return 'La base entière doit reposer sur une surface libre.';
    // Parked aircraft also reserve their footprint.
    const fleet = await ensureFleet(db, code, now);
    if (
      fleet.some(
        (v) =>
          v.state.landed &&
          Math.abs(v.state.p[1] - placement.y) < MAP.metres(4) &&
          Math.hypot(v.state.p[0] - placement.x, v.state.p[2] - placement.z) <
            (VEHICLES[v.type].span * ACTOR_UNIT) / 2 +
              (b.item === 'refuel' ? 0.065 : MAP.metres(2.1)),
      )
    )
      return 'Éloignez la DCA des appareils garés.';
  }
  const pending = 'EXISTS(SELECT 1 FROM purchase_orders WHERE room=? AND request=? AND done=0)';
  const commands = [
    db
      .prepare(
        "INSERT INTO purchase_orders(room,request,item,cost) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM rooms WHERE code=? AND dollars>=? AND COALESCE(json_extract(upgrades,?),0)<? AND COALESCE(json_extract(upgrades,?),0)=?) AND (?=0 OR (SELECT COUNT(*) FROM equipment WHERE room=?)=?) AND (?=0 OR NOT EXISTS(SELECT 1 FROM equipment WHERE room=? AND ABS(json_extract(state,'$.y')-?)<? AND (json_extract(state,'$.x')-?)*(json_extract(state,'$.x')-?)+(json_extract(state,'$.z')-?)*(json_extract(state,'$.z')-?)<?)) ON CONFLICT DO NOTHING",
      )
      .bind(
        code,
        request,
        b.item,
        price,
        code,
        price,
        '$.' + b.item,
        item.max || 999,
        '$.' + b.item,
        upgrades[b.item] || 0,
        placement ? 1 : 0,
        code,
        installed,
        placement ? 1 : 0,
        code,
        placement?.y || 0,
        MAP.metres(3),
        placement?.x || 0,
        placement?.x || 0,
        placement?.z || 0,
        placement?.z || 0,
        (b.item === 'refuel' ? 0.08 : MAP.metres(5)) ** 2,
      ),
    db
      .prepare('UPDATE rooms SET dollars=dollars-? WHERE code=? AND ' + pending)
      .bind(price, code, code, request),
  ];
  if (placement)
    commands.push(
      db
        .prepare(
          'INSERT INTO equipment(room,slot,state,request) SELECT ?,COALESCE((SELECT MAX(slot)+1 FROM equipment WHERE room=?),0),?,? WHERE ' +
            pending +
            ' ON CONFLICT DO NOTHING',
        )
        .bind(
          code,
          code,
          JSON.stringify({ ...placement, name: item.name, kind: b.item }),
          request,
          code,
          request,
        ),
    );
  else
    commands.push(
      db
        .prepare(
          'UPDATE rooms SET upgrades=json_set(upgrades,?,COALESCE(json_extract(upgrades,?),0)+1) WHERE code=? AND ' +
            pending,
        )
        .bind('$.' + b.item, '$.' + b.item, code, code, request),
    );
  commands.push(
    db
      .prepare('UPDATE purchase_orders SET done=1 WHERE room=? AND request=? AND done=0')
      .bind(code, request),
  );
  await db.batch(commands);
  const order = await db
    .prepare('SELECT done FROM purchase_orders WHERE room=? AND request=?')
    .bind(code, request)
    .first();
  return order?.done ? null : 'Achat refusé : fonds, emplacement ou disponibilité modifiés.';
}
async function ensureFleet(db, code, now) {
  await db
    .prepare("UPDATE vehicles SET ready=0 WHERE room=? AND json_extract(state,'$.hp')<=0")
    .bind(code)
    .run();
  await db
    .prepare(
      "DELETE FROM vehicle_seats WHERE room=? AND pilot IN(SELECT id FROM pilots WHERE life='dead' OR mode NOT IN('flight','crew') OR seen<?)",
    )
    .bind(code, now - 12000)
    .run();
  const room = await db.prepare('SELECT upgrades FROM rooms WHERE code=?').bind(code).first();
  const unlocked = JSON.parse(room.upgrades || '{}');
  for (const type of Object.keys(VEHICLES).filter(
    (type) =>
      type !== 'spitfire' && type !== 'tank' && (type !== 'interceptor' || unlocked.interceptor),
  ))
    await db
      .prepare(
        'INSERT INTO vehicles(id,room,type,state,ready,created) VALUES(?,?,?,?,1,?) ON CONFLICT DO NOTHING',
      )
      .bind(crypto.randomUUID(), code, type, JSON.stringify(vehiclePad(type)), now)
      .run();
  const vehicles = (
    await db.prepare('SELECT * FROM vehicles WHERE room=? ORDER BY created,id').bind(code).all()
  ).results.map((v) => ({ ...v, state: JSON.parse(v.state) }));
  const seats = (
    await db.prepare('SELECT vehicle,seat,pilot FROM vehicle_seats WHERE room=?').bind(code).all()
  ).results;
  for (const vehicle of vehicles) {
    const pad = vehiclePad(vehicle.type);
    if (
      vehicle.ready &&
      !seats.some((s) => s.vehicle === vehicle.id) &&
      Math.hypot(...vehicle.state.p.map((v, i) => v - pad.p[i])) > MAP.metres(0.5)
    ) {
      vehicle.state = { ...vehicle.state, p: pad.p, q: pad.q, v: pad.v, landed: true };
      await db
        .prepare(
          'UPDATE vehicles SET state=? WHERE id=? AND ready=1 AND NOT EXISTS(SELECT 1 FROM vehicle_seats WHERE vehicle=?)',
        )
        .bind(JSON.stringify(vehicle.state), vehicle.id, vehicle.id)
        .run();
    }
  }
  const installations = await roomInstallations(db, code);
  for (const vehicle of vehicles) {
    await db
      .prepare(
        'INSERT INTO vehicle_supplies(vehicle,room,ammo,updated) VALUES(?,?,?,?) ON CONFLICT DO NOTHING',
      )
      .bind(vehicle.id, code, JSON.stringify(fullAmmo(vehicle.type)), now)
      .run();
    for (let attempt = 0; attempt < 5; attempt++) {
      const row = await db
        .prepare('SELECT * FROM vehicle_supplies WHERE vehicle=?')
        .bind(vehicle.id)
        .first();
      // Concurrent requests capture their time before reading D1. An older
      // request can arrive here last; never charge the same interval twice.
      const updated = Math.max(now, row.updated);
      const next = advanceSupplies(
        { fuel: row.fuel, ammo: JSON.parse(row.ammo) },
        vehicle.state,
        vehicle.type,
        installations,
        (updated - row.updated) / 1000,
      );
      const result = await db
        .prepare(
          'UPDATE vehicle_supplies SET fuel=?,ammo=?,updated=?,revision=revision+1 WHERE vehicle=? AND updated=? AND ammo=? AND fuel=? AND revision=?',
        )
        .bind(
          next.fuel,
          JSON.stringify(next.ammo),
          updated,
          vehicle.id,
          row.updated,
          row.ammo,
          row.fuel,
          row.revision,
        )
        .run();
      if (result.meta.changes) {
        vehicle.supplies = { ...next, sequence: row.sequence, revision: row.revision + 1 };
        break;
      }
    }
    if (!vehicle.supplies) {
      const row = await db
        .prepare('SELECT * FROM vehicle_supplies WHERE vehicle=?')
        .bind(vehicle.id)
        .first();
      vehicle.supplies = {
        fuel: row.fuel,
        ammo: JSON.parse(row.ammo),
        sequence: row.sequence,
        revision: row.revision,
        servicing: serviceEligible(vehicle.state, installations, vehicle.type),
      };
    }
  }
  return vehicles.map((v) => ({ ...v, seats: seats.filter((s) => s.vehicle === v.id) }));
}
async function createDossier(db, pilot, target, seat, token, armed = true) {
  const clause = drawClause(
    seat,
    armed,
    () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296,
  );
  await db
    .prepare(
      'INSERT INTO access_dossiers(token,room,pilot,target,seat,clause,position) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING',
    )
    .bind(token, pilot.room, pilot.id, target, seat, clause, Math.floor(Math.random() * 2))
    .run();
}
async function dossierDue(db, token, paper) {
  if (!token) return null;
  return db
    .prepare(
      'SELECT * FROM access_dossiers WHERE token=? AND clause IS NOT NULL AND choice IS NULL AND position<=?',
    )
    .bind(token, paper)
    .first();
}
async function activateDossier(db, pilot, token, target, seat) {
  await db.batch([
    db.prepare('UPDATE access_dossiers SET active=0 WHERE pilot=?').bind(pilot.id),
    db
      .prepare(
        "UPDATE access_dossiers SET active=1 WHERE token=? AND pilot=? AND target=? AND seat=? AND choice='sign'",
      )
      .bind(token || '', pilot.id, target, seat),
  ]);
}
async function dossierChoice(db, pilot, b) {
  const state = JSON.parse(pilot.state),
    current = state.equipmentBoarding || state.boarding;
  const transfer = await db
    .prepare(
      "SELECT * FROM seat_requests WHERE (id||':'||?)=? AND room=? AND status IN ('signing','offered') AND ((requester=? AND status='signing') OR (recipient=? AND status='offered'))",
    )
    .bind(pilot.id, b.token || '', pilot.room, pilot.id, pilot.id)
    .first();
  if (
    pilot.life !== 'alive' ||
    !['sign', 'tear'].includes(b.choice) ||
    (!transfer && (pilot.mode !== 'foot' || !current || current.token !== b.token))
  )
    return 'Ce dossier n’est plus ouvert.';
  const row = await db
    .prepare('SELECT * FROM access_dossiers WHERE token=? AND pilot=?')
    .bind(b.token, pilot.id)
    .first();
  const paper = transfer ? 0 : state.equipmentBoarding ? current.paper : pilot.board_paper;
  if (!row?.clause || row.position > paper) return 'Traitez les documents dans l’ordre.';
  if (row.choice && row.choice !== b.choice) return 'Ce feuillet a déjà été traité.';
  if (b.choice === 'sign' && !validSignature(b.signature))
    return 'Signez ce feuillet ou déchirez-le.';
  await db
    .prepare('UPDATE access_dossiers SET choice=? WHERE token=? AND choice IS NULL')
    .bind(b.choice, b.token)
    .run();
  const actual = await db
    .prepare('SELECT choice FROM access_dossiers WHERE token=?')
    .bind(b.token)
    .first();
  return actual.choice === b.choice ? null : 'Ce feuillet a déjà été traité.';
}
async function boardVehicle(db, pilot, vehicle, seat, now) {
  if (!VEHICLES[vehicle.type].seats.includes(seat)) return 'Ce poste n’existe pas.';
  const state = JSON.parse(pilot.state);
  state.permits = [...new Set([...(state.permits || []), vehicle.id])];
  const dossierToken = state.boarding?.token;
  state.boarding = null;
  const next = {
    ...state,
    ...vehicle.state,
    vehicle: vehicle.id,
    seat,
    parked: null,
    fire: false,
    permits: state.permits,
  };
  await db.batch([
    db
      .prepare(
        "INSERT INTO vehicle_seats(room,vehicle,seat,pilot) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM pilots WHERE id=? AND mode='foot' AND life='alive') ON CONFLICT DO NOTHING",
      )
      .bind(pilot.room, vehicle.id, seat, pilot.id, pilot.id),
    db
      .prepare(
        "UPDATE pilots SET mode=?,vehicle_id=?,seat=?,board_paper=2,state=?,seen=? WHERE id=? AND mode='foot' AND EXISTS(SELECT 1 FROM vehicle_seats WHERE vehicle=? AND seat=? AND pilot=?)",
      )
      .bind(
        seat === 'pilot' ? 'flight' : 'crew',
        vehicle.id,
        seat,
        JSON.stringify(next),
        now,
        pilot.id,
        vehicle.id,
        seat,
        pilot.id,
      ),
  ]);
  const occupied = await db
    .prepare('SELECT pilot FROM vehicle_seats WHERE vehicle=? AND seat=?')
    .bind(vehicle.id, seat)
    .first();
  if (occupied?.pilot === pilot.id)
    await activateDossier(db, pilot, dossierToken, vehicle.id, seat);
  return occupied?.pilot === pilot.id
    ? null
    : 'Ce poste vient d’être pris. Choisissez un poste libre.';
}
async function fleetRoute(path, db, pilot, b, now) {
  const code = pilot.room;
  if (path === 'vehicle-exit') {
    if (!pilot.vehicle_id) return 'Vous n’êtes pas à bord.';
    const row = await db
      .prepare('SELECT * FROM vehicles WHERE id=? AND room=?')
      .bind(pilot.vehicle_id, code)
      .first();
    if (!row) return 'Appareil absent.';
    const vehicle = { ...row, state: JSON.parse(row.state) };
    if (
      pilot.seat === 'pilot' &&
      b.state &&
      ['p', 'q', 'v'].every(
        (k) =>
          Array.isArray(b.state[k]) &&
          b.state[k].length === (k === 'q' ? 4 : 3) &&
          b.state[k].every(Number.isFinite),
      )
    )
      vehicle.state = { ...vehicle.state, ...b.state };
    const e = vehicleEntry(vehicle),
      grounded = !!vehicle.state.landed;
    if (grounded && Math.hypot(...vehicle.state.v) > MAP.metres(3))
      return 'Arrêtez l’avion avant de sortir.';
    const ejectAll = pilot.seat === 'pilot' && !grounded;
    const occupants = ejectAll
      ? (await db.prepare('SELECT * FROM pilots WHERE vehicle_id=?').bind(vehicle.id).all()).results
      : [pilot];
    for (const p of occupants) {
      const old = JSON.parse(p.state);
      const position = grounded
        ? e
        : { x: vehicle.state.p[0], y: vehicle.state.p[1], z: vehicle.state.p[2] };
      old.walkSpawn = {
        x: (position.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
        z: (OFFICE_LAYOUT.base.originZ - position.z) / ACTOR_UNIT,
        y: position.y,
        parachute: false,
        airborne: !grounded,
        vx: vehicle.state.v[0],
        vy: vehicle.state.v[1],
        vz: vehicle.state.v[2],
      };
      old.vehicle = null;
      old.seat = null;
      old.fire = false;
      old.parked = null;
      await db.batch([
        db
          .prepare("UPDATE pilots SET mode='foot',vehicle_id=NULL,seat=NULL,state=? WHERE id=?")
          .bind(JSON.stringify(old), p.id),
        db.prepare('DELETE FROM vehicle_seats WHERE pilot=?').bind(p.id),
        db.prepare('UPDATE access_dossiers SET active=0 WHERE pilot=?').bind(p.id),
      ]);
    }
    if (ejectAll) await db.prepare('DELETE FROM vehicles WHERE id=?').bind(vehicle.id).run();
    else
      await db
        .prepare('UPDATE vehicles SET state=? WHERE id=?')
        .bind(JSON.stringify(vehicle.state), vehicle.id)
        .run();
    return null;
  }
  const fleet = await ensureFleet(db, code, now),
    vehicle = fleet.find((v) => v.id === b.vehicle);
  if (pilot.life !== 'alive' || pilot.mode !== 'foot' || !vehicle)
    return 'Approchez d’un appareil disponible.';
  const base = await baseSnapshot(db, code, now, {
    type: 'input',
    entity: pilot.id,
    report: b.ground,
  });
  const body = base.arena?.bodies.find((x) => x.entity === pilot.id);
  if (!body || !vehicleAccess(baseWorld(body), vehicle))
    return 'Rejoignez la porte de cet appareil.';
  const seat = b.seat || 'pilot';
  if (!VEHICLES[vehicle.type].seats.includes(seat)) return 'Poste invalide.';
  if (vehicle.seats.some((s) => s.seat === seat)) return 'Ce poste est occupé.';
  const state = JSON.parse(pilot.state);
  if (path === 'vehicle-select') {
    if (state.boarding?.vehicle === vehicle.id && state.boarding?.seat === seat) return null;
    state.equipmentBoarding = null;
    state.boarding = { vehicle: vehicle.id, seat, token: crypto.randomUUID() };
    await createDossier(
      db,
      pilot,
      vehicle.id,
      seat,
      state.boarding.token,
      !(vehicle.type === 'bomber' && seat === 'pilot'),
    );
    await db
      .prepare('UPDATE pilots SET board_paper=0,state=? WHERE id=?')
      .bind(JSON.stringify(state), pilot.id)
      .run();
    return null;
  }
  if (path === 'vehicle-sign') {
    if (!validSignature(b.signature)) return 'Tracez votre signature dans le cadre.';
    if (state.boarding?.vehicle !== vehicle.id || state.boarding?.seat !== seat)
      return 'Choisissez cet appareil avant de signer.';
    if (await dossierDue(db, state.boarding?.token, pilot.board_paper))
      return 'Traitez le feuillet courant avant de continuer.';
    if (b.form !== pilot.board_paper + 1 || b.form > 2) return 'Signez les documents dans l’ordre.';
    if (b.form === 2) return boardVehicle(db, pilot, vehicle, seat, now);
    await db.prepare('UPDATE pilots SET board_paper=1 WHERE id=?').bind(pilot.id).run();
    return null;
  }
  return 'Action inconnue.';
}

// A persisted compare-and-swap arena serializes concurrent movement, hits and desk access.
async function purgatory(db, code, now, action = null, realm = 'purgatory') {
  const superWorld = realm === 'super',
    stateColumn = superWorld ? 'super_state' : 'purgatory',
    revisionColumn = superWorld ? 'super_revision' : 'purg_revision',
    forms = superWorld ? 5 : 3;
  await db
    .prepare(
      "UPDATE pilots SET life='alive',health=100,incarnation=incarnation+1,mode='foot',vehicle_id=NULL,seat=NULL,board_paper=0,state=? WHERE room=? AND life='dead' AND seen<?",
    )
    .bind(JSON.stringify(spawn(0)), code, now - 12000)
    .run();
  await db
    .prepare(
      "UPDATE souls SET status='gone' WHERE room=? AND kind='player' AND status='waiting' AND entity IN (SELECT id FROM pilots WHERE seen<?)",
    )
    .bind(code, now - 12000)
    .run();
  for (let attempt = 0; attempt < 5; attempt++) {
    const room = await db
      .prepare(
        `SELECT ${stateColumn} AS purgatory,${revisionColumn} AS purg_revision FROM rooms WHERE code=?`,
      )
      .bind(code)
      .first();
    const rows = (
      await db
        .prepare(
          "SELECT * FROM souls WHERE room=? AND realm=? AND status='waiting' AND (kind='player' OR id IN (SELECT id FROM souls WHERE room=? AND status='waiting' AND kind='enemy' ORDER BY id LIMIT 24)) ORDER BY id",
        )
        .bind(code, realm, code)
        .all()
    ).results;
    const arena = JSON.parse(room.purgatory);
    arena.bodies ??= [];
    arena.epoch ??= crypto.randomUUID();
    arena.time ??= now;
    arena.events ??= [];
    arena.eventSeq ??= 0;
    const ids = new Set(rows.map((s) => s.id));
    arena.bodies = arena.bodies.filter((b) => ids.has(b.id));
    rows.forEach((s, i) => {
      let b = arena.bodies.find((b) => b.id === s.id);
      if (!b) {
        b = createSoul(s, i, now);
        arena.bodies.push(b);
      }
      b.paper = s.paper;
      b.maxHealth = s.kind === 'enemy' ? ENEMY_TYPES[s.enemy_type].hp : 100;
      b.enemyType = s.enemy_type;
      b.health = Math.max(0, b.maxHealth - (s.kind === 'enemy' ? s.damage : 0));
      b.koUntil = 0;
      b.attack = null;
    });
    arena.host =
      rows
        .filter((s) => s.kind === 'player')
        .map((s) => s.entity)
        .sort()[0] || null;
    if (!arena.host) ARENA_ENGINE.advanceArena(arena, now);
    else arena.time = now;
    let error = null,
      sign = null;
    const actor =
      action &&
      arena.bodies.find((b) => b.kind === 'player' && b.entity === action.entity && !b.gone);
    if (action && !actor) error = 'Votre corps n’est pas encore au purgatoire.';
    if (actor && action.type === 'input') {
      relayBodyReport(arena, actor, action.report, now);
      const input = action.input || {};
      actor.input = {
        x: Math.max(-1, Math.min(1, Number(input.x) || 0)),
        z: Math.max(-1, Math.min(1, Number(input.z) || 0)),
        guard: !!input.guard,
      };
      actor.inputAt = now;
    } else if (actor && action.type === 'sign') {
      relayBodyReport(arena, actor, action.report, now);
      const occupant = deskOccupant(arena, now);
      if (occupant?.id !== actor.id)
        error =
          'Placez votre corps dans la zone du guichet : quelqu’un d’autre est devant Saint Pierre.';
      else if (action.form !== actor.paper + 1 || action.form > forms)
        error = `Signez les ${forms} documents dans l’ordre.`;
      else {
        arena.events.push({
          id: ++arena.eventSeq,
          at: now,
          kind: 'stamp',
          origin: actor.entity,
          target: actor.id,
          x: 0,
          z: -1,
        });
        sign = { id: actor.id, entity: actor.entity, form: action.form };
        actor.paper = action.form;
        if (action.form === forms) actor.gone = true;
      }
    }
    arena.events = arena.events.slice(-128);
    arena.desk = deskOccupant(arena, now)?.id ?? null;
    arena.op = crypto.randomUUID();
    const revision = room.purg_revision + 1,
      guard = `EXISTS (SELECT 1 FROM rooms WHERE code=? AND json_extract(${stateColumn},'$.op')=?)`;
    const commands = [
      db
        .prepare(
          `UPDATE rooms SET ${stateColumn}=?,${revisionColumn}=? WHERE code=? AND ${revisionColumn}=?${sign ? ' AND EXISTS(SELECT 1 FROM souls WHERE id=' + Number(sign.id) + " AND status='waiting' AND paper=" + Number(sign.form - 1) + ')' : ''}`,
        )
        .bind(JSON.stringify(arena), revision, code, room.purg_revision),
    ];
    for (const body of arena.bodies)
      if (body.gone) {
        if (body.kind === 'enemy')
          commands.push(
            db
              .prepare(
                'UPDATE rooms SET dollars=dollars+1 WHERE code=? AND ' +
                  guard +
                  " AND EXISTS(SELECT 1 FROM souls WHERE id=? AND kind='enemy' AND status='waiting') AND NOT EXISTS(SELECT 1 FROM soul_rewards WHERE room=? AND soul=?)",
              )
              .bind(code, code, arena.op, body.id, code, body.id),
            db
              .prepare(
                'INSERT INTO soul_rewards(room,soul) SELECT ?,? WHERE ' +
                  guard +
                  " AND EXISTS(SELECT 1 FROM souls WHERE id=? AND kind='enemy' AND status='waiting') ON CONFLICT DO NOTHING",
              )
              .bind(code, body.id, code, arena.op, body.id),
          );
        commands.push(
          db
            .prepare("UPDATE souls SET status='gone' WHERE id=? AND " + guard)
            .bind(body.id, code, arena.op),
        );
      }
    if (sign) {
      commands.push(
        db
          .prepare('UPDATE souls SET paper=? WHERE id=? AND ' + guard)
          .bind(sign.form, sign.id, code, arena.op),
      );
      if (sign.form === forms)
        commands.push(
          db
            .prepare(
              `UPDATE pilots SET life='${superWorld ? 'dead' : 'alive'}',health=100,incarnation=incarnation+1,mode='foot',board_paper=0,state=? WHERE id=? AND ` +
                guard,
            )
            .bind(JSON.stringify(spawn(0)), sign.entity, code, arena.op),
          ...(superWorld
            ? [
                db
                  .prepare(
                    "INSERT INTO souls(room,kind,entity,name,place,realm) SELECT room,'player',id,name,0,'purgatory' FROM pilots WHERE id=? AND " +
                      guard,
                  )
                  .bind(sign.entity, code, arena.op),
              ]
            : []),
        );
    }
    const committed = await db.batch(commands);
    if (!committed[0].meta?.changes) continue;
    arena.revision = revision;
    return {
      arena,
      error,
      souls: rows
        .filter((s) => !arena.bodies.find((b) => b.id === s.id)?.gone)
        .map((s) => {
          const b = arena.bodies.find((b) => b.id === s.id);
          return {
            ...s,
            paper: b.paper,
            hp: b.health,
            stunned_until: b.koUntil,
            body: b,
          };
        }),
    };
  }
  return { error: 'Le combat se synchronise. Réessayez.', arena: null, souls: [] };
}
async function baseSnapshot(db, code, now, action = null) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const room = await db
      .prepare('SELECT base_state,base_revision FROM rooms WHERE code=?')
      .bind(code)
      .first();
    const pilots = (
      await db
        .prepare(
          'SELECT id,name,mode,life,bay,board_paper,state FROM pilots WHERE room=? AND seen>?',
        )
        .bind(code, now - 12000)
        .all()
    ).results;
    const arena = reconcileBase(JSON.parse(room.base_state), pilots, now);
    arena.epoch ??= crypto.randomUUID();
    arena.time = now;
    let error = null,
      boarding = null;
    const pilot = action && pilots.find((p) => p.id === action.entity),
      body = action && arena.bodies.find((b) => b.entity === action.entity);
    if (action && (!pilot || !body || pilot.mode !== 'foot'))
      error = 'Vous devez être à pied près de votre avion.';
    else if (action?.type === 'input') {
      relayBodyReport(arena, body, action.report, now);
      const i = action.input || {};
      body.input = {
        x: Math.max(-1, Math.min(1, Number(i.x) || 0)),
        z: Math.max(-1, Math.min(1, Number(i.z) || 0)),
        guard: false,
      };
      body.inputAt = now;
    } else if (action?.type === 'sign') {
      relayBodyReport(arena, body, action.report, now);
      if (!baseAccess(body, aircraftBay(pilot.bay)))
        error = 'Approchez-vous de l’accès de votre avion pour signer.';
      else if (action.form !== pilot.board_paper + 1 || action.form > 2)
        error = 'Signez les documents d’embarquement dans l’ordre.';
      else {
        const b = aircraftBay(pilot.bay);
        arena.events.push({
          id: ++arena.eventSeq,
          at: now,
          kind: 'stamp',
          origin: pilot.id,
          x: b.entryX,
          z: b.entryZ,
        });
        arena.events = arena.events.slice(-128);
        boarding = { id: pilot.id, form: action.form, bay: pilot.bay };
        body.paper = action.form;
        if (action.form === 2) body.gone = true;
      }
    }
    arena.op = crypto.randomUUID();
    const commands = [
      db
        .prepare(
          'UPDATE rooms SET base_state=?,base_revision=base_revision+1 WHERE code=? AND base_revision=?',
        )
        .bind(JSON.stringify(arena), code, room.base_revision),
    ];
    if (boarding) {
      const state = { ...spawn(0), ...aircraftPose(boarding.bay), landed: true };
      commands.push(
        db
          .prepare(
            "UPDATE pilots SET board_paper=?,mode=CASE WHEN ?=2 THEN 'flight' ELSE mode END,state=CASE WHEN ?=2 THEN ? ELSE state END WHERE id=? AND EXISTS (SELECT 1 FROM rooms WHERE code=? AND json_extract(base_state,'$.op')=?)",
          )
          .bind(
            boarding.form,
            boarding.form,
            boarding.form,
            JSON.stringify(state),
            boarding.id,
            code,
            arena.op,
          ),
      );
    }
    const result = await db.batch(commands);
    if (!result[0].meta?.changes) continue;
    arena.revision = room.base_revision + 1;
    return { arena, error };
  }
  return { error: 'La base se synchronise. Réessayez.', arena: null };
}
async function snapshot(db, code) {
  let r = await db.prepare('SELECT * FROM rooms WHERE code=?').bind(code).first();
  const time = Date.now();
  if (r.phase === 'prep' && r.mission_started && r.next_wave_at > 0 && r.next_wave_at <= time) {
    await db
      .prepare(
        "UPDATE rooms SET phase='combat',wave=wave+1,started=?,next_wave_at=0 WHERE code=? AND phase='prep' AND next_wave_at>0 AND next_wave_at<=?",
      )
      .bind(time, code, time)
      .run();
    r = await db.prepare('SELECT * FROM rooms WHERE code=?').bind(code).first();
  }
  const k = (
    await db.prepare('SELECT enemy FROM kills WHERE room=? AND wave=?').bind(code, r.wave).all()
  ).results.map((x) => x.enemy);
  const plan = wavePlan(code, r.wave, r.started),
    total = plan.roster.length,
    now = Date.now(),
    t = (now - r.started) / 1000;
  let leaked = 0,
    leakDamage = 0,
    resolved = k.length;
  if (r.phase === 'combat') {
    for (let i = 0; i < total; i++)
      if (!k.includes(i) && t >= plan.roster[i].spawn + plan.roster[i].duration) {
        leaked++;
        leakDamage += plan.roster[i].leak;
        resolved++;
      }
    if (resolved >= total) {
      await db.batch([
        db
          .prepare(
            "UPDATE rooms SET phase=CASE WHEN infestation+?>=20 THEN 'lost' ELSE 'prep' END, infestation=infestation+?,next_wave_at=? WHERE code=? AND phase='combat' AND wave=?",
          )
          .bind(leakDamage, leakDamage, now + 10000, code, r.wave),
        db
          .prepare(
            "INSERT INTO wave_rewards(room,wave,amount) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM rooms WHERE code=? AND wave=? AND phase='prep') ON CONFLICT DO NOTHING",
          )
          .bind(code, r.wave, waveStipend(r.wave), code, r.wave),
        db
          .prepare(
            'UPDATE rooms SET dollars=dollars+? WHERE code=? AND EXISTS(SELECT 1 FROM wave_rewards WHERE room=? AND wave=? AND applied=0)',
          )
          .bind(waveStipend(r.wave), code, code, r.wave),
        db
          .prepare('UPDATE wave_rewards SET applied=1 WHERE room=? AND wave=? AND applied=0')
          .bind(code, r.wave),
      ]);
      r = await db.prepare('SELECT * FROM rooms WHERE code=?').bind(code).first();
      leaked = 0;
    }
  }
  await cleanSeatRequests(db, code, now);
  const vehicles = await ensureFleet(db, code, now);
  const base = await baseSnapshot(db, code, now);
  const pilots = (
    await db
      .prepare(
        'SELECT id,name,state,life,health,incarnation,seen,mode,bay,board_paper,vehicle_id,seat FROM pilots WHERE room=? AND seen>?',
      )
      .bind(code, now - 12000)
      .all()
  ).results.map((p) => ({ ...p, state: JSON.parse(p.state) }));
  await db
    .prepare(
      "UPDATE access_dossiers SET active=0 WHERE room=? AND active=1 AND NOT EXISTS(SELECT 1 FROM pilots p WHERE p.id=access_dossiers.pilot AND p.life='alive' AND ((p.vehicle_id=access_dossiers.target AND p.seat=access_dossiers.seat) OR (p.mode='turret' AND access_dossiers.target='dca:'||json_extract(p.state,'$.turret'))))",
    )
    .bind(code)
    .run();
  const dossiers = (await db.prepare('SELECT * FROM access_dossiers WHERE room=?').bind(code).all())
    .results;
  for (const p of pilots)
    p.contractClause = dossiers.find((d) => d.pilot === p.id && d.active)?.clause || null;
  const purg = await purgatory(db, code, now);
  const superPurg = pilots.some((p) => p.life === 'dead' && p.state.realm === 'super')
    ? await purgatory(db, code, now, null, 'super')
    : { arena: null, souls: [] };
  const economy = await db
    .prepare('SELECT dollars,upgrades FROM rooms WHERE code=?')
    .bind(code)
    .first();
  delete r.purgatory;
  delete r.purg_revision;
  delete r.base_state;
  delete r.base_revision;
  return {
    ...r,
    dollars: economy.dollars,
    upgrades: JSON.parse(economy.upgrades),
    equipment: await roomStations(db, code),
    initialStation: initialStation(),
    kills: k,
    pilots,
    vehicles,
    dossiers,
    seatRequests: (
      await db
        .prepare("SELECT * FROM seat_requests WHERE room=? AND status IN ('signing','offered')")
        .bind(code)
        .all()
    ).results,
    rewardCount: (
      await db
        .prepare(
          'SELECT (SELECT COUNT(*) FROM soul_rewards WHERE room=?)+(SELECT COALESCE(SUM(amount),0) FROM wave_rewards WHERE room=?) AS n',
        )
        .bind(code, code)
        .first()
    ).n,
    effects: (
      await db
        .prepare(
          'SELECT id,payload FROM world_effects WHERE room=? AND created>? ORDER BY id DESC LIMIT 64',
        )
        .bind(code, now - 15000)
        .all()
    ).results.map((e) => ({ id: e.id, ...JSON.parse(e.payload) })),
    waveReward: waveStipend(r.wave),
    roster: plan.roster,
    difficulty: r.wave > 0 ? plan.budget : 0,
    enemyDamage: Object.fromEntries(
      (
        await db
          .prepare(
            'SELECT enemy,SUM(amount) AS damage FROM enemy_damage WHERE room=? AND wave=? GROUP BY enemy',
          )
          .bind(code, r.wave)
          .all()
      ).results.map((e) => [e.enemy, e.damage]),
    ),
    raidDuration: RAID_DURATION,
    mapScale: { numerator: MAP.numerator, denominator: MAP.denominator },
    total,
    leaked,
    now,
    souls: purg.souls,
    arena: purg.arena,
    superArena: superPurg.arena,
    superSouls: superPurg.souls,
    base: base.arena,
  };
}
async function cleanSeatRequests(db, code, now) {
  await db
    .prepare(
      "UPDATE seat_requests SET status='cancelled' WHERE room=? AND status IN ('signing','offered') AND (created<? OR NOT EXISTS(SELECT 1 FROM pilots p JOIN vehicle_seats s ON s.pilot=p.id WHERE p.id=seat_requests.requester AND p.life='alive' AND p.seen>? AND s.vehicle=seat_requests.vehicle AND s.seat=seat_requests.from_seat) OR (recipient IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pilots p JOIN vehicle_seats s ON s.pilot=p.id WHERE p.id=seat_requests.recipient AND p.life='alive' AND p.seen>? AND s.vehicle=seat_requests.vehicle AND s.seat=seat_requests.to_seat)))",
    )
    .bind(code, now - 120000, now - 12000, now - 12000)
    .run();
}
async function seatRoute(db, pilot, path, b, now) {
  await cleanSeatRequests(db, pilot.room, now);
  if (path === 'seat-request') {
    if (pilot.life !== 'alive' || !pilot.vehicle_id || b.seat === pilot.seat)
      return 'Choisissez un autre poste de votre appareil.';
    const vehicle = await db
      .prepare('SELECT * FROM vehicles WHERE id=?')
      .bind(pilot.vehicle_id)
      .first();
    if (!vehicle || !VEHICLES[vehicle.type].seats.includes(b.seat)) return 'Ce poste n’existe pas.';
    const target = await db
      .prepare('SELECT pilot FROM vehicle_seats WHERE vehicle=? AND seat=?')
      .bind(vehicle.id, b.seat)
      .first();
    const existing = await db
      .prepare("SELECT id FROM seat_requests WHERE requester=? AND status IN ('signing','offered')")
      .bind(pilot.id)
      .first();
    if (existing) return 'Terminez ou annulez votre demande actuelle.';
    const requestId = crypto.randomUUID();
    await db
      .prepare(
        'INSERT INTO seat_requests(id,room,vehicle,requester,recipient,from_seat,to_seat,created) VALUES(?,?,?,?,?,?,?,?)',
      )
      .bind(
        requestId,
        pilot.room,
        vehicle.id,
        pilot.id,
        target?.pilot || null,
        pilot.seat,
        b.seat,
        now,
      )
      .run();
    await createDossier(
      db,
      pilot,
      vehicle.id,
      b.seat,
      requestId + ':' + pilot.id,
      !(vehicle.type === 'bomber' && b.seat === 'pilot'),
    );
    if (target) {
      const recipient = await db
        .prepare('SELECT * FROM pilots WHERE id=?')
        .bind(target.pilot)
        .first();
      await createDossier(
        db,
        recipient,
        vehicle.id,
        pilot.seat,
        requestId + ':' + recipient.id,
        !(vehicle.type === 'bomber' && pilot.seat === 'pilot'),
      );
    }
    await db
      .prepare('UPDATE access_dossiers SET position=0 WHERE token=? OR token=?')
      .bind(requestId + ':' + pilot.id, requestId + ':' + (target?.pilot || ''))
      .run();
    return null;
  }
  const req = await db
    .prepare('SELECT * FROM seat_requests WHERE id=? AND room=?')
    .bind(b.request || '', pilot.room)
    .first();
  if (
    !req ||
    !['signing', 'offered'].includes(req.status) ||
    ![req.requester, req.recipient].includes(pilot.id)
  )
    return 'Demande expirée.';
  if (path === 'seat-reject') {
    await db
      .prepare(
        "UPDATE seat_requests SET status='cancelled' WHERE id=? AND status IN ('signing','offered')",
      )
      .bind(req.id)
      .run();
    return null;
  }
  if (await dossierDue(db, req.id + ':' + pilot.id, 0))
    return 'Traitez le feuillet courant avant de continuer.';
  if (!validSignature(b.signature)) return 'Signez le contrat de transfert.';
  if (req.status === 'signing' && pilot.id !== req.requester)
    return 'Le demandeur doit signer en premier.';
  if (req.status === 'offered' && pilot.id !== req.recipient)
    return 'La signature du destinataire est nécessaire.';
  if (req.status === 'signing' && req.recipient) {
    await db
      .prepare("UPDATE seat_requests SET status='offered' WHERE id=? AND status='signing'")
      .bind(req.id)
      .run();
    return null;
  }
  // The status transition and both assignments share a single database transaction.
  const guard = "EXISTS(SELECT 1 FROM seat_requests WHERE id=? AND status='executing')";
  const commands = [
    db
      .prepare(
        `UPDATE seat_requests SET status='executing' WHERE id=? AND status=? AND EXISTS(SELECT 1 FROM vehicle_seats WHERE vehicle=? AND seat=? AND pilot=?) AND ${req.recipient ? 'EXISTS(SELECT 1 FROM vehicle_seats WHERE vehicle=? AND seat=? AND pilot=?)' : 'NOT EXISTS(SELECT 1 FROM vehicle_seats WHERE vehicle=? AND seat=?)'}`,
      )
      .bind(
        req.id,
        req.status,
        req.vehicle,
        req.from_seat,
        req.requester,
        ...(req.recipient ? [req.vehicle, req.to_seat, req.recipient] : [req.vehicle, req.to_seat]),
      ),
  ];
  const transfers = [
    [req.requester, req.to_seat],
    ...(req.recipient ? [[req.recipient, req.from_seat]] : []),
  ];
  for (const [id] of transfers)
    commands.push(
      db.prepare('DELETE FROM vehicle_seats WHERE pilot=? AND ' + guard).bind(id, req.id),
    );
  for (const [id, seat] of transfers) {
    commands.push(
      db.prepare('UPDATE access_dossiers SET active=0 WHERE pilot=? AND ' + guard).bind(id, req.id),
    );
    commands.push(
      db
        .prepare("UPDATE access_dossiers SET active=1 WHERE token=? AND choice='sign' AND " + guard)
        .bind(req.id + ':' + id, req.id),
    );
    commands.push(
      db
        .prepare('INSERT INTO vehicle_seats(room,vehicle,seat,pilot) SELECT ?,?,?,? WHERE ' + guard)
        .bind(pilot.room, req.vehicle, seat, id, req.id),
    );
    commands.push(
      db
        .prepare(
          "UPDATE pilots SET seat=?,mode=?,state=json_set(state,'$.seat',?,'$.fire',json('false')) WHERE id=? AND " +
            guard,
        )
        .bind(seat, seat === 'pilot' ? 'flight' : 'crew', seat, id, req.id),
    );
  }
  commands.push(
    db
      .prepare("UPDATE seat_requests SET status='completed' WHERE id=? AND status='executing'")
      .bind(req.id),
  );
  await db.batch(commands);
  const done = await db.prepare('SELECT status FROM seat_requests WHERE id=?').bind(req.id).first();
  if (done.status !== 'completed') {
    await db.prepare("UPDATE seat_requests SET status='cancelled' WHERE id=?").bind(req.id).run();
    return 'Postes modifiés : transfert annulé.';
  }
  return null;
}

function playerWorld(p) {
  return p.life === 'alive'
    ? 'office'
    : JSON.parse(p.state).realm === 'super'
      ? 'super'
      : 'purgatory';
}
async function killPlayer(db, pilot, now, incarnation = null) {
  if (incarnation !== null && incarnation !== pilot.incarnation) return;
  if (pilot.life === 'dead' && incarnation === null) return;
  const realm = pilot.life === 'alive' ? 'purgatory' : 'super';
  const next = { ...spawn(0), realm };
  const guard = 'EXISTS(SELECT 1 FROM pilots WHERE id=? AND incarnation=? AND health=0)';
  await db.batch([
    db
      .prepare('UPDATE pilots SET health=0 WHERE id=? AND incarnation=?')
      .bind(pilot.id, pilot.incarnation),
    db
      .prepare(
        "UPDATE souls SET status='gone' WHERE entity=? AND kind='player' AND status='waiting' AND " +
          guard,
      )
      .bind(pilot.id, pilot.id, pilot.incarnation),
    db
      .prepare('DELETE FROM vehicle_seats WHERE pilot=? AND ' + guard)
      .bind(pilot.id, pilot.id, pilot.incarnation),
    db
      .prepare('DELETE FROM turret_seats WHERE owner=? AND ' + guard)
      .bind(pilot.id, pilot.id, pilot.incarnation),
    db
      .prepare(
        "INSERT INTO souls(room,kind,entity,name,place,realm) SELECT room,'player',id,name,0,? FROM pilots WHERE id=? AND incarnation=? AND health=0",
      )
      .bind(realm, pilot.id, pilot.incarnation),
    db
      .prepare(
        "UPDATE pilots SET life='dead',health=100,incarnation=incarnation+1,mode='foot',vehicle_id=NULL,seat=NULL,board_paper=0,state=?,seen=? WHERE id=? AND incarnation=? AND health=0",
      )
      .bind(JSON.stringify(next), now, pilot.id, pilot.incarnation),
  ]);
}
function weaponDamage(pilot, b) {
  if (pilot.mode === 'foot') return 10;
  if (pilot.mode === 'turret')
    return Math.max(0, Math.min(200, Math.round(Number(b.amount) || 80)));
  return 75;
}
async function friendlyHit(db, pilot, b, now) {
  if (typeof b.shot !== 'string' || b.shot.length > 120) return 'Impact invalide.';
  const activeClause = await db
    .prepare('SELECT clause FROM access_dossiers WHERE pilot=? AND active=1')
    .bind(pilot.id)
    .first();
  const amount =
    weaponDamage(pilot, b) *
    (pilot.mode !== 'foot' ? clauseFactors(activeClause?.clause).damage : 1);
  if (b.vehicle) {
    if (playerWorld(pilot) !== 'office') return 'Appareil hors de cet espace.';
    await db.batch([
      db
        .prepare(
          'INSERT INTO combat_damage(room,target,shooter,shot,amount,created) SELECT ?,id,?,?,?,? FROM vehicles WHERE id=? AND room=? ON CONFLICT DO NOTHING',
        )
        .bind(pilot.room, pilot.id, b.shot, amount, now, b.vehicle, pilot.room),
      db
        .prepare(
          "UPDATE vehicles SET state=json_set(state,'$.hp',MAX(0,MIN(json_extract(state,'$.hp'),100-(SELECT COALESCE(SUM(amount),0) FROM combat_damage WHERE target=?)))) WHERE id=? AND room=?",
        )
        .bind(b.vehicle, b.vehicle, pilot.room),
    ]);
    const hull = await db
      .prepare('SELECT state FROM vehicles WHERE id=? AND room=?')
      .bind(b.vehicle, pilot.room)
      .first();
    if (hull && JSON.parse(hull.state).hp <= 0)
      for (const p of (
        await db.prepare('SELECT * FROM pilots WHERE vehicle_id=?').bind(b.vehicle).all()
      ).results)
        await killPlayer(db, p, now, p.incarnation);
    return null;
  }
  const target = await db
    .prepare('SELECT * FROM pilots WHERE id=? AND room=? AND seen>?')
    .bind(b.target || '', pilot.room, now - 12000)
    .first();
  if (
    !target ||
    playerWorld(target) !== playerWorld(pilot) ||
    target.id === pilot.id ||
    (b.incarnation !== undefined && b.incarnation !== target.incarnation)
  )
    return 'Cible absente de cet espace.';
  const args = [pilot.room, target.id, target.incarnation, pilot.id, b.shot];
  await db.batch([
    db
      .prepare(
        'INSERT INTO health_hits(room,target,incarnation,shooter,shot,amount) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING',
      )
      .bind(...args, amount),
    db
      .prepare(
        'UPDATE pilots SET health=MAX(0,health-?) WHERE id=? AND incarnation=? AND EXISTS(SELECT 1 FROM health_hits WHERE room=? AND target=? AND incarnation=? AND shooter=? AND shot=? AND applied=0)',
      )
      .bind(amount, target.id, target.incarnation, ...args),
    db
      .prepare(
        'UPDATE health_hits SET applied=1 WHERE room=? AND target=? AND incarnation=? AND shooter=? AND shot=?',
      )
      .bind(...args),
  ]);
  const after = await db.prepare('SELECT * FROM pilots WHERE id=?').bind(target.id).first();
  if (after.health <= 0 && after.incarnation === target.incarnation)
    await killPlayer(db, after, now, after.incarnation);
  return null;
}
async function soulHit(db, pilot, b, now) {
  if (
    pilot.mode !== 'foot' ||
    playerWorld(pilot) === 'office' ||
    typeof b.shot !== 'string' ||
    b.shot.length > 120
  )
    return 'Pistolet indisponible.';
  const soul = await db
    .prepare("SELECT * FROM souls WHERE id=? AND room=? AND realm=? AND kind='enemy'")
    .bind(Number(b.soul), pilot.room, playerWorld(pilot))
    .first();
  if (!soul) return 'Âme absente.';
  const args = [pilot.room, 'soul:' + soul.id, 0, pilot.id, b.shot];
  const condition =
    "EXISTS(SELECT 1 FROM souls WHERE id=? AND status='waiting' AND damage>=?) AND NOT EXISTS(SELECT 1 FROM soul_rewards WHERE room=? AND soul=?)";
  await db.batch([
    db
      .prepare(
        'INSERT INTO health_hits(room,target,incarnation,shooter,shot,amount) VALUES(?,?,?,?,?,10) ON CONFLICT DO NOTHING',
      )
      .bind(...args),
    db
      .prepare(
        "UPDATE souls SET damage=damage+10 WHERE id=? AND status='waiting' AND EXISTS(SELECT 1 FROM health_hits WHERE room=? AND target=? AND incarnation=? AND shooter=? AND shot=? AND applied=0)",
      )
      .bind(soul.id, ...args),
    db
      .prepare(
        'UPDATE health_hits SET applied=1 WHERE room=? AND target=? AND incarnation=? AND shooter=? AND shot=?',
      )
      .bind(...args),
    db
      .prepare('UPDATE rooms SET dollars=dollars+1 WHERE code=? AND ' + condition)
      .bind(pilot.room, soul.id, ENEMY_TYPES[soul.enemy_type].hp, pilot.room, soul.id),
    db
      .prepare(
        'INSERT INTO soul_rewards(room,soul) SELECT ?,? WHERE ' +
          condition +
          ' ON CONFLICT DO NOTHING',
      )
      .bind(pilot.room, soul.id, soul.id, ENEMY_TYPES[soul.enemy_type].hp, pilot.room, soul.id),
    db
      .prepare("UPDATE souls SET status='gone' WHERE id=? AND damage>=?")
      .bind(soul.id, ENEMY_TYPES[soul.enemy_type].hp),
  ]);
  return null;
}

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    const versioned = u.pathname.match(/^\/assets\/([a-f0-9]{12})(\/[^/]+\.js)$/);
    if (u.pathname.startsWith('/assets/') && (!versioned || versioned[1] !== BUILD_VERSION))
      return new Response('Version expirée : rechargez la page.', {
        status: 410,
        headers: { 'cache-control': 'no-store' },
      });
    const assetPath = versioned ? versioned[2] : u.pathname;
    if (Object.hasOwn(ASSETS, assetPath))
      return new Response(ASSETS[assetPath], {
        headers: {
          'cache-control': versioned ? 'public, max-age=31536000, immutable' : 'no-cache',
          'x-game-version': BUILD_VERSION,
          'content-type':
            assetPath === '/' || assetPath.endsWith('.html')
              ? 'text/html; charset=utf-8'
              : 'application/javascript; charset=utf-8',
        },
      });
    if (u.pathname === '/api/health') return json({ ok: !!env.DB });
    if (!u.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
    if (request.headers.get('origin') && request.headers.get('origin') !== u.origin)
      return json({ error: 'Origin' }, 403);
    try {
      const raw = await request.text();
      if (raw.length > (u.pathname === '/api/signal' ? 16000 : 131072))
        return json({ error: 'Request too large' }, 413);
      const b = JSON.parse(raw);
      const db = env.DB;
      if (!db) return json({ error: 'Stockage indisponible' }, 503);
      if (u.pathname === '/api/join') {
        const code = String(b.code || 'BUREAU').toUpperCase();
        if (!/^[A-Z0-9]{3,10}$/.test(code))
          return json({ error: 'Code : 3 à 10 lettres ou chiffres.' }, 400);
        const name =
            String(b.name || 'Pilote')
              .trim()
              .slice(0, 20) || 'Pilote',
          id = crypto.randomUUID();
        await db
          .prepare('INSERT INTO rooms(code) VALUES (?) ON CONFLICT DO NOTHING')
          .bind(code)
          .run();
        const count = await db
          .prepare('SELECT COUNT(*) AS n FROM pilots WHERE room=? AND seen>?')
          .bind(code, Date.now() - 12000)
          .first();
        const claimed = await db
          .prepare(
            'WITH RECURSIVE bays(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM bays WHERE n<99) INSERT INTO aircraft_slots(room,bay,owner,claimed) SELECT ?,n,?,? FROM bays WHERE NOT EXISTS(SELECT 1 FROM aircraft_slots s LEFT JOIN pilots p ON p.id=s.owner WHERE s.room=? AND s.bay=bays.n AND (s.claimed>? OR p.seen>?)) ORDER BY n LIMIT 1 ON CONFLICT(room,bay) DO UPDATE SET owner=excluded.owner,claimed=excluded.claimed',
          )
          .bind(code, id, Date.now(), code, Date.now() - 12000, Date.now() - 12000)
          .run();
        if (!claimed.meta?.changes)
          return json({ error: 'La partie est complète (100 pilotes).' }, 409);
        const slot = await db
            .prepare('SELECT bay FROM aircraft_slots WHERE room=? AND owner=?')
            .bind(code, id)
            .first(),
          bay = slot.bay;
        const state = spawn(count.n);
        await db
          .prepare('INSERT INTO pilots(id,room,name,state,seen,bay) VALUES (?,?,?,?,?,?)')
          .bind(id, code, name, JSON.stringify(state), Date.now(), bay)
          .run();
        return json({ id, state, snapshot: await snapshot(db, code) });
      }
      const pilot = await db
        .prepare('SELECT * FROM pilots WHERE id=?')
        .bind(String(b.id || ''))
        .first();
      if (!pilot) return json({ error: 'Connexion expirée. Recharge la page.' }, 401);
      if (pilot.vehicle_id) {
        const lease = await db
          .prepare('SELECT pilot FROM vehicle_seats WHERE vehicle=? AND seat=?')
          .bind(pilot.vehicle_id, pilot.seat)
          .first();
        if (lease?.pilot !== pilot.id) {
          const state = JSON.parse(pilot.state);
          state.vehicle = null;
          state.seat = null;
          state.walkSpawn = null;
          state.fire = false;
          pilot.mode = 'foot';
          pilot.vehicle_id = null;
          pilot.seat = null;
          pilot.state = JSON.stringify(state);
          await db
            .prepare("UPDATE pilots SET mode='foot',vehicle_id=NULL,seat=NULL,state=? WHERE id=?")
            .bind(pilot.state, pilot.id)
            .run();
        }
      }
      const code = pilot.room,
        now = Date.now();
      if (pilot.seen < now - 12000) {
        const conflict = await db
          .prepare('SELECT id FROM pilots WHERE room=? AND bay=? AND id<>? AND seen>?')
          .bind(code, pilot.bay, pilot.id, now - 12000)
          .first();
        if (conflict)
          return json(
            { error: 'Votre emplacement a été réattribué. Rechargez pour rejoindre la partie.' },
            401,
          );
      }
      if (u.pathname === '/api/signal') {
        const target = await db
          .prepare('SELECT id FROM pilots WHERE id=? AND room=? AND seen>?')
          .bind(String(b.to || ''), code, now - 12000)
          .first();
        const message = b.message,
          description = message?.description,
          candidate = message?.candidate;
        if (
          !target ||
          target.id === pilot.id ||
          !message ||
          typeof message.session !== 'string' ||
          message.session.length > 80 ||
          !(
            (description &&
              ['offer', 'answer'].includes(description.type) &&
              typeof description.sdp === 'string' &&
              description.sdp.length < 14000) ||
            (candidate &&
              typeof candidate.candidate === 'string' &&
              candidate.candidate.length < 2000)
          )
        )
          return json({ error: 'Signal invalide' }, 400);
        const rate = await db
          .prepare('SELECT COUNT(*) AS n FROM signals WHERE sender=? AND created>?')
          .bind(pilot.id, now - 10000)
          .first();
        if (rate.n >= 200) return json({ error: 'Trop de signaux' }, 429);
        await db.batch([
          db
            .prepare('INSERT INTO signals(room,sender,recipient,payload,created) VALUES(?,?,?,?,?)')
            .bind(code, pilot.id, target.id, JSON.stringify(message), now),
          db.prepare('DELETE FROM signals WHERE created<?').bind(now - 60000),
        ]);
        return json({ ok: true });
      }
      if (u.pathname === '/api/sync') {
        const s = b.state;
        if (
          !s ||
          !['p', 'q', 'v'].every(
            (k) =>
              Array.isArray(s[k]) &&
              s[k].length === (k === 'q' ? 4 : 3) &&
              s[k].every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 10000),
          )
        )
          return json({ error: 'État invalide' }, 400);
        await ensureFleet(db, code, now);
        const oldState = JSON.parse(pilot.state),
          flying = pilot.life === 'alive' && pilot.mode === 'flight' && b.mode === 'flight';
        const safe = {
          p: flying ? s.p : oldState.p,
          q: flying ? s.q : oldState.q,
          v: flying ? s.v : oldState.v,
          hp: Math.max(0, Math.min(100, Number(s.hp) || 0)),
          wing: s.wing === 0 ? 0 : 1,
          engine: s.engine === 0 ? 0 : 1,
          fire: (flying || ['turret', 'crew'].includes(pilot.mode)) && !!s.fire,
          soul: null,
          realm: oldState.realm || null,
          ground: s.ground || null,
          gas: Number.isFinite(s.gas) ? Math.max(0, Math.min(1, s.gas)) : (oldState.gas ?? 0.65),
          omega:
            Array.isArray(s.omega) && s.omega.length === 3 && s.omega.every(Number.isFinite)
              ? s.omega
              : oldState.omega || [0, 0, 0],
          landed: flying ? !!s.landed : !!oldState.landed,
          parked: oldState.parked || null,
          walkSpawn: oldState.walkSpawn || null,
          turret: pilot.mode === 'turret' ? oldState.turret : null,
          vehicle: pilot.vehicle_id,
          seat: pilot.seat,
          permits: oldState.permits || [],
          boarding: oldState.boarding || null,
          equipmentBoarding: oldState.equipmentBoarding || null,
          turretDirection:
            Array.isArray(s.turretDirection) &&
            s.turretDirection.length === 3 &&
            s.turretDirection.every(Number.isFinite)
              ? s.turretDirection
              : [0, 0.3, -1],
        };
        await db
          .prepare('UPDATE pilots SET state=?,seen=? WHERE id=? AND mode=? AND life=?')
          .bind(JSON.stringify(safe), Date.now(), b.id, pilot.mode, pilot.life)
          .run();
        if (pilot.vehicle_id && pilot.seat === 'pilot' && flying) {
          const row = await db
            .prepare('SELECT * FROM vehicles WHERE id=? AND room=?')
            .bind(pilot.vehicle_id, code)
            .first();
          if (row) {
            const previous = JSON.parse(row.state),
              state = { ...safe, hp: Math.min(safe.hp, previous.hp), type: row.type };
            const moved = leftVehiclePad({ ...row, state });
            await db
              .prepare(
                "UPDATE vehicles SET state=?,ready=CASE WHEN ? THEN 0 ELSE ready END WHERE id=? AND EXISTS(SELECT 1 FROM vehicle_seats WHERE vehicle=? AND seat='pilot' AND pilot=?)",
              )
              .bind(JSON.stringify(state), moved ? 1 : 0, row.id, row.id, pilot.id)
              .run();
          }
        }
        const host = await db
          .prepare('SELECT id FROM pilots WHERE room=? AND seen>? ORDER BY id LIMIT 1')
          .bind(code, now - 12000)
          .first();
        if (host?.id === pilot.id)
          for (const report of (Array.isArray(b.vacant) ? b.vacant : []).slice(0, 100)) {
            const state = report.state;
            if (
              !state ||
              !['p', 'q', 'v'].every(
                (k) =>
                  Array.isArray(state[k]) &&
                  state[k].length === (k === 'q' ? 4 : 3) &&
                  state[k].every(Number.isFinite),
              )
            )
              continue;
            await db
              .prepare(
                "UPDATE vehicles SET state=?,ready=CASE WHEN ? THEN 0 ELSE ready END WHERE id=? AND room=? AND NOT EXISTS(SELECT 1 FROM vehicle_seats WHERE vehicle=? AND seat='pilot')",
              )
              .bind(JSON.stringify(state), state.hp <= 0 ? 1 : 0, report.id, code, report.id)
              .run();
            if (state.hp <= 0) {
              const crew = (
                await db.prepare('SELECT * FROM pilots WHERE vehicle_id=?').bind(report.id).all()
              ).results;
              for (const p of crew) await killPlayer(db, p, now, p.incarnation);
            }
          }
        if (pilot.life === 'alive' && pilot.mode === 'foot')
          await baseSnapshot(db, code, now, {
            type: 'input',
            entity: pilot.id,
            input: b.baseInput,
            report: b.ground,
          });
        if (pilot.life === 'dead')
          await purgatory(
            db,
            code,
            now,
            {
              type: 'input',
              entity: pilot.id,
              input: b.soulInput,
              report: b.ground,
            },
            JSON.parse(pilot.state).realm === 'super' ? 'super' : 'purgatory',
          );
      } else if (u.pathname === '/api/buy') {
        const error = await buyEquipment(db, pilot, b, now);
        if (error) return json({ error }, 409);
      } else if (
        ['/api/vehicle-select', '/api/vehicle-sign', '/api/vehicle-exit'].includes(u.pathname)
      ) {
        const error = await fleetRoute(u.pathname.slice(5), db, pilot, b, now);
        if (error) return json({ error }, 409);
      } else if (u.pathname === '/api/dossier-choice') {
        const error = await dossierChoice(db, pilot, b);
        if (error) return json({ error }, 409);
      } else if (u.pathname === '/api/aircraft-fire') {
        // Legacy single-round reports remain compatible with older clients.
        const shots = Array.isArray(b.shots) ? b.shots : [b.shot];
        if (
          !shots.length ||
          shots.length > 32 ||
          new Set(shots).size !== shots.length ||
          shots.some(
            (shot) =>
              typeof shot !== 'string' ||
              !shot.length ||
              shot.length > 120 ||
              shot.startsWith('used:'),
          )
        )
          return json({ error: 'Rapport de tirs invalide.' }, 400);
        if (pilot.life !== 'alive' || !pilot.vehicle_id || !['flight', 'crew'].includes(pilot.mode))
          return json({ error: 'Poste armé requis.' }, 409);
        const vehicle = await db
          .prepare('SELECT id,type FROM vehicles WHERE id=? AND room=?')
          .bind(pilot.vehicle_id, code)
          .first();
        const seat = pilot.seat;
        if ((b.vehicle && b.vehicle !== pilot.vehicle_id) || (b.seat && b.seat !== seat))
          return json({ error: 'Poste modifié.' }, 409);
        if (!vehicle || !ammoCapacity(vehicle.type, seat))
          return json({ error: 'Ce poste ne possède pas cette arme.' }, 409);
        const path = '$.' + seat;
        await db.batch(
          shots.flatMap((shot) => [
            db
              .prepare(
                'INSERT INTO aircraft_shots(vehicle,shot) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM aircraft_shots WHERE vehicle=? AND shot=?) AND EXISTS(SELECT 1 FROM vehicle_supplies WHERE vehicle=? AND json_extract(ammo,?)>=1) ON CONFLICT DO NOTHING',
              )
              .bind(vehicle.id, shot, vehicle.id, 'used:' + shot, vehicle.id, path),
            db
              .prepare(
                'UPDATE vehicle_supplies SET ammo=json_set(ammo,?,MAX(0,json_extract(ammo,?)-1)),revision=revision+1 WHERE vehicle=? AND EXISTS(SELECT 1 FROM aircraft_shots WHERE vehicle=? AND shot=?)',
              )
              .bind(path, path, vehicle.id, vehicle.id, shot),
            db
              .prepare('UPDATE aircraft_shots SET shot=? WHERE vehicle=? AND shot=?')
              .bind('used:' + shot, vehicle.id, shot),
          ]),
        );
        const allowed = await db
          .prepare(
            'SELECT shot FROM aircraft_shots WHERE vehicle=? AND shot IN (' +
              shots.map(() => '?').join(',') +
              ')',
          )
          .bind(vehicle.id, ...shots.map((shot) => 'used:' + shot))
          .all();
        const remaining = await db
          .prepare('SELECT ammo,revision FROM vehicle_supplies WHERE vehicle=?')
          .bind(vehicle.id)
          .first();
        return json({
          allowed: !!allowed.results.length,
          shots,
          vehicle: vehicle.id,
          seat,
          ammo: JSON.parse(remaining.ammo),
          revision: remaining.revision,
        });
      } else if (u.pathname === '/api/blast') {
        if (
          pilot.life !== 'alive' ||
          pilot.mode !== 'turret' ||
          typeof b.shot !== 'string' ||
          !Array.isArray(b.p) ||
          b.p.length !== 3 ||
          !b.p.every(Number.isFinite)
        )
          return json({ error: 'Explosion invalide' }, 400);
        await db
          .prepare(
            'INSERT INTO world_effects(room,shot,payload,created) VALUES(?,?,?,?) ON CONFLICT DO NOTHING',
          )
          .bind(code, b.shot, JSON.stringify({ kind: 'blast', p: b.p, shot: b.shot, at: now }), now)
          .run();
        await db
          .prepare('DELETE FROM world_effects WHERE created<?')
          .bind(now - 15000)
          .run();
      } else if (u.pathname === '/api/exit-plane') {
        if (pilot.life !== 'alive' || pilot.mode !== 'flight')
          return json({ error: 'Vous devez être dans votre avion.' }, 409);
        const state = b.state;
        if (
          !state ||
          !['p', 'q', 'v'].every(
            (k) =>
              Array.isArray(state[k]) &&
              state[k].length === (k === 'q' ? 4 : 3) &&
              state[k].every((v) => Number.isFinite(v) && Math.abs(v) < 5000),
          )
        )
          return json({ error: 'Position invalide' }, 400);
        const grounded = !!state.landed,
          old = JSON.parse(pilot.state),
          base = OFFICE_LAYOUT.base;
        // Cooperative trust: exit uses the same locally simulated pose as flight sync.
        const offset = grounded ? 3.6 * ACTOR_UNIT : 0;
        const next = {
          ...old,
          ...state,
          fire: false,
          parked: grounded
            ? { p: state.p, q: state.q, hp: state.hp, wing: state.wing, engine: state.engine }
            : null,
          walkSpawn: {
            x: (state.p[0] + offset - base.originX) / ACTOR_UNIT,
            z: (base.originZ - state.p[2]) / ACTOR_UNIT,
            y: grounded ? state.p[1] - 1.05 * ACTOR_UNIT : state.p[1],
            parachute: false,
            airborne: !grounded,
          },
        };
        await db.batch([
          db
            .prepare("UPDATE pilots SET mode='foot',state=?,seen=? WHERE id=? AND mode='flight'")
            .bind(JSON.stringify(next), now, pilot.id),
        ]);
      } else if (u.pathname === '/api/enter-plane') {
        if (pilot.life !== 'alive' || pilot.mode !== 'foot' || pilot.board_paper !== 2)
          return json({ error: 'Signez votre dossier avant de monter.' }, 409);
        const state = JSON.parse(pilot.state),
          pose = state.parked;
        if (!pose) return json({ error: 'Votre avion a été abandonné en vol.' }, 409);
        const base = await baseSnapshot(db, code, now, {
            type: 'input',
            entity: pilot.id,
            report: b.ground,
          }),
          body = base.arena?.bodies.find((x) => x.entity === pilot.id),
          w = body && baseWorld(body);
        if (
          !w ||
          body.parachute ||
          Math.abs(w.y - (pose.p[1] - 1.05 * ACTOR_UNIT)) > 2 * ACTOR_UNIT ||
          Math.hypot(w.x - pose.p[0], w.z - pose.p[2]) > 5 * ACTOR_UNIT
        )
          return json({ error: 'Approchez de votre avion.' }, 409);
        await db
          .prepare("UPDATE pilots SET mode='flight',state=? WHERE id=? AND mode='foot'")
          .bind(
            JSON.stringify({
              ...state,
              ...pose,
              parked: null,
              landed: true,
              fire: false,
              v: [0, 0, 0],
            }),
            pilot.id,
          )
          .run();
      } else if (
        ['/api/turret', '/api/equipment-select', '/api/equipment-sign'].includes(u.pathname)
      ) {
        if (pilot.life !== 'alive')
          return json({ error: 'Revenez à la vie avant de servir une DCA.' }, 409);
        const state = JSON.parse(pilot.state);
        if (pilot.mode === 'turret') {
          const station = (await roomStations(db, code))[state.turret],
            base = OFFICE_LAYOUT.base;
          if (!station) return json({ error: 'Poste invalide' }, 409);
          state.walkSpawn = {
            x: (station.x + MAP.metres(3) - base.originX) / ACTOR_UNIT,
            z: (base.originZ - station.z) / ACTOR_UNIT,
            y: station.y + 0.05 * ACTOR_UNIT,
            parachute: false,
          };
          state.turret = null;
          state.fire = false;
          await db.batch([
            db
              .prepare("UPDATE pilots SET mode='foot',state=? WHERE id=?")
              .bind(JSON.stringify(state), pilot.id),
            db.prepare('DELETE FROM turret_seats WHERE room=? AND owner=?').bind(code, pilot.id),
            db.prepare('UPDATE access_dossiers SET active=0 WHERE pilot=?').bind(pilot.id),
          ]);
        } else {
          const station = (await roomStations(db, code))[b.station];
          if (
            pilot.mode !== 'foot' ||
            !Number.isInteger(b.station) ||
            !station ||
            station.kind !== 'dca'
          )
            return json({ error: 'Approchez de la DCA à pied.' }, 409);
          const base = await baseSnapshot(db, code, now, {
              type: 'input',
              entity: pilot.id,
              report: b.ground,
            }),
            body = base.arena?.bodies.find((x) => x.entity === pilot.id);
          if (!body || body.parachute || !stationAccess(baseWorld(body), station))
            return json({ error: 'Approchez de la DCA à pied.' }, 409);
          if (u.pathname === '/api/equipment-select') {
            if (state.equipmentBoarding?.station === b.station)
              return json(await snapshot(db, code));
            state.boarding = null;
            state.equipmentBoarding = { station: b.station, paper: 0, token: crypto.randomUUID() };
            await createDossier(
              db,
              pilot,
              'dca:' + b.station,
              'dca',
              state.equipmentBoarding.token,
            );
            await db
              .prepare('UPDATE pilots SET state=? WHERE id=?')
              .bind(JSON.stringify(state), pilot.id)
              .run();
            return json(await snapshot(db, code));
          }
          if (u.pathname !== '/api/equipment-sign' || !validSignature(b.signature))
            return json({ error: 'Signez les documents de cet équipement.' }, 409);
          if (
            state.equipmentBoarding?.station !== b.station ||
            b.form !== state.equipmentBoarding.paper + 1 ||
            b.form > 2
          )
            return json({ error: 'Signez le dossier dans l’ordre.' }, 409);
          if (
            await dossierDue(
              db,
              state.equipmentBoarding?.token,
              state.equipmentBoarding?.paper || 0,
            )
          )
            return json({ error: 'Traitez le feuillet courant avant de continuer.' }, 409);
          if (b.form === 1) {
            state.equipmentBoarding.paper = 1;
            await db
              .prepare('UPDATE pilots SET state=? WHERE id=?')
              .bind(JSON.stringify(state), pilot.id)
              .run();
            return json(await snapshot(db, code));
          }
          const dossierToken = state.equipmentBoarding.token;
          state.equipmentBoarding = null;
          state.turret = b.station;
          state.turretDirection = [0, 0.3, -1];
          state.fire = false;
          await db.batch([
            db
              .prepare(
                "INSERT INTO turret_seats(room,station,owner) VALUES(?,?,?) ON CONFLICT(room,station) DO UPDATE SET owner=excluded.owner WHERE NOT EXISTS(SELECT 1 FROM pilots WHERE id=turret_seats.owner AND life='alive' AND mode='turret' AND seen>?)",
              )
              .bind(code, b.station, pilot.id, now - 12000),
            db
              .prepare(
                "UPDATE pilots SET mode='turret',state=? WHERE id=? AND mode='foot' AND EXISTS(SELECT 1 FROM turret_seats WHERE room=? AND station=? AND owner=?)",
              )
              .bind(JSON.stringify(state), pilot.id, code, b.station, pilot.id),
          ]);
          const seat = await db
            .prepare('SELECT owner FROM turret_seats WHERE room=? AND station=?')
            .bind(code, b.station)
            .first();
          if (seat?.owner !== pilot.id) return json({ error: 'Cette DCA est déjà occupée.' }, 409);
          await activateDossier(db, pilot, dossierToken, 'dca:' + b.station, 'dca');
        }
      } else if (['/api/seat-request', '/api/seat-sign', '/api/seat-reject'].includes(u.pathname)) {
        const error = await seatRoute(db, pilot, u.pathname.slice(5), b, now);
        if (error) return json({ error }, 409);
      } else if (u.pathname === '/api/soul-hit') {
        const error = await soulHit(db, pilot, b, now);
        if (error) return json({ error }, 409);
      } else if (u.pathname === '/api/friendly-hit') {
        const error = await friendlyHit(db, pilot, b, now);
        if (error) return json({ error }, 409);
      } else if (u.pathname === '/api/death') {
        if (
          pilot.life === 'alive' &&
          pilot.seat === 'pilot' &&
          pilot.vehicle_id &&
          (b.incarnation === undefined || b.incarnation === pilot.incarnation)
        ) {
          await db
            .prepare("UPDATE vehicles SET state=json_set(state,'$.hp',0),ready=0 WHERE id=?")
            .bind(pilot.vehicle_id)
            .run();
          const mates = (
            await db
              .prepare('SELECT * FROM pilots WHERE vehicle_id=? AND id<>?')
              .bind(pilot.vehicle_id, pilot.id)
              .all()
          ).results;
          for (const mate of mates) await killPlayer(db, mate, now, mate.incarnation);
        }
        await killPlayer(db, pilot, now, b.incarnation);
      } else if (u.pathname === '/api/punch' || u.pathname === '/api/dash') {
        return json(
          { error: 'Les coups sont maintenant calculés localement. Rechargez la page.' },
          409,
        );
      } else if (u.pathname === '/api/board-sign') {
        if (pilot.life !== 'alive' || pilot.mode !== 'foot')
          return json({ error: 'Vous devez être à pied.' }, 409);
        if (!validSignature(b.signature))
          return json({ error: 'Tracez votre signature dans le cadre.' }, 400);
        const form = Number(b.form);
        if (!Number.isInteger(form) || form < 1 || form > 2)
          return json({ error: 'Document invalide' }, 400);
        const result = await baseSnapshot(db, code, now, {
          type: 'sign',
          entity: pilot.id,
          form,
          report: b.ground,
        });
        if (result.error) return json({ error: result.error }, 409);
      } else if (u.pathname === '/api/sign') {
        if (pilot.life !== 'dead') return json({ error: 'Tu dois être au purgatoire.' }, 409);
        if (!validSignature(b.signature))
          return json({ error: 'Trace une vraie signature avant de déposer le document.' }, 400);
        const form = Number(b.form);
        if (
          !Number.isInteger(form) ||
          form < 1 ||
          form > (JSON.parse(pilot.state).realm === 'super' ? 5 : 3)
        )
          return json({ error: 'Document invalide' }, 400);
        const result = await purgatory(
          db,
          code,
          now,
          {
            type: 'sign',
            entity: pilot.id,
            form,
            report: b.ground,
          },
          JSON.parse(pilot.state).realm === 'super' ? 'super' : 'purgatory',
        );
        if (result.error) return json({ error: result.error }, 409);
      } else if (u.pathname === '/api/start') {
        const r = await db
          .prepare('SELECT mission_started FROM rooms WHERE code=?')
          .bind(code)
          .first();
        if (!r.mission_started)
          await db
            .prepare(
              "UPDATE rooms SET mission_started=1,next_wave_at=? WHERE code=? AND phase='prep' AND mission_started=0",
            )
            .bind(now + 10000, code)
            .run();
        else
          await db
            .prepare(
              "UPDATE rooms SET phase='combat',wave=wave+1,started=?,next_wave_at=0 WHERE code=? AND phase='prep' AND wave>0",
            )
            .bind(now, code)
            .run();
      } else if (u.pathname === '/api/fan') {
        await db.prepare('UPDATE rooms SET fan=1-fan WHERE code=?').bind(code).run();
      } else if (u.pathname === '/api/hit') {
        const r = await db.prepare('SELECT * FROM rooms WHERE code=?').bind(code).first();
        const enemy = wavePlan(code, r.wave, r.started).roster[b.enemy];
        if (
          pilot.life === 'alive' &&
          ['foot', 'flight', 'turret', 'crew'].includes(pilot.mode) &&
          r.phase === 'combat' &&
          b.wave === r.wave &&
          Number.isInteger(b.enemy) &&
          enemy
        ) {
          const shot = String(b.shot || 'legacy').slice(0, 120),
            amount = Math.max(1, Math.min(800, Number(b.amount) || 75));
          await db.batch([
            db
              .prepare(
                'INSERT INTO enemy_damage(room,wave,enemy,shooter,shot,amount) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING',
              )
              .bind(code, r.wave, b.enemy, pilot.id, shot, amount),
            db
              .prepare(
                'INSERT INTO kills(room,wave,enemy,pilot) SELECT ?,?,?,? WHERE (SELECT COALESCE(SUM(amount),0) FROM enemy_damage WHERE room=? AND wave=? AND enemy=?)>=? ON CONFLICT DO NOTHING',
              )
              .bind(code, r.wave, b.enemy, pilot.id, code, r.wave, b.enemy, enemy.hp),
            db
              .prepare(
                "INSERT INTO souls(room,kind,entity,name,place,enemy_type) SELECT ?, 'enemy',?,?,(SELECT COALESCE(MAX(place),0)+1 FROM souls WHERE room=?),? WHERE EXISTS(SELECT 1 FROM kills WHERE room=? AND wave=? AND enemy=?) AND NOT EXISTS(SELECT 1 FROM souls WHERE room=? AND kind='enemy' AND entity=?)",
              )
              .bind(
                code,
                r.wave + ':' + b.enemy,
                enemy.name,
                code,
                enemy.type,
                code,
                r.wave,
                b.enemy,
                code,
                r.wave + ':' + b.enemy,
              ),
          ]);
        }
      } else if (u.pathname === '/api/reset') {
        await db.batch([
          db
            .prepare(
              "UPDATE rooms SET dollars=0,upgrades='{}',wave=0,started=0,phase='prep',infestation=0,mission_started=0,next_wave_at=0,super_state='{}',super_revision=super_revision+1,purgatory='{}',purg_revision=purg_revision+1,base_state='{}',base_revision=base_revision+1 WHERE code=?",
            )
            .bind(code),
          db.prepare('DELETE FROM equipment WHERE room=?').bind(code),
          db.prepare('DELETE FROM purchase_orders WHERE room=?').bind(code),
          db.prepare('DELETE FROM soul_rewards WHERE room=?').bind(code),
          db.prepare('DELETE FROM kills WHERE room=?').bind(code),
          db.prepare('DELETE FROM enemy_damage WHERE room=?').bind(code),
          db
            .prepare(
              'DELETE FROM aircraft_shots WHERE vehicle IN(SELECT id FROM vehicles WHERE room=?)',
            )
            .bind(code),
          db.prepare('DELETE FROM vehicle_supplies WHERE room=?').bind(code),
          db.prepare('DELETE FROM access_dossiers WHERE room=?').bind(code),
          db.prepare('DELETE FROM vehicles WHERE room=?').bind(code),
          db.prepare('DELETE FROM vehicle_seats WHERE room=?').bind(code),
          db.prepare('DELETE FROM world_effects WHERE room=?').bind(code),
          db.prepare('DELETE FROM souls WHERE room=?').bind(code),
          db.prepare('DELETE FROM turret_seats WHERE room=?').bind(code),
          db.prepare('DELETE FROM combat_damage WHERE room=?').bind(code),
          db.prepare('DELETE FROM health_hits WHERE room=?').bind(code),
          db.prepare('DELETE FROM wave_rewards WHERE room=?').bind(code),
          db.prepare('DELETE FROM seat_requests WHERE room=?').bind(code),
          db
            .prepare(
              "UPDATE pilots SET life='alive',health=100,incarnation=incarnation+1,mode='foot',vehicle_id=NULL,seat=NULL,board_paper=0,state=? WHERE room=?",
            )
            .bind(JSON.stringify(spawn(0)), code),
        ]);
      } else return json({ error: 'Unknown route' }, 404);
      const result = await snapshot(db, code);
      result.damage = (
        await db
          .prepare(
            'SELECT id,amount,shooter FROM combat_damage WHERE room=? AND target=? AND id>? ORDER BY id LIMIT 64',
          )
          .bind(code, pilot.id, Number.isSafeInteger(b.damageSince) ? b.damageSince : 0)
          .all()
      ).results;
      if (u.pathname === '/api/sync' && Number.isSafeInteger(b.signalSince) && b.signalSince >= 0)
        result.signals = (
          await db
            .prepare(
              'SELECT id,sender,payload FROM signals WHERE room=? AND recipient=? AND id>? AND created>? ORDER BY id LIMIT 64',
            )
            .bind(code, pilot.id, b.signalSince, now - 60000)
            .all()
        ).results.map((s) => ({ ...s, payload: JSON.parse(s.payload) }));
      return json(result);
    } catch (e) {
      console.error(e);
      return json({ error: 'Erreur de connexion. Réessaie dans un instant.' }, 500);
    }
  },
};
