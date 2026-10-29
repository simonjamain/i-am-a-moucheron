import { PurchaseUI } from '/purchase-ui.js';
import { purchaseCount } from '/equipment.js';
import { vehicleHue } from '/logistics.js';
import { WASH } from '/vehicle-care.js';
import { ballisticMarks } from '/tank-reticle.js';
import { InteractionTiming } from '/interaction-timing.js';
import { BedUI } from '/bed-ui.js';
import { bedAccess } from '/beds.js';
import { tankSight } from '/tank-view.js';
import { shoulderView, aimPistol, muzzleAim } from '/personal-aim.js';
import { BankUI } from '/bank-ui.js';
import { ContextHUD, equipmentHUD } from '/hud.js';
import { paintVehicle, updateInscriptions } from '/vehicle-livery.js';
import { AircraftFire } from '/aircraft-fire.js';
import { inRadarCoverage } from '/logistics.js';
import { maliciousDocument, clauseFactors } from '/malice.js';
import { InsectStatus, insectScale } from '/insect-status.js';
import { stepVacantAircraft } from '/vacant-flight.js';
import { CONTRACTS, ContractBook, contractKey } from '/contracts.js';
import { RewardQueue } from '/rewards.js';
import {
  SHOP,
  shopPrice,
  upgradedVehicle,
  placementAhead,
  supportedPlacement,
} from '/equipment.js';
import { stepBallisticVelocity, toggleParachute } from '/ballistics.js';
import { makeTracer, updateTracer } from '/tracers.js';
import { wavePlan, swarmFrame, entryStatus } from '/waves.js';
import { MAP, ACTOR_UNIT, HUMAN_SCALE, INSECT_SCALE, REFERENCE, FLAK } from '/scale.js';
import { VEHICLES, SEAT_NAMES, vehiclePad, vehicleEntry, vehicleAccess } from '/fleet.js';
import {
  spreadDirection,
  fuseRange,
  blastDamage,
  shellImpact,
  diveIntensity,
  CombatEffects,
} from '/combat.js';
import { OFFICE_LAYOUT, ROOM_SCALE } from '/layout.js';
import {
  aimGun,
  gunnerView,
  BULLET_SPEED,
  FIRE_INTERVAL,
  stationAccess,
  resolveLanding,
  stepWalker,
  makeAntiaircraft,
  GEAR_HEIGHT,
} from '/sortie.js';
import { nearestInsectHit, nearestMeshHit, HitEffects, insectContact } from '/insect-hits.js';
import {
  ControlFocus,
  equipmentExitAction,
  equipmentEnterAllowed,
  gameKey,
  flightInput,
  lookDelta,
} from '/control-focus.js';
import { createRenderer } from '/renderer.js';
import { createGraphics } from '/graphics.js';
import { createOffice } from '/office.js';
import { aircraftBay, baseBody, baseWorld, baseAccess, advanceBase, aircraftPose } from '/base.js';
import { SpatialAudio } from '/audio.js';
import { advanceArena, deskOccupant, bodyMotion, mergeOwnedArena } from '/purgatory-physics.js';
import {
  flightClickAction,
  rotateMouseAim,
  mouseFlightControls,
  mouseCameraRotation,
} from '/mouse-flight.js';
import { PeerMotion, MotionTrack } from '/network.js';
import { UdpClient } from '/udp-client.js';
import { HoldZoom, contextKey, rangeReadout } from '/equipment-controls.js';
import { HEAVY, TANK_MG, availableShell } from '/armament.js';
import { stepTank } from '/tank.js';
import { CrashEffects } from '/crash-effects.js';
import * as T from '/three.js';
import { stepFlight } from '/flight.js';
import { readPad, neutralPad } from '/input.js';
const $ = (id) => document.getElementById(id),
  canvas = $('view'),
  scene = new T.Scene();
scene.background = new T.Color('#829f91');
scene.fog = new T.FogExp2('#829f91', 0.035);
let audioSettings = { volume: 0.55, muted: false };
try {
  audioSettings = {
    ...audioSettings,
    ...JSON.parse(localStorage.getItem('moucheron-audio') || '{}'),
  };
} catch {}
const sound = new SpatialAudio(audioSettings);
const rewardQueue = new RewardQueue(() => sound.play('dollar', camera.position, { ref: 100000 }));
setInterval(() => rewardQueue.tick(performance.now()), 40);
function audioHUD() {
  $('soundToggle').textContent = sound.muted
    ? '🔇 Son coupé'
    : sound.status() === 'actif'
      ? '🔊 Son actif'
      : sound.status() === 'indisponible'
        ? 'Son indisponible'
        : '🔈 Activer le son';
  $('soundToggle').setAttribute('aria-pressed', String(!sound.muted));
  $('soundToggle').title = 'Effets 3D · ' + sound.status();
  $('soundVolume').value = String(Math.round(sound.volume * 100));
}
function saveAudio() {
  try {
    localStorage.setItem(
      'moucheron-audio',
      JSON.stringify({ volume: sound.volume, muted: sound.muted }),
    );
  } catch {}
  audioHUD();
}
$('soundToggle').onclick = async () => {
  const wasActive = sound.status() === 'actif';
  await sound.unlock();
  if (wasActive) sound.setMuted(!sound.muted);
  else sound.setMuted(false);
  saveAudio();
};
$('soundVolume').oninput = (e) => {
  sound.setVolume(Number(e.target.value) / 100);
  saveAudio();
};
for (const event of ['pointerdown', 'keydown'])
  addEventListener(
    event,
    (e) => {
      if (e.target.closest?.('#soundToggle')) return;
      if (!document.hidden) sound.unlock().then(audioHUD);
    },
    { capture: true },
  );
document.addEventListener('visibilitychange', () => {
  sound.visibility(document.hidden);
  audioHUD();
});
addEventListener('pagehide', () => sound.close());
audioHUD();
const renderer = createRenderer(T, canvas);

const camera = new T.PerspectiveCamera(62, innerWidth / innerHeight, 0.00005, 40);
const holdZoom = new HoldZoom();
const zoomScope = () =>
  joined && !respawnAt && (myVehicle || turretIndex >= 0) && controlFocus.active
    ? JSON.stringify([
        myVehicle?.id,
        crewSeat,
        turretIndex,
        snap?.pilots.find((p) => p.id === id)?.occupation,
      ])
    : null;
camera.position.set(-1.65, 1.05, 2.6);
const hitEffects = new HitEffects(T, scene, { scale: ACTOR_UNIT });
const insectStatus = new InsectStatus(T, scene, { scale: INSECT_SCALE });
const combatEffects = new CombatEffects(T, scene);
const crashEffects = new CrashEffects(T, scene, {
  sound: (kind, p) => sound.play(kind, p, { ref: 30 }),
  blast: (p) => combatEffects.blast(p),
});
const {
  mat,
  box,
  cyl,
  ball,
  textLabel,
  makePlane,
  makeSpitfire,
  makeBomber,
  makeStuka,
  makeBomb,
  makeTank,
  insect,
  humanoid,
  pm,
} = createGraphics(T, scene);
const { colliders, fanGroup, rotor, winds } = createOffice(T, scene, {
  box,
  cyl,
  ball,
  mat,
  textLabel,
});
let me = makePlane('#e3ebc0');
me.scale.setScalar(ACTOR_UNIT);
me.visible = false;
const others = new Map(),
  insects = new Map(),
  trails = [];
me.position.fromArray(aircraftPose(0).p);
let joined = false,
  id = '',
  snap = null,
  clockOffset = 0,
  lastSnap = 0,
  room = '',
  pending = false,
  respawnAt = 0,
  deathPending = false,
  soulBusy = false,
  punchAt = 0,
  hp = 100,
  wing = 1,
  engine = 1,
  gas = 0.65,
  cooldown = 0,
  shooting = false,
  damageCd = 0,
  localKills = new Set(),
  localEnemyDamage = new Map(),
  lastWave = -1;
let pad = neutralPad(),
  previousPad = neutralPad();
let myVehicle = null,
  crewSeat = null,
  selectedVehicle = null,
  selectedSeat = 'pilot',
  flakRange = FLAK.range,
  selectedShell = 'he',
  heavyPending = false,
  weaponBarrel = 0;
const fleetModels = new Map(),
  effectSeen = new Set();
let turretIndex = -1,
  landed = false,
  vehicleBusy = false,
  damageSeen = 0,
  shotSequence = 0;
const turretAim = { yaw: 0, pitch: 0.2 };
let selectedEquipment = null;
let optimisticExitPending = false;
let onFoot = true,
  baseArena = null,
  baseRevision = -1,
  baseAudioSeq = 0,
  boardingOpen = false,
  boardingBusy = false,
  boardingSelectionBusy = false,
  paperContext = '';
const basePeople = new Map(),
  parkedPlanes = new Map();
function baseIntent() {
  const i = soulIntent();
  return { x: i.x, z: -i.z, guard: false };
}
function selfBase() {
  return baseArena?.bodies.find((b) => b.entity === id && !b.gone);
}
function assignedBay() {
  return aircraftBay(snap?.pilots.find((p) => p.id === id)?.bay || 0);
}
function nearestVehicle() {
  const body = selfBase();
  if (!body || body.parachute) return null;
  const w = baseWorld(body);
  return (
    (snap?.vehicles || [])
      .filter((v) => v.state.landed)
      .flatMap((v) =>
        VEHICLES[v.type].seats
          .filter((seat) => !v.seats.some((s) => s.seat === seat) && vehicleAccess(w, v, seat))
          .map((entrySeat) => ({ ...v, entrySeat })),
      )
      .sort(
        (a, b) =>
          Math.hypot(w.x - a.state.p[0], w.z - a.state.p[2]) -
          Math.hypot(w.x - b.state.p[0], w.z - b.state.p[2]),
      )[0] || null
  );
}
async function chooseVehicle(vehicle, seat = vehicle?.entrySeat || 'pilot') {
  if (!vehicle || boardingBusy || boardingSelectionBusy) return;
  selectedEquipment = null;
  selectedVehicle = vehicle.id;
  selectedSeat = seat;
  boardingOpen = false;
  boardingSelectionBusy = true;
  const timing = beginBoardingFeedback('vehicle', seat);
  releaseMouse();
  renderPaper();
  try {
    timing.mark('request');
    const response = await api('vehicle-select', {
      id,
      vehicle: vehicle.id,
      seat,
      ground: groundReport(),
    });
    timing.mark('confirmed');
    accept(response);
    const confirmed = snap.pilots.find((p) => p.id === id);
    boardingOpen =
      confirmed?.mode === 'foot' &&
      confirmed.state.boarding?.vehicle === vehicle.id &&
      confirmed.state.boarding?.seat === seat;
    renderPaper();
  } catch (e) {
    boardingOpen = false;
    notify(e.message, 3);
    renderPaper();
  } finally {
    boardingSelectionBusy = false;
    renderPaper();
    finishBoardingFeedback(timing, boardingOpen ? 'ready' : 'failed');
  }
}
function openBoarding() {
  if (!onFoot || respawnAt || myVehicle) return;
  const v = nearestVehicle();
  if (!v) {
    notify('Rejoignez la porte d’un appareil prêt au départ.', 2);
    return;
  }
  const seat = VEHICLES[v.type].seats.find((s) => !v.seats.some((t) => t.seat === s));
  if (!seat) {
    notify('Cet équipage est complet.', 2);
    return;
  }
  chooseVehicle(v, v.entrySeat || seat);
}
let soulArena = null,
  soulArenaRevision = -1,
  soulEventSeen = 0,
  soulShake = 0;
const soulEffects = [];
// Shared ground camera: yaw is world-space in both scenes; baseIntent maps back to deck coordinates.
const groundView = { yaw: 0, pitch: 0.24, distance: 5.8, scene: '', pointer: null, x: 0, y: 0 };
function groundActive() {
  return (
    joined &&
    ((onFoot && !myVehicle) || !!respawnAt) &&
    $('papers').classList.contains('hidden') &&
    $('help').classList.contains('hidden') &&
    $('bedPanel').classList.contains('hidden') &&
    $('purchasePanel').classList.contains('hidden') &&
    $('bank').classList.contains('hidden') &&
    $('shop').classList.contains('hidden') &&
    controlFocus.active
  );
}
function soulIntent() {
  if (!groundActive()) return { x: 0, z: 0, guard: false };
  let x =
      Number(!!(keys.ArrowRight || keys.KeyD)) -
      Number(!!(keys.ArrowLeft || keys.KeyA || keys.KeyQ)) -
      pad.roll,
    z =
      Number(!!(keys.ArrowDown || keys.KeyS)) -
      Number(!!(keys.ArrowUp || keys.KeyW || keys.KeyZ)) +
      pad.pitch;
  const n = Math.max(1, Math.hypot(x, z)),
    c = Math.cos(groundView.yaw),
    sn = Math.sin(groundView.yaw);
  return {
    x: (x * c + z * sn) / n,
    z: (z * c - x * sn) / n,
    guard: false,
  };
}
canvas.style.touchAction = 'none';
canvas.addEventListener('contextmenu', (e) => {
  if (joined && (onFoot || respawnAt)) e.preventDefault();
});
canvas.addEventListener('pointerdown', (e) => {
  if (!groundActive() || e.pointerType === 'mouse') return;
  groundView.pointer = e.pointerId;
  groundView.x = e.clientX;
  groundView.y = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
});
canvas.addEventListener('pointermove', (e) => {
  if (groundView.pointer !== e.pointerId || !groundActive()) return;
  if ((turretIndex >= 0 || (myVehicle && crewSeat !== 'pilot')) && !respawnAt) {
    if (myVehicle?.type === 'tank' && crewSeat === 'cannon' && keys.KeyC) {
      lookDelta(freeLook, e.clientX - groundView.x, e.clientY - groundView.y);
      groundView.x = e.clientX;
      groundView.y = e.clientY;
      return;
    }
    turretAim.yaw -= (e.clientX - groundView.x) * 0.003 * currentFactors().aim;
    turretAim.pitch = T.MathUtils.clamp(
      turretAim.pitch - (e.clientY - groundView.y) * 0.003 * currentFactors().aim,
      myVehicle?.type === 'tank' ? -0.65 : -0.1,
      1.35,
    );
    groundView.x = e.clientX;
    groundView.y = e.clientY;
    return;
  }
  groundView.yaw -= (e.clientX - groundView.x) * 0.005;
  groundView.pitch = T.MathUtils.clamp(
    groundView.pitch + (e.clientY - groundView.y) * 0.004,
    -0.12,
    0.85,
  );
  groundView.x = e.clientX;
  groundView.y = e.clientY;
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
  canvas.addEventListener(type, (e) => {
    if (groundView.pointer === e.pointerId) groundView.pointer = null;
  });
canvas.addEventListener(
  'wheel',
  (e) => {
    if (!groundActive()) return;
    e.preventDefault();
    groundView.distance = T.MathUtils.clamp(
      groundView.distance + Math.sign(e.deltaY) * 0.5,
      3.2,
      9,
    );
  },
  { passive: false },
);
function groundCamera(cam, position, dt, purg = false) {
  const name = purg ? 'purgatory' : 'base',
    changed = groundView.scene !== name;
  if (changed) {
    groundView.scene = name;
    groundView.yaw = purg ? 0 : Math.PI;
    groundView.pitch = 0.24;
  }
  if (groundActive()) groundView.yaw -= pad.yaw * dt * 1.8;
  const viewScale = purg ? 1 : MAP.ratio;
  const {
    target,
    offset,
    eye: desired,
  } = shoulderView(T, position, groundView.yaw, groundView.pitch, groundView.distance, viewScale);
  // Pull the camera in before solid office furniture instead of looking through it.
  {
    const ray = new T.Ray(target, offset.clone().normalize());
    let distance = offset.length();
    for (const box of purg ? purgColliders : colliders) {
      const hit = ray.intersectBox(box, new T.Vector3());
      if (hit)
        distance = Math.min(
          distance,
          Math.max(0.08 * viewScale, target.distanceTo(hit) - 0.08 * viewScale),
        );
    }
    desired.copy(target).addScaledVector(offset.normalize(), distance);
  }
  if (changed) cam.position.copy(desired);
  else cam.position.lerp(desired, 1 - Math.exp(-14 * dt));
  cam.up.set(0, 1, 0);
  cam.lookAt(target);
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
}

const walkRelay = { epoch: null, seq: 0, events: 0, pending: [] };
function groundReport() {
  const a = respawnAt ? soulArena : onFoot ? baseArena : null;
  if (!a) return null;
  const self = a.bodies.find((b) => b.entity === id && !b.gone);
  if (!self) return null;
  return {
    epoch: a.epoch,
    body: bodyMotion(self),
    npcs: a.host === id ? a.bodies.filter((b) => b.kind === 'enemy').map(bodyMotion) : [],
  };
}
function acceptGround(snapshot, previous, purg = false) {
  const a = mergeOwnedArena(snapshot, previous, id);
  if (purg) {
    if (walkRelay.epoch !== a.epoch) {
      walkRelay.epoch = a.epoch;
      walkRelay.seq = 0;
      walkRelay.events = Math.max(0, ...(snapshot.events || []).map((e) => e.id));
      walkRelay.pending = [];
    }
    const actor = snapshot.bodies.find((b) => b.entity === id);
    walkRelay.pending = walkRelay.pending.filter((e) => e.seq > (actor?.impactSeq || 0));
  }
  return a;
}
function remoteBodies(a, scene) {
  for (const b of a.bodies) {
    if (b.kind !== 'player' || b.entity === id) continue;
    const state = remoteMotion({ id: b.entity, state: null }),
      ground = state?.ground;
    if (ground?.scene === scene && ground.epoch === a.epoch && ground.body?.id === b.id) {
      const m = ground.body;
      for (const k of ['x', 'z', 'vx', 'vz', 'face', 'y', 'vy'])
        if (Number.isFinite(m[k])) b[k] = m[k];
      b.input = m.input || b.input;
      b.attack = m.attack || null;
      b.parachute = !!m.parachute;
      b.grounded = m.grounded !== false;
    }
  }
}
let peerMotion = null,
  signalSince = 0;
const motionTracks = new Map();
function track(peer) {
  if (!motionTracks.has(peer))
    motionTracks.set(peer, new MotionTrack({ teleportDistance: MAP.metres(35) }));
  return motionTracks.get(peer);
}
function localMotion() {
  const a = respawnAt ? soulArena : onFoot ? baseArena : null,
    self = a?.bodies.find((b) => b.entity === id && !b.gone);
  return {
    p: me.position.toArray(),
    q: me.quaternion.toArray(),
    v: vel.toArray(),
    hp: Math.max(0, Math.min(100, hp)),
    wing,
    engine,
    fire: !respawnAt && shooting,
    vehicle: myVehicle?.id || null,
    seat: crewSeat,
    soul: respawnAt ? soulBody : null,
    landed,
    gas,
    omega: omega.toArray(),
    turret: turretIndex,
    turretDirection: weaponDirection().toArray(),
    ground: self
      ? {
          scene: respawnAt ? (isSuper() ? 'super' : 'soul') : 'base',
          epoch: a.epoch,
          body: bodyMotion(self),
        }
      : null,
  };
}
function remoteMotion(p) {
  return motionTracks.get(p.id)?.sample(performance.now()) || p.state;
}
function networkStatus() {
  if (!snap) return;
  if (globalThis.MOUCHERON_UDP) {
    const s = peerMotion?.stats();
    $('net').textContent =
      (s?.udp ? '● UDP' : '● UDP INTERROMPU') +
      ' · ' +
      snap.pilots.length +
      ' PILOTE' +
      (snap.pilots.length > 1 ? 'S' : '');
    $('net').title =
      'Serveur en mémoire · mouvements à 20 Hz · commandes fiables sur UDP' +
      (s?.error ? ' · ' + s.error : '');
    $('networkDetails').textContent = $('net').textContent + ' — ' + $('net').title;
    return;
  }
  const s = peerMotion?.stats(),
    peers = snap.pilots.length - 1,
    active = s?.active || 0;
  $('net').textContent =
    (Date.now() - lastSnap > 2500
      ? '● CONNEXION INSTABLE'
      : peers === 0
        ? '● EN LIGNE'
        : active === peers
          ? '● DIRECT'
          : active
            ? '● DIRECT + SECOURS'
            : '● SYNCHRO SERVEUR') +
    ' · ' +
    snap.pilots.length +
    ' PILOTE' +
    (snap.pilots.length > 1 ? 'S' : '');
  $('net').title =
    active +
    ' liaison(s) directe(s) à 20 Hz · ' +
    Math.max(0, peers - active) +
    ' en repli HTTP · affichage interpolé' +
    (!s?.enabled ? ' · WebRTC indisponible dans ce navigateur' : '') +
    (s?.udp ? ' · UDP confirmé sur ' + s.udp + ' liaison(s)' : '') +
    (s?.error ? ' · RTC : ' + s.error : '');
  $('networkDetails').textContent = $('net').textContent + ' — ' + $('net').title;
}
const vel = new T.Vector3(0, 0, 0),
  omega = new T.Vector3(),
  keys = {},
  spawnPos = new T.Vector3(-48, 16, 62),
  upWorld = new T.Vector3(0, 1, 0);
let controlMode = matchMedia('(pointer:coarse)').matches ? 'manual' : 'mouse',
  mouseFire = false,
  uiWeaponFire = false,
  mousePrevious = null,
  padManualUntil = 0;
const mouseDirection = new T.Vector3(0, 0, -1),
  mouseCameraQ = new T.Quaternion();
function resetMouseAim() {
  mouseDirection.set(0, 0, -1).applyQuaternion(me.quaternion);
  mouseCameraQ.copy(me.quaternion);
  mousePrevious = null;
}
function clearControls() {
  freeLook.yaw = 0;
  freeLook.pitch = 0;
  holdZoom.reset();
  uiWeaponFire = false;
  mouseFire = false;
  shooting = false;
  mousePrevious = null;
  for (const key of Object.keys(keys)) keys[key] = false;
  keyBindings.clear();
}
const keyBindings = new Map(),
  freeLook = { yaw: 0, pitch: 0 };
canvas.tabIndex = 0;
const controlFocus = new ControlFocus({
  canvas,
  document,
  touch: matchMedia('(pointer:coarse)').matches,
  allowed: () => canCapture(),
  onChange: () => {
    clearControls();
    updateControlHUD();
  },
  onError: () =>
    notify(
      'Cliquez dans le décor pour capturer la souris. Si votre navigateur refuse, vérifiez ses autorisations.',
      4,
    ),
});
function releaseMouse() {
  controlFocus.release();
}
function canCapture() {
  return (
    joined &&
    $('papers').classList.contains('hidden') &&
    $('help').classList.contains('hidden') &&
    $('shop').classList.contains('hidden') &&
    $('bank').classList.contains('hidden') &&
    $('bedPanel').classList.contains('hidden') &&
    $('purchasePanel').classList.contains('hidden')
  );
}
function toggleControl() {
  controlMode = controlMode === 'mouse' ? 'manual' : 'mouse';
  resetMouseAim();
  updateControlHUD();
}
function updateControlHUD() {
  const mouse = controlMode === 'mouse';
  $('controlMode').textContent = mouse ? 'Pilotage : souris' : 'Pilotage : manuel';
  $('controlMode').setAttribute('aria-pressed', String(mouse));
  $('captureMouse').classList.remove('hidden');
  $('captureMouse').textContent =
    document.pointerLockElement === canvas ? 'Libérer la souris · Échap' : 'Capturer la souris';
  $('flightKeys').innerHTML = mouse
    ? 'Souris : direction · Clic : tir · Espace : bombes · C maintenu : regarder<br>ZQSD / flèches : tangage et roulis · A/E : gouverne · Maj/Ctrl : gaz · Échap : curseur'
    : 'ZQSD / flèches : tangage et roulis · A/E : gouverne<br>Maj/Ctrl : gaz · C maintenu : regarder · Clic : tir · Espace : bombes · Échap : curseur';
}
async function captureMouse() {
  if (canCapture()) await controlFocus.capture();
}
$('controlMode').onclick = toggleControl;
$('captureMouse').onclick = () => (controlFocus.active ? releaseMouse() : captureMouse());
addEventListener('pointermove', (event) => {
  if (
    !canCapture() ||
    !controlFocus.active ||
    document.pointerLockElement !== canvas ||
    event.pointerType !== 'mouse'
  )
    return;
  const dx = event.movementX,
    dy = event.movementY;
  if (myVehicle?.type === 'tank' && crewSeat === 'cannon' && keys.KeyC) {
    lookDelta(freeLook, dx, dy);
    return;
  }
  if ((turretIndex >= 0 || (myVehicle && crewSeat !== 'pilot')) && !respawnAt) {
    turretAim.yaw -= dx * 0.003 * currentFactors().aim;
    turretAim.pitch = T.MathUtils.clamp(
      turretAim.pitch - dy * 0.003 * currentFactors().aim,
      myVehicle?.type === 'tank' ? -0.65 : -0.1,
      1.35,
    );
    return;
  }
  if (onFoot || respawnAt) {
    groundView.yaw -= dx * 0.005;
    groundView.pitch = T.MathUtils.clamp(groundView.pitch + dy * 0.004, -0.12, 0.85);
    return;
  }
  if (keys.KeyC) {
    lookDelta(freeLook, dx, dy);
    return;
  }
  if (controlMode === 'mouse') {
    rotateMouseAim(T, mouseDirection, camera.quaternion, dx, dy);
    padManualUntil = 0;
  }
});
canvas.addEventListener('pointerleave', () => {
  mousePrevious = null;
});
canvas.addEventListener('pointerdown', (event) => {
  if (event.button === 2 && canCapture() && !respawnAt && (myVehicle || turretIndex >= 0)) {
    event.preventDefault();
    if (!controlFocus.active) captureMouse();
    holdZoom.press(zoomScope());
    return;
  }
  const action = flightClickAction(event, { active: canCapture(), locked: controlFocus.active });
  if (action === 'capture') captureMouse();
  else if (action === 'fire' && (respawnAt || (onFoot && !myVehicle && turretIndex < 0))) pistol();
  else if (
    action === 'fire' &&
    (!onFoot || turretIndex >= 0 || !!myVehicle) &&
    !respawnAt &&
    (controlMode === 'mouse' || turretIndex >= 0 || (myVehicle && crewSeat !== 'pilot'))
  )
    mouseFire = true;
});
addEventListener('pointerup', (e) => {
  if (e.button === 0) mouseFire = false;
  if (e.button === 2) holdZoom.reset();
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener(
  'wheel',
  (e) => {
    if (turretIndex >= 0 && controlFocus.active) {
      e.preventDefault();
      flakRange = fuseRange(flakRange - Math.sign(e.deltaY) * FLAK.step);
      return;
    }
    if (!joined || respawnAt || onFoot || !controlFocus.active) return;
    e.preventDefault();
    gas = T.MathUtils.clamp(gas - Math.sign(e.deltaY) * 0.05 * currentFactors().controls, 0, 1);
  },
  { passive: false },
);
addEventListener('blur', releaseMouse);
function updateAimHUD() {
  const enabled =
    joined &&
    !respawnAt &&
    !onFoot &&
    turretIndex < 0 &&
    controlMode === 'mouse' &&
    controlFocus.active &&
    performance.now() > padManualUntil;
  const aim = $('mouseAim'),
    gun = $('crosshair');
  aim.classList.toggle('hidden', !enabled);
  $('mouseHint').classList.toggle('hidden', !enabled);
  canvas.classList.toggle('mouseFlight', document.pointerLockElement === canvas);
  if (!enabled) {
    gun.style.left = '50%';
    gun.style.top = '50%';
    return;
  }
  function place(el, direction) {
    const point = me.position.clone().addScaledVector(direction, 100);
    const front = point.clone().applyMatrix4(camera.matrixWorldInverse).z < 0;
    point.project(camera);
    el.classList.toggle('offscreen', !front || Math.abs(point.x) > 1 || Math.abs(point.y) > 1);
    el.style.left =
      T.MathUtils.clamp((point.x * 0.5 + 0.5) * innerWidth, 18, innerWidth - 18) + 'px';
    el.style.top =
      T.MathUtils.clamp((-0.5 * point.y + 0.5) * innerHeight, 80, innerHeight - 18) + 'px';
  }
  camera.updateMatrixWorld();
  place(aim, mouseDirection);
  place(gun, new T.Vector3(0, 0, -1).applyQuaternion(me.quaternion));
}
updateControlHUD();
const params = new URLSearchParams(location.search);
if (params.has('room'))
  $('code').value = params
    .get('room')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 10);
$('name').value = localStorage.getItem('moucheron-name') || '';
async function api(path, body) {
  const sent = Date.now();
  if (globalThis.MOUCHERON_UDP) {
    if (path === 'join') {
      peerMotion?.stop();
      peerMotion = new UdpClient({
        onMotion: (peer, state, time, seq) => track(peer).push(state, time, seq, 'rtc'),
        onClose: (error) => {
          $('net').textContent = '● UDP INTERROMPU';
          $('net').title = error.message;
        },
      });
      await peerMotion.connect();
    }
    const v = await peerMotion.request(
      path,
      path === 'sync'
        ? { ...body, incarnation: peerMotion.incarnation, occupation: peerMotion.occupation }
        : body,
    );
    if (v.now) v.receivedAt = performance.now();
    if (v.snapshot?.now) v.snapshot.receivedAt = performance.now();
    const stamp = v.now || v.snapshot?.now;
    if (stamp) {
      const estimate = stamp - (sent + Date.now()) / 2;
      clockOffset = lastSnap ? clockOffset * 0.85 + estimate * 0.15 : estimate;
    }
    return v;
  }
  const r = await fetch('/api/' + path, {
    cache: 'no-store',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(path === 'join' ? 20000 : 10000),
    body: JSON.stringify(body),
  });
  const v = await r.json();
  if (v.now) v.receivedAt = performance.now();
  if (v.snapshot?.now) v.snapshot.receivedAt = performance.now();
  if (v.now) {
    const estimate = v.now - (sent + Date.now()) / 2;
    clockOffset = lastSnap ? clockOffset * 0.85 + estimate * 0.15 : estimate;
  }
  if (!r.ok) {
    const error = Error(v.error || 'Connexion interrompue');
    error.status = r.status;
    throw error;
  }
  return v;
}
function accept(s, force = false) {
  if (optimisticExitPending && !force) return;
  if (s.signals?.length) {
    signalSince = Math.max(signalSince, ...s.signals.map((m) => m.id));
    peerMotion?.receive(s.signals);
  }
  if (snap && s.now < snap.now) return;
  if (globalThis.MOUCHERON_UDP) peerMotion?.observe(s, id);
  const previous = snap;
  if (previous?.mission_started && !s.mission_started) {
    entryNoticeWave = -1;
    paperArchive.length = 0;
    renderArchive();
    try {
      sessionStorage.removeItem('moucheron-dossier:' + room);
    } catch {}
  }
  const wasDead = !!respawnAt;
  const self = s.pilots.find((p) => p.id === id);
  const previousSelf = previous?.pilots.find((p) => p.id === id);
  const worldChanged = previousSelf?.incarnation !== self?.incarnation;
  if (
    worldChanged ||
    previous?.wave !== s.wave ||
    previous?.mission_started !== s.mission_started ||
    previousSelf?.life !== self?.life ||
    previousSelf?.vehicle_id !== self?.vehicle_id ||
    previousSelf?.seat !== self?.seat
  )
    aircraftFire.invalidate();
  if (worldChanged) {
    baseArena = null;
    baseRevision = -1;
    if (self?.state.spawnMessage) notify(self.state.spawnMessage, 5);
    groundView.scene = '';
    soulArena = null;
    soulBody = null;
    soulArenaRevision = -1;
    paperContext = '';
    paperSuppressed = false;
  }
  if (self?.state.realm === 'super' && self.life === 'dead') {
    s.arena = s.superArena;
    s.souls = s.superSouls;
  }
  if (self && (worldChanged || self.mode === 'foot')) hp = self.health;
  if (self?.life === 'dead') {
    respawnAt = 1;
    hp = self.health ?? 100;
    me.visible = false;
    deathPending = false;
    myVehicle = null;
    crewSeat = null;
    turretIndex = -1;
    onFoot = true;
  } else if (wasDead && !deathPending) {
    spawnPos.fromArray(self?.state.p || spawnPos.toArray());
    respawn();
  }
  rewardQueue.observe(s.rewardCount, !!previous && previous.base?.epoch !== s.base?.epoch);
  snap = s;
  bedUI.observe(self);
  purchaseUI.observe(self);
  renderCrew();
  reconcileEquipment([...(s.equipment || []), s.initialStation].filter(Boolean));
  renderShop();
  bankUI.render();
  if (s.base && s.base.revision > baseRevision) {
    if (baseArena?.epoch !== s.base.epoch) baseAudioSeq = 0;
    baseArena = acceptGround(s.base, baseArena);
    baseRevision = s.base.revision;
  }
  if (self?.life === 'alive') {
    const previousVehicle = myVehicle?.id,
      previousSeat = crewSeat,
      foot = self.mode !== 'flight',
      oldTurret = turretIndex;
    myVehicle = s.vehicles?.find((v) => v.id === self.vehicle_id) || null;
    crewSeat = self.seat || null;
    turretIndex = self.mode === 'turret' ? self.state.turret : -1;
    if (myVehicle) {
      if (previousVehicle !== myVehicle.id || previousSeat !== crewSeat) {
        me.visible = false;
        me = vehicleModel(myVehicle);
        me.position.fromArray(myVehicle.state.p);
        me.quaternion.fromArray(myVehicle.state.q);
        vel.fromArray(myVehicle.state.v);
        omega.set(0, 0, 0);
        hp = myVehicle.state.hp;
        wing = myVehicle.state.wing;
        engine = myVehicle.state.engine;
        landed = !!myVehicle.state.landed;
        gas = myVehicle.state.gas ?? (landed ? 0 : 0.65);
        boardingOpen = false;
        groundView.scene = '';
        turretAim.yaw = crewSeat === 'tail' ? Math.PI : 0;
        turretAim.pitch = 0.15;
        resetMouseAim();
        sound.play('board', me.position, { ref: 10 });
        notify(VEHICLES[myVehicle.type].name + ' · ' + SEAT_NAMES[crewSeat], 3);
      }
      hp = Math.min(hp, myVehicle.state.hp);
      if (hp <= 0 && crewSeat === 'pilot') crash();
    }
    if (foot && !onFoot) {
      boardingOpen = false;
      groundView.scene = '';
      landed = false;
    }
    if (turretIndex >= 0 && oldTurret !== turretIndex) {
      boardingOpen = false;
      sound.play('board', camera.position, { ref: 8 });
      turretAim.yaw = 0;
      turretAim.pitch = 0.2;
      notify('DCA · Molette / [ ] : fusée · Clic : obus · F : sortir', 4);
    }
    if (previousVehicle && !myVehicle) {
      hp = self.state.hp ?? 100;
      sound.play('exit', camera.position, { ref: 8 });
    }
    onFoot = foot;
    if (self.state.boarding) {
      selectedVehicle = self.state.boarding.vehicle;
      selectedSeat = self.state.boarding.seat;
    }
  }
  for (const e of s.effects || []) {
    if (effectSeen.has(e.id) || effectSeen.has(e.shot)) continue;
    effectSeen.add(e.id);
    if (e.kind === 'crash')
      crashEffects.add(
        e,
        vehicleModel({ id: e.vehicle, type: e.type, supplies: { sequence: 0 } }),
        Date.now() + clockOffset,
        colliders,
      );
    if (e.kind === 'clean' && !respawnAt) addCleanStars(e);
    if (
      e.kind === 'pistol-trace' &&
      e.shooter !== id &&
      Date.now() + clockOffset - e.at < 250 &&
      e.realm === (respawnAt ? (isSuper() ? 'super' : 'purgatory') : 'office')
    ) {
      const targetScene = respawnAt ? purgScene : scene;
      const line = makeTracer(
        T,
        targetScene,
        new T.Vector3().fromArray(e.p),
        new T.Vector3().fromArray(e.direction),
        '#ffe48d',
      );
      if (respawnAt) line.scale.setScalar(1 / MAP.ratio);
      line.userData.until = performance.now() + 90;
      pistolTrails.push({ line, targetScene });
    }
    if (e.kind === 'piercing') hitEffects.burst(new T.Vector3().fromArray(e.p), camera);
    if (e.kind === 'blast') {
      combatEffects.blast(new T.Vector3().fromArray(e.p));
      sound.play('crash', { x: e.p[0], y: e.p[1], z: e.p[2] }, { ref: 20 });
    }
  }
  if (effectSeen.size > 512) effectSeen.delete(effectSeen.values().next().value);
  for (const event of s.damage || []) {
    if (event.id <= damageSeen) continue;
    damageSeen = event.id;
    if (respawnAt) continue;
    sound.play('impact', camera.position, { ref: 12 });
    notify('Tir allié ! −' + event.amount + ' PV', 1);
    if (hp <= 0) crash();
  }
  if (!respawnAt && previous && s.wave === previous.wave)
    for (const killed of s.kills)
      if (!previous.kills.includes(killed)) {
        const pos = insects.get(killed)?.position;
        if (pos) {
          fallEnemy(killed);
          sound.play('impact', pos, { key: 'kill:' + s.wave + ':' + killed, cooldown: 2, ref: 9 });
        }
      }
  if (!respawnAt && previous && s.wave > previous.wave)
    sound.play(
      'alarm',
      {
        x: OFFICE_LAYOUT.base.originX,
        y: OFFICE_LAYOUT.base.deckY + MAP.metres(5),
        z: OFFICE_LAYOUT.base.originZ,
      },
      { ref: 500 },
    );
  if (!respawnAt && previous && previous.phase === 'combat' && s.phase === 'prep')
    sound.play('clear', camera.position, { ref: 8 });
  if (!respawnAt && previous && previous.phase !== 'lost' && s.phase === 'lost')
    sound.play('defeat', camera.position, { ref: 10 });
  if (s.arena && s.arena.revision > soulArenaRevision) {
    if (soulArena?.epoch !== s.arena.epoch) soulEventSeen = 0;
    soulArena = acceptGround(s.arena, soulArena, true);
    soulArenaRevision = s.arena.revision;
  }
  peerMotion?.reconcile(s.pilots.map((p) => p.id));
  const active = new Set(s.pilots.map((p) => p.id));
  for (const key of motionTracks.keys()) if (!active.has(key)) motionTracks.delete(key);
  for (const p of s.pilots)
    if (p.id !== id && !peerMotion?.fresh(p.id))
      track(p.id).push(p.state, performance.now() - Math.max(0, s.now - p.seen), p.seen, 'http');
  renderPurgatory();
  lastSnap = Date.now();
  if (
    s.phase === 'combat' &&
    (!previous || previous.phase !== 'combat') &&
    (s.sentAt || s.now) - s.started > 3000
  )
    notify('Vague en cours · ces ennemis sont déjà en route', 4);
  if (s.wave !== lastWave) {
    hitEffects.clear();
    insectStatus.clear();
    for (const c of fallingEnemies) disposeCorpse(c);
    fallingEnemies.length = 0;
    localKills.clear();
    localEnemyDamage.clear();
    lastWave = s.wave;
  }
  s.kills.forEach((k) => localKills.add(k));
  for (const [enemy, damage] of Object.entries(s.enemyDamage || {}))
    localEnemyDamage.set(Number(enemy), Math.max(localEnemyDamage.get(Number(enemy)) || 0, damage));
  networkStatus();
  $('threat').textContent = 'MENACE ' + s.difficulty;
  $('wave').textContent = String(s.wave).padStart(2, '0');
  $('infest').textContent = s.infestation + s.leaked + ' / 20';
  $('fan').textContent = 'Ventilateur : ' + (s.fan ? 'ON' : 'OFF');
  $('players').replaceChildren(
    ...s.pilots.map((p) => {
      const e = document.createElement('div');
      e.textContent = (p.id === id ? '● Vous · ' : '○ ') + p.name;
      return e;
    }),
  );
  $('phaseTitle').textContent =
    s.phase === 'combat'
      ? 'Interception'
      : s.phase === 'lost'
        ? 'Infestation critique'
        : 'Préparation';
  $('phaseText').textContent =
    s.phase === 'combat'
      ? 'Protégez la poubelle.'
      : s.phase === 'lost'
        ? 'Le bureau est envahi.'
        : 'Prêts ? Lancez la prochaine vague.';
  $('phaseBox').classList.toggle('in-combat', s.phase === 'combat');
  if (previous && (previous.phase !== s.phase || previous.wave !== s.wave))
    notify(
      s.phase === 'combat'
        ? `Vague ${s.wave} · Interception`
        : s.phase === 'lost'
          ? 'Infestation critique'
          : `Vague ${s.wave} terminée · Préparation`,
      3,
    );
  $('start').classList.toggle('hidden', s.phase === 'combat');
  $('start').textContent = s.phase === 'lost' ? 'Nouvelle partie →' : 'Lancer la vague →';
  updateCountdown();
}
$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('join').disabled = true;
  $('error').textContent = 'Connexion au salon…';
  try {
    const code = $('code').value.toUpperCase();
    let resumeKey;
    try {
      resumeKey = sessionStorage.getItem('moucheron-identity:' + code);
    } catch {}
    const r = await api('join', { name: $('name').value, code, resumeKey });
    if (r.resumeKey)
      try {
        sessionStorage.setItem('moucheron-identity:' + code, r.resumeKey);
      } catch {}
    id = r.id;
    if (!globalThis.MOUCHERON_UDP)
      peerMotion = new PeerMotion({
        self: id,
        signal: (to, message) => api('signal', { id, to, message }),
        onMotion: (peer, state, time, seq) => track(peer).push(state, time, seq, 'rtc'),
      });
    room = r.snapshot.code;
    paperArchive.length = 0;
    try {
      paperArchive.push(...JSON.parse(sessionStorage.getItem('moucheron-dossier:' + room) || '[]'));
    } catch {}
    renderArchive();
    spawnPos.fromArray(r.state.p);
    me.position.copy(spawnPos);
    vel.fromArray(r.state.v);
    localStorage.setItem('moucheron-name', $('name').value);
    joined = true;
    onFoot = true;
    resetMouseAim();
    accept(r.snapshot);
    $('lobby').classList.add('hidden');
    $('shade').classList.add('hidden');
    $('foot').classList.add('hidden');
    $('sceneLabel').classList.add('hidden');
    $('build').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('touch').classList.add('playing');
    $('roomCode').textContent = room;
    history.replaceState({}, '', '?room=' + room);
    camera.position.copy(me.position).add(new T.Vector3(0, 4, 12).multiplyScalar(ACTOR_UNIT));
    captureMouse();
  } catch (err) {
    $('error').textContent = err.message;
  } finally {
    $('join').disabled = false;
  }
});
async function action(path, extra = {}) {
  try {
    accept(await api(path, { id, ...extra }));
  } catch (e) {
    notify(e.message, 3);
  }
}
$('start').onclick = () => action(snap?.phase === 'lost' ? 'reset' : 'start');
$('fan').onclick = () => action('fan');
$('share').onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    notify('Lien de partie copié', 2);
  } catch (e) {
    notify('Code de partie : ' + room, 3);
  }
};
$('helpButton').onclick = () => {
  releaseMouse();
  if (bankUI.opened || bedUI.opened || purchaseUI.opened) return;
  $('help').classList.remove('hidden');
};
$('closeHelp').onclick = () => {
  $('help').classList.add('hidden');
  captureMouse();
};
addEventListener('keydown', (event) => {
  if (!joined) return;
  if (event.code === 'Escape') {
    if (purchaseUI.opened) {
      purchaseUI.close();
      return;
    }
    if (bedUI.opened) {
      bedUI.close();
      return;
    }
    if (bankUI.opened) {
      bankUI.close();
      return;
    }
    cancelPlacement();
    $('shop').classList.add('hidden');
    releaseMouse();
    if (!$('papers').classList.contains('hidden')) $('paperClose').click();
    return;
  }
  if (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
    event.target.isContentEditable ||
    event.metaKey ||
    event.altKey
  )
    return;
  const interactionKey = gameKey(event);
  if (interactionKey === 'KeyN' && !event.repeat) {
    event.preventDefault();
    toggleBank();
    return;
  }
  if (bankUI.opened || bedUI.opened || purchaseUI.opened) return;
  const exitAction = equipmentExitAction({
    key: interactionKey,
    repeat: event.repeat,
    vehicle: myVehicle,
    turret: turretIndex,
    dead: !!respawnAt,
    formOpen: !$('papers').classList.contains('hidden'),
  });
  if (exitAction) {
    event.preventDefault();
    vehicleAction(exitAction, { state: localMotion() });
    return;
  }
  if (placingEquipment && ['KeyE', 'Enter'].includes(interactionKey)) {
    event.preventDefault();
    if (!event.repeat && canCapture()) placePurchased();
    return;
  }
  if (interactionKey === 'KeyP' && !respawnAt && !event.repeat) {
    event.preventDefault();
    toggleShop();
    return;
  }
  if (
    interactionKey === 'Space' &&
    !event.repeat &&
    onFoot &&
    !myVehicle &&
    turretIndex < 0 &&
    !respawnAt &&
    $('papers').classList.contains('hidden') &&
    $('bedPanel').classList.contains('hidden') &&
    $('purchasePanel').classList.contains('hidden') &&
    $('bank').classList.contains('hidden') &&
    $('shop').classList.contains('hidden') &&
    toggleParachute(selfBase())
  ) {
    event.preventDefault();
    sound.play('dash', camera.position, { ref: 8 });
    notify(
      selfBase().parachute
        ? 'Parachute ouvert · Espace pour replier'
        : 'Chute libre · Espace pour ouvrir',
      2,
    );
    return;
  }
  if (/^Digit[1-7]$/.test(event.code) && !event.repeat && canCapture() && myVehicle && !respawnAt) {
    const seat = VEHICLES[myVehicle.type].seats[Number(event.code.slice(-1)) - 1];
    if (seat && seat !== crewSeat) {
      event.preventDefault();
      action('seat-request', { seat });
    }
    return;
  }
  if (!controlFocus.active) return;
  const code = interactionKey;
  const contextual = contextKey({ type: myVehicle?.type, turret: turretIndex >= 0 }, code);
  if (contextual) {
    event.preventDefault();
    if (contextual.range) flakRange = fuseRange(flakRange + contextual.range);
    else selectedShell = contextual.shell;
    return;
  }
  keyBindings.set(event.code, code);
  if (
    [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Space',
      'KeyZ',
      'KeyW',
      'KeyS',
      'KeyQ',
      'KeyD',
      'KeyA',
      'KeyE',
      'KeyC',
      'ShiftLeft',
      'ShiftRight',
      'ControlLeft',
      'ControlRight',
    ].includes(code)
  )
    event.preventDefault();
  keys[code] = true;

  if (respawnAt && code === 'KeyE' && !event.repeat) {
    paperSuppressed = false;
    renderPaper();
  }
  if (
    equipmentEnterAllowed({ onFoot, vehicle: myVehicle, turret: turretIndex, dead: !!respawnAt }) &&
    code === 'KeyE' &&
    !event.repeat
  )
    interactVehicle();
  if (turretIndex >= 0 && ['BracketLeft', 'BracketRight'].includes(code)) {
    flakRange = fuseRange(flakRange + (code === 'BracketRight' ? FLAK.step : -FLAK.step));
  }
  if (code === 'KeyM' && !event.repeat && !respawnAt) toggleControl();
  if (code === 'KeyR' && !event.repeat) crash();
  if (code === 'Space' && !event.repeat) contextHUD.reveal();
  if (code === 'KeyH' && !event.repeat) {
    releaseMouse();
    $('help').classList.toggle('hidden');
  }
});
addEventListener('keyup', (event) => {
  keys[keyBindings.get(event.code) || gameKey(event)] = false;
  keyBindings.delete(event.code);
});
addEventListener('blur', clearControls);
for (const b of document.querySelectorAll('[data-key]')) {
  b.onpointerdown = (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    if (!canCapture()) return;
    if (controlFocus.touch && !controlFocus.active) controlFocus.capture();
    keys[b.dataset.key] = true;
  };
  b.onpointerup = b.onpointercancel = () => (keys[b.dataset.key] = false);
}
let nextSync = 0;
setInterval(async () => {
  if (!joined || pending || vehicleBusy || performance.now() < nextSync) return;
  if (globalThis.MOUCHERON_UDP && peerMotion?.closed) return;
  pending = true;
  nextSync = performance.now() + (respawnAt || onFoot ? 100 : 250);
  try {
    accept(
      await api('sync', {
        id,
        mode: myVehicle ? (crewSeat === 'pilot' ? 'flight' : 'crew') : onFoot ? 'foot' : 'flight',
        state: localMotion(),
        signalSince,
        damageSince: damageSeen,
        vacant: [...vacantAircraft].map(([id, state]) => ({ id, state })),
        soulInput: respawnAt ? soulIntent() : null,
        baseInput: onFoot && !respawnAt ? baseIntent() : null,
        ground: groundReport(),
      }),
    );
  } catch (e) {
    $('net').textContent = globalThis.MOUCHERON_UDP
      ? '● UDP INTERROMPU — RECHARGEZ'
      : '● RECONNEXION…';
  } finally {
    pending = false;
  }
}, 50);
setInterval(() => {
  if (joined) peerMotion?.send(localMotion());
}, 50);
setInterval(() => {
  if (joined) peerMotion?.measure().catch(() => {});
}, 2000);
addEventListener('pagehide', () => peerMotion?.stop());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden)
    for (const a of [baseArena, soulArena])
      if (a) a.time = Math.max(a.time, Date.now() + clockOffset);
});
let msgUntil = 0;
function notify(m, t = 2) {
  $('notice').textContent = m;
  msgUntil = performance.now() + t * 1000;
}
function crash() {
  if (deathPending) return;
  respawnAt = 1;
  deathPending = true;
  aircraftFire.invalidate();
  hp = 0;
  shooting = false;
  me.visible = false;
  submitDeath();
}
async function submitDeath() {
  if (!deathPending) return;
  try {
    accept(
      await api('death', {
        id,
        incarnation: snap?.pilots.find((p) => p.id === id)?.incarnation,
        state: localMotion(),
      }),
    );
  } catch (e) {
    notify('Connexion au purgatoire…', 2);
  }
}
setInterval(() => {
  if (deathPending) submitDeath();
}, 1500);
function respawn() {
  me.position.copy(spawnPos);
  me.quaternion.identity();
  vel.set(0, 0, -MAP.metres(25));
  omega.set(0, 0, 0);
  hp = 100;
  wing = 1;
  engine = 1;
  gas = 0.65;
  respawnAt = 0;
  resetMouseAim();
  onFoot = true;
  boardingOpen = false;
  me.visible = false;
  me.userData.wing.scale.x = 1;
  notify('De retour à pied à la base', 2);
}
function renderPurgatory() {
  const dead = !!respawnAt;
  $('personalFire').classList.toggle(
    'hidden',
    !joined || (!dead && (!onFoot || myVehicle || turretIndex >= 0)),
  );
  if (dead || onFoot) $('crosshair').classList.remove('hidden');
  $('purgatory').classList.toggle('hidden', !dead);
  $('touch').classList.toggle('inPurgatory', dead);
  document.querySelector('.bottomkeys').classList.toggle('hidden', dead || onFoot);
  $('baseActions').classList.toggle('hidden', !onFoot || dead || turretIndex >= 0 || !!myVehicle);
  $('touch').classList.toggle('inPurgatory', dead || onFoot);
  for (const x of ['crosshair', 'flight', 'radar'])
    $(x).classList.toggle(
      'hidden',
      x === 'crosshair' ? false : dead || (onFoot && turretIndex < 0 && !myVehicle),
    );
  if (turretIndex >= 0 || (myVehicle && crewSeat !== 'pilot')) $('flight').classList.add('hidden');
  for (const x of ['phaseBox', 'actions', 'players'])
    $(x).classList.toggle('hidden', dead || (onFoot && x === 'actions'));
  if (!dead) {
    soulStatus.clear();
    soulBody = null;
    renderPaper();
    return;
  }
  const q = snap?.souls || [],
    i = q.findIndex((x) => x.entity === id && x.kind === 'player'),
    self = q[i];
  if (self && !soulBody) {
    const p = self.body || soulSlot(i);
    soulBody = { x: p.x, z: p.z, vx: p.vx || 0, vz: p.vz || 0, face: p.face ?? Math.PI };
  }
  const body = soulArena?.bodies.find((b) => b.entity === id && b.kind === 'player'),
    stunned = body?.koUntil > Date.now() + clockOffset;
  const occupant = soulArena && deskOccupant(soulArena, Date.now() + clockOffset),
    owns = body && occupant?.id === body.id;
  $('soulPosition').textContent =
    i < 0
      ? 'Matérialisation…'
      : owns
        ? 'Guichet à vous · Signez !'
        : occupant
          ? `Guichet occupé : ${occupant.name}`
          : 'Entrez dans le cercle doré devant Saint Pierre';
  $('saintName').textContent = isSuper() ? '☁ Super Saint-Pierre' : '☁ Saint Pierre';
  $('soulTitle').textContent = isSuper()
    ? 'Bienvenue au super purgatoire.'
    : 'Bienvenue au purgatoire.';
  $('soulStatus').textContent = `Pistolet : clic / appui Tir · ${hp} PV · E : dossier`;
  for (const button of ['punch', 'heavyPunch', 'soulDash']) $(button).classList.add('hidden');
  $('punch').disabled = soulBusy || stunned || !body || body.nextAttack > Date.now() + clockOffset;
  $('heavyPunch').disabled = $('punch').disabled;
  $('soulDash').disabled = soulBusy || stunned || !body || body.nextDash > Date.now() + clockOffset;
  $('soulCount').textContent = q.length + ' âmes · file physique';
  $('soulPaperButton').classList.toggle('hidden', !owns || stunned);
  renderPaper();
}
function isSuper() {
  return snap?.pilots.find((p) => p.id === id)?.state.realm === 'super';
}
$('punch').onclick = null;
$('heavyPunch').onclick = null;
$('soulDash').onclick = null;
let soulBody = null,
  signatureForm = -1,
  signaturePoints = [],
  signaturePointer = null;
const sig = $('signature'),
  ink = sig.getContext('2d');
function inkReady() {
  let length = 0;
  for (let i = 1; i < signaturePoints.length; i++)
    if (signaturePoints[i][2])
      length += Math.hypot(
        signaturePoints[i][0] - signaturePoints[i - 1][0],
        signaturePoints[i][1] - signaturePoints[i - 1][1],
      );
  return signaturePoints.length >= 2 && length > 0.12;
}
function clearSignature() {
  const pointer = signaturePointer;
  signaturePointer = null;
  if (pointer !== null && sig.hasPointerCapture?.(pointer)) sig.releasePointerCapture(pointer);
  signaturePoints = [];
  if ($('inkState')) $('inkState').textContent = 'Signez librement dans le cadre';
  ink.clearRect(0, 0, sig.width, sig.height);
  $('signSubmit').disabled = true;
}
function signaturePoint(e) {
  const r = sig.getBoundingClientRect();
  return [
    T.MathUtils.clamp((e.clientX - r.left) / r.width, 0, 1),
    T.MathUtils.clamp((e.clientY - r.top) / r.height, 0, 1),
  ];
}
function redrawInk() {
  ink.clearRect(0, 0, sig.width, sig.height);
  ink.strokeStyle = '#183832';
  ink.lineWidth = 2.8;
  ink.lineCap = 'round';
  ink.lineJoin = 'round';
  ink.beginPath();
  for (let i = 0; i < signaturePoints.length; i++) {
    const p = signaturePoints[i],
      x = p[0] * sig.width,
      y = p[1] * sig.height;
    if (!p[2]) ink.moveTo(x, y);
    else {
      const previous = signaturePoints[i - 1];
      ink.quadraticCurveTo(
        previous[0] * sig.width,
        previous[1] * sig.height,
        (previous[0] + p[0]) * 0.5 * sig.width,
        (previous[1] + p[1]) * 0.5 * sig.height,
      );
    }
  }
  ink.stroke();
  $('signSubmit').disabled = !inkReady() || soulBusy || boardingBusy;
  $('inkState').textContent = inkReady()
    ? 'Relâchez pour signer'
    : 'Signez librement dans le cadre';
}
sig.onpointerdown = (e) => {
  e.preventDefault();
  if (boardingBusy || soulBusy || boardingSelectionBusy || signaturePointer !== null) return;
  signaturePointer = e.pointerId;
  try {
    sig.setPointerCapture(e.pointerId);
  } catch {}
  const p = signaturePoint(e);
  signaturePoints.push([...p, 0]);
};
sig.onpointermove = (e) => {
  if (signaturePointer !== e.pointerId) return;
  const p = signaturePoint(e),
    previous = signaturePoints.at(-1);
  if (previous && Math.hypot(p[0] - previous[0], p[1] - previous[1]) < 0.003) return;
  signaturePoints.push([...p, 1]);
  if (signaturePoints.length > 180)
    signaturePoints = signaturePoints.filter(
      (p, i, a) => !p[2] || i % 2 === 0 || i === a.length - 1,
    );
  sound.play('paper', paperSource(), { key: 'pen', cooldown: 0.09, level: 0.45, ref: 6 });
  redrawInk();
};
sig.onpointerup = (e) => {
  if (signaturePointer !== e.pointerId) return;
  const p = signaturePoint(e),
    previous = signaturePoints.at(-1);
  if (previous && Math.hypot(p[0] - previous[0], p[1] - previous[1]) >= 0.003) {
    signaturePoints.push([...p, 1]);
    redrawInk();
  }
  signaturePointer = null;
  if (inkReady()) submitPaper();
};
sig.onpointercancel = () => clearSignature();
sig.onlostpointercapture = () => {
  signaturePointer = null;
};
$('signClear').onclick = clearSignature;
$('paperClose').onclick = (event) => {
  if (boardingBusy) return;
  boardingOpen = false;
  clearSignature();
  paperContext = '';
  if (respawnAt) paperSuppressed = true;
  renderPaper();
  if (event?.isTrusted) captureMouse();
};
$('signSubmit').onclick = submitPaper;
let paperSuppressed = false;
let paperSubmission = null;
const paperArchive = [];
function renderArchive() {
  const root = $('signedPapers');
  root.setAttribute(
    'aria-label',
    paperArchive.length + ' documents signés depuis le début de la partie',
  );
  $('archiveCount').textContent =
    paperArchive.length + ' document' + (paperArchive.length > 1 ? 's' : '') + ' au dossier';
  root.replaceChildren();
  for (const [i, p] of paperArchive.entries()) {
    const card = document.createElement('article');
    card.style.setProperty('--tilt', ((i * 7) % 9) - 4 + 'deg');
    card.style.setProperty('--sheet-index', i);
    card.title = `Document ${i + 1} · ${p.title}`;
    const title = document.createElement('span');
    title.textContent = p.title;
    const img = document.createElement('img');
    img.src = p.ink;
    img.alt = 'Signature apposée';
    const stamp = document.createElement('b');
    stamp.textContent = 'VALIDÉ';
    card.append(title, img, stamp);
    root.append(card);
    root.scrollLeft = root.scrollWidth;
  }
}
const contractBook = new ContractBook();
const documents = Object.fromEntries(
  [
    'equipment',
    'boarding',
    'purgatory',
    'super',
    'change',
    'exchange-request',
    'exchange-accept',
  ].map((context) => [context, CONTRACTS[contractKey(context)]]),
);
let activeTransfer = null;
let replacementCounter = 0;
function currentDossier() {
  const pilot = snap?.pilots.find((p) => p.id === id);
  const token = activeTransfer
    ? activeTransfer.id + ':' + id
    : selectedEquipment !== null
      ? pilot?.state.equipmentBoarding?.token
      : pilot?.state.boarding?.token;
  return !respawnAt ? snap?.dossiers?.find((d) => d.token === token && d.pilot === id) : null;
}
function pendingAnnex() {
  const d = currentDossier();
  return d?.clause && !d.choice && d.position <= signatureForm ? d : null;
}

function paperSource() {
  if (respawnAt) return { x: 0, y: 1.5, z: -1 };
  return camera.position
    .clone()
    .add(new T.Vector3(0, 0, -MAP.metres(2)).applyQuaternion(camera.quaternion));
}
function renderPaper() {
  if (!joined || !snap) {
    $('papers').classList.add('hidden');
    $('paperBackdrop').classList.add('hidden');
    return;
  }
  let context = '',
    index = 0,
    eligible = false;
  const pilot = snap.pilots.find((p) => p.id === id);
  if (activeTransfer) {
    context = activeTransfer.recipient
      ? activeTransfer.status === 'offered'
        ? 'exchange-accept'
        : 'exchange-request'
      : 'change';
    eligible = boardingOpen;
    index = 0;
  } else if (respawnAt) {
    const body = soulArena?.bodies.find((b) => b.entity === id && !b.gone);
    const owner = soulArena && deskOccupant(soulArena, Date.now() + clockOffset);
    eligible = !!body && owner?.id === body.id && body.koUntil <= Date.now() + clockOffset;
    if (!eligible) paperSuppressed = false;
    context = isSuper() ? 'super' : 'purgatory';
    index = body?.paper || 0;
    eligible = eligible && !paperSuppressed;
  } else if (onFoot && !myVehicle && turretIndex < 0) {
    if (selectedEquipment !== null) {
      context = 'equipment';
      index = pilot?.state.equipmentBoarding?.paper || 0;
      eligible =
        boardingOpen &&
        pilot?.state.equipmentBoarding?.station === selectedEquipment &&
        stationAccess(baseWorld(selfBase() || { x: 1e6, z: 1e6 }), stations[selectedEquipment]);
    } else {
      context = 'boarding';
      index = pilot?.board_paper || 0;
      const v = snap.vehicles?.find((v) => v.id === selectedVehicle);
      eligible =
        boardingOpen &&
        !!v &&
        vehicleAccess(baseWorld(selfBase() || { x: 1e6, z: 1e6 }), v, selectedSeat);
    }
  }
  if (boardingBusy && paperSubmission) {
    context = paperSubmission.context;
    index = paperSubmission.index;
    eligible = true;
  }
  const visible =
    !bankUI.opened &&
    !bedUI.opened &&
    !purchaseUI.opened &&
    !boardingSelectionBusy &&
    eligible &&
    index < documents[context]?.length;
  $('paperClose').disabled = boardingBusy;
  $('signClear').disabled = boardingBusy;
  $('paperTear').disabled = boardingBusy || soulBusy;
  $('papers').classList.toggle('hidden', !visible);
  $('paperBackdrop').classList.toggle('hidden', !visible);
  if (!visible) {
    if (!boardingBusy) $('stampEcho').classList.remove('show');
    return;
  }
  if (controlFocus.active || document.pointerLockElement === canvas) releaseMouse();
  const key =
    boardingBusy && paperSubmission
      ? paperSubmission.key
      : context +
        ':' +
        index +
        ':' +
        id +
        ':' +
        (activeTransfer?.id || (context === 'equipment' ? selectedEquipment : selectedVehicle)) +
        ':' +
        (pilot?.incarnation || 0) +
        ':' +
        (pilot?.board_paper || 0) +
        ':' +
        (pilot?.state.boarding?.token || pilot?.state.equipmentBoarding?.token || '') +
        ':' +
        (currentDossier()?.choice || '') +
        ':' +
        replacementCounter;
  if (paperContext !== key) {
    $('stampEcho').classList.remove('show');
    paperContext = key;
    signatureForm = index;
    $('paperMessage').textContent = '';
    clearSignature();
    redrawInk();
  }
  const ordinaryDoc = contractBook.get(
      contractKey(
        context,
        activeTransfer
          ? activeTransfer.requester === id
            ? activeTransfer.to_seat
            : activeTransfer.from_seat
          : selectedSeat,
        snap?.vehicles.find((v) => v.id === (activeTransfer?.vehicle || selectedVehicle))?.type,
      ),
      index,
      key,
    ),
    total = documents[context].length;
  const annex = pendingAnnex(),
    doc = annex ? maliciousDocument(annex) : ordinaryDoc;
  $('paperTitle').textContent = doc.title;
  $('paperCode').textContent = doc.code + ' / ' + room;
  $('paperIssuer').textContent = !['purgatory', 'super'].includes(context)
    ? 'Base Alpha · Service des mini-pilotes'
    : isSuper()
      ? 'Super Saint-Pierre · Direction des récidives'
      : 'Guichet de Saint Pierre · Service des âmes';
  $('paperBody').textContent = doc.text;
  $('paperOwner').textContent = pilot?.name || 'Pilote';
  $('paperVehicle').textContent = activeTransfer
    ? SEAT_NAMES[activeTransfer.from_seat] + ' ↔ ' + SEAT_NAMES[activeTransfer.to_seat]
    : context === 'equipment'
      ? 'DCA · ' + stations[selectedEquipment].name
      : context === 'boarding'
        ? (VEHICLES[snap.vehicles?.find((v) => v.id === selectedVehicle)?.type]?.name ||
            'Appareil') +
          ' · ' +
          SEAT_NAMES[selectedSeat]
        : isSuper()
          ? 'Retour au purgatoire classique'
          : 'Retour à la base Alpha';
  const dossier = currentDossier(),
    extraDone = !!dossier?.clause && !!dossier.choice && dossier.position <= index;
  const processed = index + (extraDone ? 1 : 0);
  $('paperProgress').textContent =
    `Document ${processed + 1} sur ${total + (dossier?.clause ? 1 : 0)} · ${processed} traité${processed > 1 ? 's' : ''}`;

  $('signSubmit').disabled = !inkReady() || soulBusy || boardingBusy;
  $('signSubmit').textContent = boardingBusy
    ? 'Signature apposée…'
    : !annex && !['purgatory', 'super'].includes(context) && index === 1
      ? 'Signer et monter à bord →'
      : context === 'purgatory' && index === 2
        ? 'Signer et revenir à la base →'
        : context === 'super' && index === 4
          ? 'Signer et retourner au purgatoire →'
          : 'Déposer le document signé →';
}
async function submitPaper() {
  if (boardingBusy || soulBusy || !inkReady()) return;
  const signature = true,
    archive = { title: $('paperTitle').textContent, ink: sig.toDataURL('image/png') };
  paperSubmission = {
    context: activeTransfer
      ? activeTransfer.recipient
        ? activeTransfer.status === 'offered'
          ? 'exchange-accept'
          : 'exchange-request'
        : 'change'
      : respawnAt
        ? isSuper()
          ? 'super'
          : 'purgatory'
        : selectedEquipment !== null
          ? 'equipment'
          : 'boarding',
    index: signatureForm,
    key: paperContext,
    vehicle: selectedVehicle,
    seat: selectedSeat,
    station: selectedEquipment,
    request: activeTransfer?.id,
    annex: pendingAnnex()?.token || null,
  };
  boardingBusy = true;
  $('paperMessage').textContent = 'Signature apposée · Transmission du document';
  const echo = $('stampEcho');
  echo.classList.remove('show');
  void echo.offsetWidth;
  echo.classList.add('show');
  sound.play('stamp', paperSource(), { ref: 8 });
  renderPaper();
  try {
    const response = api(
      paperSubmission.annex
        ? 'dossier-choice'
        : activeTransfer
          ? 'seat-sign'
          : respawnAt
            ? 'sign'
            : selectedEquipment !== null
              ? 'equipment-sign'
              : 'vehicle-sign',
      {
        id,
        token: paperSubmission.annex,
        choice: paperSubmission.annex ? 'sign' : undefined,
        form: paperSubmission.index + 1,
        signature,
        ground: groundReport(),
        vehicle: paperSubmission.vehicle,
        seat: paperSubmission.seat,
        station: paperSubmission.station,
        request: paperSubmission.request,
      },
    );
    const result = await response;
    paperArchive.push(archive);
    try {
      sessionStorage.setItem('moucheron-dossier:' + room, JSON.stringify(paperArchive));
    } catch {}
    renderArchive();
    paperSubmission = null;
    if (activeTransfer) boardingOpen = false;
    accept(result);
    $('paperMessage').textContent = 'Document validé · Classé dans votre dossier';
  } catch (e) {
    clearSignature();
    $('stampEcho').classList.remove('show');
    $('paperMessage').textContent = e.message;
  } finally {
    boardingBusy = false;
    paperSubmission = null;

    renderPaper();
    if ($('papers').classList.contains('hidden')) captureMouse();
  }
}
$('soulPaperButton').onclick = () => {
  paperSuppressed = false;
  renderPaper();
};
$('boardButton').onclick = openBoarding;
$('baseHelp').onclick = () => {
  releaseMouse();
  if (bankUI.opened || bedUI.opened || purchaseUI.opened) return;
  $('help').classList.remove('hidden');
};
const purgScene = new T.Scene();
const purgColliders = [
  new T.Box3(new T.Vector3(-3.5, 0, -2.9), new T.Vector3(3.5, 1.6, -0.9)),
  new T.Box3(new T.Vector3(-100, -0.3, -100), new T.Vector3(100, -0.05, 200)),
];
purgScene.background = new T.Color('#172c39');
purgScene.fog = new T.Fog('#172c39', 35, 85);
purgScene.add(new T.HemisphereLight('#fff5dc', '#486975', 3));
const pl = new T.DirectionalLight('#fff4ca', 3);
pl.position.set(5, 20, 10);
purgScene.add(pl);
const purgCamera = new T.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 150),
  soulMeshes = new Map();
const soulStatus = new InsectStatus(T, purgScene, { scale: 1 });
function soulSlot(i) {
  return { x: i % 2 ? 1.1 : -1.1, z: 3 + Math.floor(i / 2) * 2.8 };
}
pm(purgScene, 28, 0.3, 120, '#7b8986', 0, -0.23, 140);
for (let z = -8; z < 90; z += 2)
  for (let x = -13; x < 14; x += 2)
    pm(purgScene, 2, 0.3, 2, (x + z) % 4 ? '#7b8986' : '#85948f', x, -0.2, z);
pm(purgScene, 7, 1.6, 2, '#725f45', 0, 0.8, -1.9);
for (let z = 3; z < 65; z += 3) {
  pm(purgScene, 0.12, 0.03, 1.4, '#d5ef73', -3, 0, z);
  pm(purgScene, 0.12, 0.03, 1.4, '#d5ef73', 3, 0, z);
}
const saint = humanoid('#eee9cf', true);
saint.position.set(0, 0, -3.2);
purgScene.add(saint);
const saintLabel = textLabel('SAINT PIERRE · RÉSURRECTIONS', '#fff1ad', 7);
saintLabel.position.set(0, 4, -3.2);
purgScene.add(saintLabel);
const superSaintLabel = textLabel('SUPER SAINT-PIERRE · RÉCIDIVES', '#e8baff', 8);
superSaintLabel.position.set(0, 5.5, -3.2);
purgScene.add(superSaintLabel);
const deskZone = new T.Mesh(
  new T.RingGeometry(0.95, 1.28, 48),
  new T.MeshBasicMaterial({
    color: '#ffd979',
    side: T.DoubleSide,
    transparent: true,
    opacity: 0.8,
  }),
);
deskZone.rotation.x = -Math.PI / 2;
deskZone.position.set(0, 0.04, 1);
purgScene.add(deskZone);
const zoneLabel = textLabel('PLACE AU GUICHET', '#ffdf8d', 4);
zoneLabel.position.set(0, 0.2, 1.1);
zoneLabel.rotation.x = -Math.PI / 2;
purgScene.add(zoneLabel);
function soulImpact(e) {
  if (e.kind === 'stamp') sound.play('stamp', { x: e.x, y: 1.2, z: e.z }, { ref: 7 });
}
function physicalPurgatory(dt, now) {
  if (!soulArena || !snap) return;
  const self = soulArena.bodies.find((b) => b.kind === 'player' && b.entity === id && !b.gone);
  if (!self) return;
  self.input = soulIntent();
  self.inputAt = soulArena.time;
  remoteBodies(soulArena, isSuper() ? 'super' : 'soul');
  advanceArena(soulArena, soulArena.time + dt * 1000, id);

  soulBody = { x: self.x, z: self.z, vx: self.vx, vz: self.vz, face: self.face };
  for (const event of snap.arena?.events || [])
    if (event.id > soulEventSeen) {
      soulEventSeen = event.id;
      if (event.origin !== id && Date.now() + clockOffset - event.at < 1000) soulImpact(event);
    }
  saint.scale.setScalar(isSuper() ? 1.4 : 1);
  saintLabel.visible = !isSuper();
  superSaintLabel.visible = isSuper();
  purgScene.background.set(isSuper() ? '#30223d' : '#172c39');
  const active = new Set();
  for (const b of soulArena.bodies) {
    if (b.gone) continue;
    active.add(b.id);
    let g = soulMeshes.get(b.id);
    if (!g) {
      g = b.kind === 'player' ? humanoid(b.entity === id ? '#d5ef73' : '#8bc9d6') : new T.Group();
      if (b.kind === 'enemy') {
        pm(g, 0.75, 0.8, 1.1, '#695441', 0, 0.8);
        pm(g, 1.6, 0.07, 0.6, '#d3dedc', 0, 1.25);
        for (const x of [-0.23, 0.23]) ball(x, 0.98, 0.55, 0.11, '#e7ab63', g);
      }

      g.position.set(b.x, 0, b.z);
      if (b.kind === 'player') equipPistolModel(g);
      purgScene.add(g);
      soulMeshes.set(b.id, g);
    }
    const age = soulArena.time - b.hitAt,
      ko = b.koUntil > soulArena.time,
      speed = Math.hypot(b.vx, b.vz);
    g.position.lerp(new T.Vector3(b.x, 0, b.z), 1 - Math.exp(-20 * dt));
    g.rotation.y +=
      Math.atan2(Math.sin(b.face - g.rotation.y), Math.cos(b.face - g.rotation.y)) *
      (1 - Math.exp(-18 * dt));
    const data = g.userData;
    if (data.rig) {
      const desired = ko ? 1.25 : Math.min(0.28, speed * 0.035) + (age < 220 ? -0.3 : 0);
      data.leanV += (desired - data.lean) * 65 * dt - data.leanV * 13 * dt;
      data.lean += data.leanV * dt;
      data.rig.rotation.x = data.lean;
      data.rig.position.y = ko
        ? -0.6
        : Math.abs(Math.sin(now * 0.014)) * Math.min(0.1, speed * 0.018);
      data.legs.forEach((l, j) => {
        l.rotation.x = ko
          ? Math.sin(now * 0.008 + j) * 0.3
          : Math.sin(now * 0.014 + j * Math.PI) * Math.min(0.7, speed * 0.2);
      });
      if (speed > 0.7 && !ko)
        sound.play(
          'step',
          { x: b.x, y: 0.1, z: b.z },
          { key: 'step:' + b.id, cooldown: Math.max(0.18, 0.95 / speed), ref: 6 },
        );
      data.rig.position.z = 0;
      data.arms.forEach((arm, j) => {
        arm.pivot.rotation.x = Math.sin(now * 0.014 + j * Math.PI) * Math.min(0.25, speed * 0.08);
        arm.elbow.rotation.x = 0;
      });
      data.rig.rotation.z =
        age < 260 ? Math.sin(age * 0.035) * 0.15 * (1 - age / 260) : ko ? 0.25 : 0;
    } else {
      g.rotation.x = ko ? 1.4 : Math.sin(now * 0.009 + b.id) * 0.06;
      g.position.y = ko ? -0.2 : Math.sin(now * 0.008 + b.id) * 0.08;
    }
  }
  for (const b of soulArena.bodies)
    if (b.kind === 'player' && soulMeshes.has(b.id))
      posePersonalWeapon(soulMeshes.get(b.id), b.entity === id, true);
  for (const b of soulArena.bodies)
    if (b.kind === 'enemy' && !b.gone) {
      const g = soulMeshes.get(b.id);
      if (g) soulStatus.update(b.id, g, b.health, b.maxHealth || 100, purgCamera, now / 1000);
    }
  soulStatus.keep(
    new Set(soulArena.bodies.filter((b) => b.kind === 'enemy' && !b.gone).map((b) => b.id)),
  );
  for (const [k, g] of soulMeshes)
    if (!active.has(k)) {
      purgScene.remove(g);
      g.traverse((o) => {
        o.geometry?.dispose();
        if (o.material?.map) o.material.map.dispose();
      });
      soulMeshes.delete(k);
    }
  for (let i = soulEffects.length - 1; i >= 0; i--) {
    const e = soulEffects[i],
      age = (now - e.born) / 1000;
    e.group.position.y += dt * 1.4;
    e.group.scale.setScalar(1 + age * 0.4);
    for (const m of e.group.children)
      if (m.userData.v) {
        m.position.addScaledVector(m.userData.v, dt);
        m.userData.v.y -= dt * 5;
      }
    if (age > 0.55) {
      purgScene.remove(e.group);
      e.group.traverse((o) => {
        o.geometry?.dispose();
        o.material?.map?.dispose();
      });
      soulEffects.splice(i, 1);
    }
  }
  soulShake = Math.max(0, soulShake - dt);
  const rendered = soulMeshes.get(self.id)?.position || new T.Vector3(self.x, 0, self.z);
  groundCamera(purgCamera, rendered, dt, true);
  deskZone.material.color.set(deskOccupant(soulArena)?.id === self.id ? '#d5ef73' : '#ffd979');
  renderPurgatory();
}
const turrets = [];
let stations = [];
function reconcileEquipment(next) {
  // Stable slot indices are assigned transactionally by the shared room.
  for (let i = 0; i < turrets.length; i++)
    if (
      !next[i] ||
      next[i].kind !== turrets[i]?.userData.kind ||
      next[i].slot !== turrets[i]?.userData.slot
    ) {
      const gun = turrets[i];
      if (!gun) continue;
      scene.remove(gun);
      gun.traverse((o) => o.geometry?.dispose());
      const at = colliders.indexOf(gun.userData.collider);
      if (at >= 0) colliders.splice(at, 1);
      scene.remove(stationRings[i]);
      stationRings[i] = null;
      turrets[i] = null;
    }
  stations = next;
  for (const [i, st] of stations.entries()) {
    if (turrets[i]) continue;
    const gun =
      st.kind === 'dca' ? makeAntiaircraft(T, scene, { box, cyl }, [st])[0] : installationModel(st);
    gun.userData.kind = st.kind;
    gun.userData.slot = st.slot;
    const collider = new T.Box3(
      new T.Vector3(st.x - MAP.metres(st.kind === 'bed' ? 0.8 : 2), st.y, st.z - MAP.metres(1.4)),
      new T.Vector3(
        st.x + MAP.metres(st.kind === 'bed' ? 0.8 : 2),
        st.y + MAP.metres(0.8),
        st.z + MAP.metres(1.4),
      ),
    );
    colliders.push(collider);
    gun.userData.collider = collider;
    const person = humanoid('#91b4a0');
    person.scale.setScalar(1.8 / 2.46);
    person.position.set(0, -0.75, 1);
    person.rotation.y = Math.PI;
    (gun.userData.yaw || gun).add(person);
    person.visible = false;
    gun.userData.person = person;
    gun.userData.shotAt = 0;
    turrets[i] = gun;
    const ring = entryRing.clone();
    ring.position.set(st.x + MAP.metres(3), st.y + ACTOR_UNIT * 0.12, st.z);
    ring.scale.setScalar(ACTOR_UNIT);
    if (st.kind === 'dca' || st.kind === 'bed') scene.add(ring);
    stationRings[i] = ring;
  }
}
function turretDirection() {
  return new T.Vector3(
    -Math.sin(turretAim.yaw) * Math.cos(turretAim.pitch),
    Math.sin(turretAim.pitch),
    -Math.cos(turretAim.yaw) * Math.cos(turretAim.pitch),
  );
}
function weaponDirection() {
  const d = turretDirection();
  return myVehicle && crewSeat !== 'pilot' ? d.applyQuaternion(me.quaternion) : d;
}
function nearestStation() {
  const b = selfBase();
  if (!b || b.parachute || turretIndex >= 0) return null;
  const w = baseWorld(b);
  let nearest = null;
  stations.forEach((s, index) => {
    if (s.kind === 'dca' && stationAccess(w, s)) {
      const d = Math.hypot(w.x - s.x, w.z - s.z);
      if (!nearest || d < nearest.distance) nearest = { index, distance: d };
    }
  });
  return nearest;
}
async function vehicleAction(path, extra = {}) {
  if (vehicleBusy || respawnAt) return;
  if (path === 'vehicle-exit' && crewSeat === 'pilot' && landed && vel.length() > MAP.metres(3)) {
    notify('Réduisez les gaz et arrêtez-vous avant de sortir.', 3);
    return;
  }
  const exiting = path === 'vehicle-exit' || (path === 'turret' && turretIndex >= 0);
  const backup = exiting ? optimisticExit() : null;
  vehicleBusy = true;
  try {
    const result = await api(path, {
      id,
      ground: groundReport(),
      damageSince: damageSeen,
      ...extra,
    });
    optimisticExitPending = false;
    accept(result, true);
    captureMouse();
  } catch (e) {
    if (backup) backup();
    notify(e.message, 3);
  } finally {
    optimisticExitPending = false;
    vehicleBusy = false;
  }
}
function optimisticExit() {
  const previous = {
    snap,
    onFoot,
    myVehicle,
    crewSeat,
    turretIndex,
    landed,
    bodies: baseArena.bodies,
  };
  const self = snap.pilots.find((p) => p.id === id),
    vehicle = myVehicle,
    grounded = vehicle ? !!(crewSeat === 'pilot' ? landed : vehicle.state.landed) : true,
    pose = vehicle ? (crewSeat === 'pilot' ? localMotion() : vehicle.state) : null,
    p = vehicle
      ? grounded
        ? vehicleEntry({ ...vehicle, state: pose })
        : { x: pose.p[0], y: pose.p[1], z: pose.p[2] }
      : {
          x: stations[turretIndex].x + MAP.metres(3),
          y: stations[turretIndex].y,
          z: stations[turretIndex].z,
        };
  const walkSpawn = {
    x: (p.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
    z: (OFFICE_LAYOUT.base.originZ - p.z) / ACTOR_UNIT,
    y: p.y,
    parachute: false,
    airborne: !grounded,
    vx: pose?.v[0] || 0,
    vy: pose?.v[1] || 0,
    vz: pose?.v[2] || 0,
  };
  const body = baseBody({ ...self, walkSpawn }, Date.now() + clockOffset);
  baseArena.bodies = [...baseArena.bodies.filter((b) => b.entity !== id), body];
  snap = structuredClone(snap);
  const preview = snap.pilots.find((p) => p.id === id);
  preview.mode = 'foot';
  preview.vehicle_id = null;
  preview.seat = null;
  preview.state.turret = null;
  for (const v of snap.vehicles) v.seats = v.seats.filter((s) => s.pilot !== id);
  onFoot = true;
  aircraftFire.invalidate();
  myVehicle = null;
  crewSeat = null;
  turretIndex = -1;
  landed = false;
  groundView.scene = '';
  optimisticExitPending = true;
  return () => {
    snap = previous.snap;
    onFoot = previous.onFoot;
    myVehicle = previous.myVehicle;
    crewSeat = previous.crewSeat;
    turretIndex = previous.turretIndex;
    landed = previous.landed;
    baseArena.bodies = previous.bodies;
    optimisticExitPending = false;
  };
}
function nearestBed() {
  const body = selfBase();
  return body?.grounded && !myVehicle && turretIndex < 0 && !respawnAt
    ? snap.equipment.find((bed) => bed.kind === 'bed' && bedAccess(baseWorld(body), bed))
    : null;
}
function interactVehicle() {
  const bed = nearestBed();
  if (bed) {
    bedUI.open(
      bed,
      snap.pilots.find((p) => p.id === id),
    );
    return;
  }
  if (myVehicle) {
    vehicleAction('vehicle-exit', { state: localMotion() });
    return;
  }
  if (turretIndex >= 0) {
    vehicleAction('turret');
    return;
  }
  const near = nearestStation();
  if (near) {
    chooseEquipment(near.index);
    return;
  }
  openBoarding();
}
async function chooseEquipment(index) {
  if (vehicleBusy || boardingBusy || boardingSelectionBusy) return;
  selectedEquipment = index;
  boardingOpen = false;
  boardingSelectionBusy = true;
  const timing = beginBoardingFeedback('dca', 'DCA');
  releaseMouse();
  renderPaper();
  try {
    timing.mark('request');
    const response = await api('equipment-select', { id, station: index, ground: groundReport() });
    timing.mark('confirmed');
    accept(response);
    boardingOpen = snap.pilots.find((p) => p.id === id)?.state.equipmentBoarding?.station === index;
    renderPaper();
  } catch (e) {
    boardingOpen = false;
    notify(e.message, 3);
    renderPaper();
  } finally {
    boardingSelectionBusy = false;
    renderPaper();
    finishBoardingFeedback(timing, boardingOpen ? 'ready' : 'failed');
  }
}
$('boardButton').onclick = interactVehicle;
$('vehicleInteract').onclick = interactVehicle;
$('parachuteToggle').onclick = () => {
  if (toggleParachute(selfBase())) renderShop();
};
$('leavePlane').onclick = () => vehicleAction('vehicle-exit', { state: localMotion() });
$('turretFire').onpointerdown = (e) => {
  e.preventDefault();
  e.currentTarget.setPointerCapture(e.pointerId);
  if (controlFocus.touch && !controlFocus.active) captureMouse();
  uiWeaponFire = true;
};
$('turretFire').onpointerup = $('turretFire').onpointercancel = () => (uiWeaponFire = false);
function updateVehicles(dt) {
  const visible = joined && !respawnAt,
    crew = !!myVehicle && crewSeat !== 'pilot';
  $('sortieControls').classList.toggle('hidden', !visible);
  $('parachuteToggle').classList.toggle(
    'hidden',
    !visible || !!myVehicle || turretIndex >= 0 || selfBase()?.grounded !== false,
  );
  $('parachuteToggle').textContent = selfBase()?.parachute
    ? 'Replier · Espace'
    : 'Parachute · Espace';
  $('leavePlane').classList.toggle('hidden', !myVehicle);
  $('leavePlane').textContent =
    landed || myVehicle?.state.landed ? 'Sortir de l’avion · F' : 'Sauter · F · Espace : parachute';
  $('vehicleInteract').classList.toggle('hidden', turretIndex < 0);
  $('turretFire').classList.toggle('hidden', turretIndex < 0 && !crew);
  $('flakControls').classList.toggle('hidden', turretIndex < 0);
  $('fuseDistance').textContent = rangeReadout(flakRange).metres.toFixed(3) + ' m · Shift / Ctrl';
  $('vehicleState').textContent =
    turretIndex >= 0
      ? 'DCA · ' + stations[turretIndex].name + ' · ' + Math.round(hp) + ' PV'
      : myVehicle
        ? VEHICLES[myVehicle.type].name +
          ' · ' +
          SEAT_NAMES[crewSeat] +
          ' · ' +
          Math.round(hp) +
          ' PV · Carburant ' +
          Math.ceil(remainingFuel()) +
          ' s · Munitions ' +
          (myVehicle.supplies?.ammo[currentAmmoKey()] !== undefined
            ? aircraftFire.available(myVehicle.id, crewSeat, myVehicle.supplies, currentAmmoKey())
            : '—') +
          (myVehicle.supplies?.ammo.bomb !== undefined
            ? ' · Bombes ' + Math.floor(myVehicle.supplies.ammo.bomb) + ' · Espace'
            : '') +
          (myVehicle.type === 'tank'
            ? ' · HE ' +
              Math.floor(myVehicle.supplies.ammo.he) +
              ' / AP ' +
              Math.floor(myVehicle.supplies.ammo.ap) +
              ' · Actif ' +
              (availableShell(myVehicle.supplies.ammo, selectedShell) || 'vide') +
              ' · Clic : canon · Espace : coaxiale'
            : '') +
          (myVehicle.supplies?.servicing ? ' · Ravitaillement' : '')
        : selfBase()?.parachute
          ? 'Descente sous voile'
          : 'Échelle ' + MAP.numerator + '/' + MAP.denominator + ' · À pied';
  if (!visible) return;
  if (crew) {
    const observing =
      myVehicle.type === 'tank' && crewSeat === 'cannon' && !!keys.KeyC && controlFocus.active;
    if (
      myVehicle.type === 'tank' &&
      crewSeat === 'cannon' &&
      (mouseFire || pad.fire || uiWeaponFire) &&
      !observing &&
      canCapture()
    )
      fireHeavy();
    if (observing) {
      freeLook.yaw -= pad.yaw * dt * 2;
      freeLook.pitch = T.MathUtils.clamp(freeLook.pitch - pad.pitch * dt, -0.1, 1.2);
    }
    if (controlFocus.active && !observing) {
      turretAim.yaw -= pad.yaw * dt * currentFactors().aim;
      turretAim.pitch = T.MathUtils.clamp(
        turretAim.pitch - pad.pitch * dt * currentFactors().aim,
        myVehicle?.type === 'tank' ? -0.65 : -0.05,
        1.2,
      );
    }
    const dir = weaponDirection(),
      mount = me.userData.turrets[crewSeat === 'tail' || crewSeat === 'top' ? 1 : 0],
      up = new T.Vector3(0, 1, 0).applyQuaternion(me.quaternion);
    aimGun(T, mount, dir, me.quaternion);
    const scoped = myVehicle.type === 'tank' && crewSeat === 'cannon';
    const view = scoped
      ? tankSight(T, mount, dir, up, observing ? freeLook : null)
      : gunnerView(T, mount, dir, up);
    if (scoped) me.visible = observing;
    camera.position.copy(view.eye);
    camera.up.copy(up);
    camera.lookAt(view.target);
    $('crosshair').classList.remove('hidden', 'offscreen');
    shooting =
      !observing &&
      ((controlFocus.active &&
        (scoped ? keys.Space || pad.heavy : mouseFire || keys.Space || pad.fire)) ||
        (!scoped && uiWeaponFire)) &&
      canCapture() &&
      hasAmmo();
    cooldown -= dt;
    while (shooting && cooldown <= 0) {
      cooldown +=
        (myVehicle.type === 'tank' ? TANK_MG[currentAmmoKey()].interval : 0.09) *
        currentFactors().interval;
      bullet(view.muzzle, spreadDirection(T, dir), '#f4efab', true);
    }
    if (!shooting) cooldown = Math.max(0, cooldown);
  }
  for (let index = 0; index < turrets.length; index++) {
    const gun = turrets[index];
    if (!gun) continue;
    const station = stations[index],
      occupant = snap?.pilots.find(
        (p) => p.life === 'alive' && p.mode === 'turret' && p.state.turret === index,
      );
    gun.userData.person.visible = !!occupant;
    if (!occupant) continue;
    const self = occupant.id === id,
      motion = self ? localMotion() : remoteMotion(occupant),
      dir = self
        ? turretDirection()
        : new T.Vector3().fromArray(motion.turretDirection || [0, 0.3, -1]).normalize();
    gun.userData.yaw.userData.pitch = gun.userData.pitch;
    aimGun(T, gun.userData.yaw, dir);
    gun.updateWorldMatrix(true, true);
    const muzzle = gun.userData.muzzles[gun.userData.barrel % 2].getWorldPosition(new T.Vector3());
    if (self) {
      if (controlFocus.active) {
        turretAim.yaw -= pad.yaw * dt * currentFactors().aim * 1.5;
        turretAim.pitch = T.MathUtils.clamp(
          turretAim.pitch - pad.pitch * dt * currentFactors().aim,
          -0.1,
          1.35,
        );
      }
      camera.position.set(station.x, station.y + MAP.metres(1.8), station.z);
      camera.up.set(0, 1, 0);
      camera.lookAt(camera.position.clone().addScaledVector(dir, MAP.metres(100)));
      shooting = (controlFocus.active && (mouseFire || keys.Space || pad.fire)) || uiWeaponFire;
      if (shooting && performance.now() > gun.userData.shotAt) {
        gun.userData.shotAt =
          performance.now() + FLAK.interval * 1000 * (self ? currentFactors().interval : 1);
        gun.userData.barrel++;
        bullet(muzzle, dir, '#ffe49b', true, true);
      }
    } else if (motion.fire && performance.now() > gun.userData.shotAt) {
      gun.userData.shotAt =
        performance.now() + FLAK.interval * 1000 * (self ? currentFactors().interval : 1);
      gun.userData.barrel++;
      bullet(muzzle, dir, '#91d9c4', false, true);
    }
  }
}
$('fuseMinus').onclick = () => (flakRange = fuseRange(flakRange - FLAK.step));
$('fusePlus').onclick = () => (flakRange = fuseRange(flakRange + FLAK.step));

const entryRing = new T.Mesh(
  new T.RingGeometry(1.08, 1.24, 40),
  new T.MeshBasicMaterial({
    color: '#d5ef73',
    side: T.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }),
);
entryRing.rotation.x = -Math.PI / 2;
entryRing.renderOrder = 5;
const entryRings = new Map();
function roleEntry(seat) {
  const g = new T.Group();
  g.add(entryRing.clone());
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2edc7';
  ctx.font = 'bold 88px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText({ pilot: 'P', dorsal: 'D', tail: 'Q', cannon: 'C', top: 'M' }[seat] || 'P', 64, 98);
  const texture = new T.CanvasTexture(c),
    geometry = new T.PlaneGeometry(1, 1),
    material = new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const icon = new T.Mesh(geometry, material);
  icon.rotation.x = -Math.PI / 2;
  icon.position.y = 0.01;
  g.add(icon);
  g.userData.dispose = () => {
    texture.dispose();
    geometry.dispose();
    material.dispose();
  };
  return g;
}
const stationRings = [];
function updateBaseWorld(dt, now) {
  if (!baseArena || !snap) return;
  for (const event of snap.base?.events || [])
    if (event.id > baseAudioSeq) {
      baseAudioSeq = event.id;
      if (!respawnAt && event.origin !== id && Date.now() + clockOffset - event.at < 1000) {
        const p = baseWorld(event);
        sound.play('stamp', { ...p, y: p.y + 1.3 }, { ref: 8 });
      }
    }
  const body = selfBase();
  if (onFoot && !respawnAt && body && turretIndex < 0) {
    body.input = baseIntent();
    body.inputAt = baseArena.time;
  }
  remoteBodies(baseArena, 'base');
  advanceBase(baseArena, baseArena.time + dt * 1000, id);
  if (body && onFoot && !respawnAt && turretIndex < 0) {
    const impact = stepWalker(body, dt, colliders);
    if (impact?.damage)
      action('fall-impact', {
        speed: impact.speed,
        shot: id + ':fall:' + ++shotSequence,
        incarnation: snap.pilots.find((p) => p.id === id)?.incarnation,
      });
  }
  const active = new Set();
  for (const b of baseArena.bodies) {
    if (b.gone) continue;
    active.add(b.entity);
    let g = basePeople.get(b.entity);
    if (!g) {
      g = humanoid(b.entity === id ? '#d5ef73' : '#8bc9d6');
      equipPistolModel(g);
      g.scale.setScalar(HUMAN_SCALE);

      scene.add(g);
      basePeople.set(b.entity, g);
      const w = baseWorld(b);
      g.position.set(w.x, w.y, w.z);
    }
    const w = baseWorld(b);
    g.position.lerp(new T.Vector3(w.x, w.y, w.z), 1 - Math.exp(-20 * dt));
    g.rotation.y = Math.PI - b.face;
    if (!g.userData.chute) {
      const chute = new T.Group();
      const canopy = new T.Mesh(
        new T.SphereGeometry(1.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        mat('#eee6bb'),
      );
      canopy.position.y = 4;
      chute.add(canopy);
      for (const x of [-1, 1])
        for (const z of [-1, 1]) {
          const rope = new T.Line(
            new T.BufferGeometry().setFromPoints([
              new T.Vector3(x, 4, z),
              new T.Vector3(x * 0.3, 1.6, z * 0.2),
            ]),
            new T.LineBasicMaterial({ color: '#eee9cb' }),
          );
          chute.add(rope);
        }
      g.add(chute);
      g.userData.chute = chute;
    }
    g.userData.chute.visible = !!b.parachute;
    const speed = Math.hypot(b.vx, b.vz);
    g.userData.legs.forEach(
      (l, j) => (l.rotation.x = Math.sin(now * 0.014 + j * Math.PI) * Math.min(0.7, speed * 0.18)),
    );
    g.userData.arms.forEach(
      (a, j) =>
        (a.pivot.rotation.x = Math.sin(now * 0.014 + j * Math.PI) * Math.min(0.25, speed * 0.08)),
    );
    posePersonalWeapon(g, b.entity === id);
    if (!respawnAt && speed > 0.6)
      sound.play('step', w, {
        key: 'base-step:' + b.entity,
        cooldown: Math.max(0.18, 0.95 / speed),
        ref: 7,
      });
  }
  for (const [id, g] of basePeople)
    if (!active.has(id)) {
      scene.remove(g);
      basePeople.delete(id);
    }
  const v = nearestVehicle();
  for (const ring of stationRings.filter(Boolean))
    ring.visible = onFoot && !respawnAt && !myVehicle && turretIndex < 0;
  const visibleEntries = new Set();
  for (const vehicle of snap.vehicles || []) {
    if (vehicle.state.hp <= 0 || !vehicle.state.landed) continue;
    for (const seat of VEHICLES[vehicle.type].seats) {
      if (vehicle.seats.some((s) => s.seat === seat)) continue;
      const key = vehicle.id + ':' + seat;
      visibleEntries.add(key);
      let ring = entryRings.get(key);
      if (!ring) {
        ring = roleEntry(seat);
        entryRings.set(key, ring);
        scene.add(ring);
      }
      const e = vehicleEntry(vehicle, seat);
      ring.visible = onFoot && !respawnAt && !myVehicle && turretIndex < 0;
      ring.position.set(e.x, e.y + ACTOR_UNIT * 0.12, e.z);
      ring.scale.setScalar(ACTOR_UNIT);
    }
  }
  for (const [key, ring] of entryRings)
    if (!visibleEntries.has(key)) {
      scene.remove(ring);
      ring.userData.dispose?.();
      entryRings.delete(key);
    }
  if (onFoot && !respawnAt && body && !myVehicle && turretIndex < 0) {
    const g = basePeople.get(id),
      w = g?.position || baseWorld(body);
    groundCamera(camera, w, dt);
    const station = nearestStation(),
      bed = nearestBed();
    $('baseStatus').textContent = body.parachute
      ? 'Parachute déployé · Dirigez la descente'
      : bed
        ? 'Lit · E : contrat personnel de réapparition / résiliation'
        : station
          ? 'DCA ' + stations[station.index].name + ' · E pour signer le dossier'
          : v
            ? VEHICLES[v.type].name + ' · ' + SEAT_NAMES[v.entrySeat] + ' · E pour signer'
            : 'Rejoignez une porte · Un chasseur et un bombardier prêts au départ';
    $('boardButton').textContent = station
      ? 'Signer · DCA · E'
      : v
        ? 'Embarquer · E'
        : 'Rejoindre un appareil';
    $('boardButton').disabled = body.parachute || (!bed && !station && !v);
    $('seatChoices').replaceChildren();
    renderPaper();
  }
}
function currentRoster() {
  return snap?.roster || wavePlan(room, snap?.wave || 0, snap?.started || 0).roster;
}
function damageEnemy(enemy, amount, shot, point) {
  if (localKills.has(enemy)) return;
  const profile = currentRoster()[enemy];
  if (!profile) return;
  const damage = (localEnemyDamage.get(enemy) || 0) + amount;
  localEnemyDamage.set(enemy, damage);
  action('hit', { wave: snap.wave, enemy, amount, shot });
  if (damage >= profile.hp) {
    localKills.add(enemy);
    fallEnemy(enemy);
    sound.play('confirm', point, { ref: 10, cooldown: 0.06, key: 'kill' });
    notify(profile.name + ' intercepté', 0.7);
  } else {
    hitEffects.burst(point, camera);
    sound.play('ricochet', point, { ref: 10 });
  }
}
let entryNoticeWave = -1;
function enemies(now) {
  if (!snap) return;
  const active = new Set(),
    t =
      ((snap.sentAt ? snap.sentAt + performance.now() - snap.receivedAt : now + clockOffset) -
        snap.started) /
      1000,
    roster = currentRoster(),
    frame = snap.phase === 'combat' ? swarmFrame(roster, t) : [];
  for (let i = 0; i < frame.length; i++) {
    const state = frame[i];
    if (!state || localKills.has(i)) continue;
    active.add(i);
    const profile = roster[i];
    let g = insects.get(i);
    if (!g) {
      g = insect(profile.type);
      g.userData.entryStatus = entryStatus(profile, t);
      if (g.userData.entryStatus === 'in-flight' && entryNoticeWave !== snap.wave) {
        entryNoticeWave = snap.wave;
        notify('Ennemis déjà en route · découverte tardive de la vague', 4);
      }
      g.scale.setScalar(insectScale(profile.type, INSECT_SCALE, profile.size));
      insects.set(i, g);
    }
    const next = new T.Vector3().fromArray(state.p),
      delta = next.clone().sub(g.position);
    if (g.userData.hasPosition && delta.lengthSq() > 1e-12) {
      const target = new T.Quaternion().setFromUnitVectors(
        new T.Vector3(0, 0, -1),
        delta.normalize(),
      );
      g.quaternion.slerp(target, 0.25);
    }
    g.userData.velocity = next
      .clone()
      .sub(g.position)
      .divideScalar(Math.max(0.01, (now - (g.userData.lastMoveAt || now - 16)) / 1000));
    g.userData.lastMoveAt = now;
    g.position.copy(next);
    if (profile.ground) {
      g.rotation.x = 0;
      g.rotation.z = 0;
    }
    for (const [j, leg] of (g.userData.legs || []).entries())
      leg.rotation.y = Math.sin(now * 0.025 + profile.phase + j) * 0.3;
    g.userData.hasPosition = true;
    g.userData.wings.forEach(
      (w, j) =>
        (w.rotation.z =
          Math.sin(now * (profile.type === 'brute' ? 0.04 : 0.065) + profile.phase) *
          (j ? 1 : -1) *
          0.65),
    );
  }
  for (const [i, g] of insects)
    if (active.has(i)) {
      const profile = roster[i];
      insectStatus.update(
        i,
        g,
        profile.hp - (localEnemyDamage.get(i) || 0),
        profile.hp,
        camera,
        performance.now() / 1000,
        profile.size * (profile.type === 'midge' ? 1.35 : 1),
      );
    }
  insectStatus.keep(active);
  for (const [i, g] of insects)
    if (!active.has(i)) {
      scene.remove(g);
      g.traverse((o) => o.geometry?.dispose());
      for (const material of g.userData.disposables || []) material.dispose();
      insects.delete(i);
    }
  $('enemies').textContent =
    snap.phase === 'combat' ? Math.max(0, snap.total - snap.kills.length - snap.leaked) : '—';
}
function vehicleModel(v) {
  let g = fleetModels.get(v.id);
  if (!g) {
    g =
      v.type === 'spitfire'
        ? makeSpitfire('#e3ebc0')
        : v.type === 'tank'
          ? makeTank('#8eb7c6')
          : v.type === 'interceptor'
            ? makeStuka('#8eb7c6')
            : v.type === 'bomber'
              ? makeBomber('#c5ba92')
              : makePlane(v.type === 'interceptor' ? '#8eb7c6' : '#e3ebc0');
    paintVehicle(
      T,
      g,
      v.supplies?.sequence || 0,
      v.type === 'bomber'
        ? '#c5ba92'
        : ['interceptor', 'tank'].includes(v.type)
          ? '#8eb7c6'
          : '#e3ebc0',
    );
    g.scale.setScalar(ACTOR_UNIT);
    g.userData.vehicleType = v.type;

    fleetModels.set(v.id, g);
    others.set(v.id, g);
  }
  return g;
}
function updateOthers(dt) {
  if (!snap) return;
  const active = new Set();
  for (const v of snap.vehicles || []) {
    active.add(v.id);
    const g = vehicleModel(v),
      pilot = v.seats.find((s) => s.seat === 'pilot'),
      p = snap.pilots.find((p) => p.id === pilot?.pilot),
      motion = p ? remoteMotion(p) : v.state,
      isSelf = myVehicle?.id === v.id && crewSeat === 'pilot';
    if (!isSelf) {
      const pos = new T.Vector3().fromArray(motion.p);
      if (g.position.distanceTo(pos) > MAP.metres(30)) g.position.copy(pos);
      else g.position.lerp(pos, 1 - Math.exp(-24 * dt));
      g.quaternion.slerp(new T.Quaternion().fromArray(motion.q), 1 - Math.exp(-24 * dt));
    }
    updateInscriptions(T, g, v, snap.pilots);
    g.visible = v.state.hp > 0;
    g.userData.wing.scale.x = v.state.wing ? 1 : 0.52;
    for (const prop of g.userData.props || [g.userData.prop])
      if (!isSelf)
        prop.rotation.z +=
          dt *
          (v.state.engine && v.supplies?.fuel > 0 && v.seats.some((s) => s.seat === 'pilot')
            ? 45
            : 0);
    if (v.type === 'bomber' || v.type === 'tank')
      for (const [i, seat] of (v.type === 'tank'
        ? ['cannon', 'top']
        : ['dorsal', 'tail']
      ).entries()) {
        const occ = v.seats.find((s) => s.seat === seat),
          gunner = snap.pilots.find((p) => p.id === occ?.pilot);
        if (!gunner) continue;
        const m = gunner.id === id ? localMotion() : remoteMotion(gunner);
        const mount = g.userData.turrets[i];
        aimGun(T, mount, new T.Vector3().fromArray(m.turretDirection || [0, 0, -1]), g.quaternion);
        if (
          gunner.id !== id &&
          m.fire &&
          v.supplies?.ammo[v.type === 'tank' && seat === 'cannon' ? 'coax' : seat] >= 1 &&
          Math.random() <
            dt /
              ((v.type === 'tank' ? TANK_MG[seat === 'cannon' ? 'coax' : seat].interval : 0.09) *
                clauseFactors(gunner.contractClause).interval)
        ) {
          const o = (
            v.type === 'tank' && seat === 'cannon'
              ? mount.userData.coaxMuzzle
              : mount.userData.muzzle
          ).getWorldPosition(new T.Vector3());
          bullet(o, new T.Vector3().fromArray(m.turretDirection || [0, 0, -1]), vehicleColor(v));
        }
      }
    if (
      !isSelf &&
      v.type !== 'bomber' &&
      motion.fire &&
      v.supplies?.ammo.pilot >= 1 &&
      Math.random() < dt / (FIRE_INTERVAL * clauseFactors(p?.contractClause).interval)
    ) {
      const direction = new T.Vector3(0, 0, -1).applyQuaternion(g.quaternion);
      if (v.type === 'spitfire') {
        g.updateWorldMatrix(true, true);
        for (const node of g.userData.muzzles)
          bullet(node.getWorldPosition(new T.Vector3()), direction, vehicleColor(v));
      } else
        bullet(
          new T.Vector3(v.type === 'tank' ? 0.7 : (weaponBarrel++ % 2 ? 1 : -1) * 1.35, 0, -1.2)
            .multiplyScalar(ACTOR_UNIT)
            .applyQuaternion(g.quaternion)
            .add(g.position),
          direction,
          vehicleColor(v),
        );
    }
  }
  for (const [k, g] of fleetModels)
    if (!active.has(k)) {
      scene.remove(g);
      g.traverse((o) => {
        o.geometry?.dispose();
        o.material?.map?.dispose();
        o.material?.dispose?.();
      });
      fleetModels.delete(k);
      others.delete(k);
    }
}
function bullet(pos, dir, color = '#f4efab', owned = false, aa = false) {
  if (owned && !aa && myVehicle) {
    if (aircraftFire.available(myVehicle.id, crewSeat, myVehicle.supplies, currentAmmoKey()) < 1)
      return;
    const launch = {
      vehicle: myVehicle.id,
      wave: snap?.wave,
      damageFactor: currentFactors().damage,
      weapon: currentAmmoKey(),
      baseDamage: myVehicle.type === 'tank' ? TANK_MG[currentAmmoKey()].damage : 75,
      velocity: crewSeat === 'pilot' ? vel.clone() : new T.Vector3().fromArray(myVehicle.state.v),
    };
    const vehicle = myVehicle.id,
      seat = crewSeat,
      origin = pos.clone(),
      direction = dir.clone();
    if (aircraftFire.fire(vehicle, seat, myVehicle.supplies, currentAmmoKey()))
      emitBullet(origin, direction, vehicleColor(myVehicle), owned, aa, launch);
    return;
  }
  emitBullet(pos, dir, color, owned, aa);
}
const aircraftFire = new AircraftFire(
  (request) => api('aircraft-fire', { id, ...request }),
  () => {
    if (!joined || respawnAt || deathPending || !myVehicle || myVehicle.state.hp <= 0) return null;
    const self = snap?.pilots.find((p) => p.id === id);
    if (self?.life !== 'alive') return null;
    return JSON.stringify([
      room,
      id,
      self.incarnation,
      snap.mission_started,
      snap.wave,
      myVehicle.id,
      crewSeat,
    ]);
  },
  {
    session:
      globalThis.crypto?.randomUUID?.() ||
      Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
  },
);
function emitBullet(pos, dir, color, owned, aa, launch = null) {
  if (!respawnAt) sound.play(aa ? 'flak' : 'shot', pos, { ref: aa ? 35 : 12 });
  const m = makeTracer(T, scene, pos, dir, color, aa);
  if (owned) combatEffects.muzzle(pos, dir);
  const velocity = dir.clone().multiplyScalar(MAP.metres(aa ? REFERENCE.shell : REFERENCE.bullet));
  if (launch) velocity.add(launch.velocity);
  else if (!aa && owned && myVehicle)
    velocity.add(crewSeat === 'pilot' ? vel : new T.Vector3().fromArray(myVehicle.state.v));
  trails.push({
    m,
    v: velocity,
    life: aa ? 3 : 2,
    shell: aa,
    travelled: 0,
    fuse: MAP.metres(flakRange),
    originVehicle: launch?.vehicle || myVehicle?.id || null,
    owned,
    shot: id + ':' + ++shotSequence,
    wave: launch?.wave ?? snap?.wave,
    damageFactor: launch?.damageFactor ?? currentFactors().damage,
    baseDamage: launch?.baseDamage ?? 75,
    weapon: launch?.weapon,
  });
  if (trails.length > 256) {
    const old = trails.shift();
    scene.remove(old.m);
    old.m.userData.dispose();
  }
}
function shoot(forward) {
  if (myVehicle?.type === 'spitfire') {
    if (aircraftFire.available(myVehicle.id, crewSeat, myVehicle.supplies, currentAmmoKey()) < 6)
      return;
    me.updateWorldMatrix(true, true);
    for (const node of me.userData.muzzles)
      bullet(
        node.getWorldPosition(new T.Vector3()),
        spreadDirection(T, forward),
        vehicleColor(myVehicle),
        true,
      );
    return;
  }
  const side = myVehicle?.type === 'tank' ? 0.7 : (weaponBarrel++ % 2 ? 1 : -1) * 1.35;
  const muzzle = new T.Vector3(side, 0, -1.2)
    .multiplyScalar(ACTOR_UNIT)
    .applyQuaternion(me.quaternion)
    .add(me.position);
  bullet(muzzle, spreadDirection(T, forward), '#f4efab', true);
}
function explosion(b, point) {
  combatEffects.blast(point);
  effectSeen.add(b.shot);
  sound.play('crash', point, { ref: 22 });
  action('blast', { shot: b.shot, p: point.toArray() });
  const radius = MAP.metres(FLAK.radius);
  const exposed = (position) => {
    const delta = position.clone().sub(point),
      length = delta.length();
    if (length < 1e-9) return true;
    const ray = new T.Ray(point, delta.normalize());
    return !colliders.some((box) => {
      const p = ray.intersectBox(box, new T.Vector3());
      if (!p) return false;
      const d = p.distanceTo(point);
      return d > MAP.metres(0.03) && d < length - MAP.metres(0.02);
    });
  };
  for (const [enemy, g] of insects) {
    if (
      b.wave !== snap.wave ||
      localKills.has(enemy) ||
      g.position.distanceTo(point) > radius ||
      !exposed(g.position)
    )
      continue;
    damageEnemy(
      enemy,
      blastDamage(g.position.distanceTo(point)) * (b.damageFactor ?? 1),
      b.shot + ':' + enemy,
      g.position,
    );
  }
  for (const v of snap?.vehicles || []) {
    const g = fleetModels.get(v.id);
    if (!g?.visible) continue;
    const damage = blastDamage(g.position.distanceTo(point));
    if (damage && exposed(g.position))
      action('friendly-hit', { vehicle: v.id, shot: b.shot + ':' + v.id, amount: damage });
  }
  for (const p of snap?.pilots || []) {
    if (p.life !== 'alive' || p.vehicle_id) continue;
    const body = baseArena?.bodies.find((b) => b.entity === p.id),
      pos =
        p.mode === 'turret'
          ? new T.Vector3(
              stations[p.state.turret].x,
              stations[p.state.turret].y + MAP.metres(1),
              stations[p.state.turret].z,
            )
          : body
            ? new T.Vector3(...Object.values(baseWorld(body))).add(
                new T.Vector3(0, MAP.metres(0.9), 0),
              )
            : null;
    if (!pos) continue;
    const amount = blastDamage(pos.distanceTo(point));
    if (amount && exposed(pos))
      action('friendly-hit', { target: p.id, shot: b.shot + ':' + p.id, amount });
  }
}
function stepProjectiles(dt) {
  const n = Math.max(1, Math.ceil(dt * 120));
  for (let i = 0; i < n; i++) stepProjectileSlice(dt / n);
}
function stepProjectileSlice(dt) {
  for (let i = trails.length - 1; i >= 0; i--) {
    const b = trails[i],
      origin = b.m.position.clone();
    const before = b.v.clone();
    stepBallisticVelocity(b.v, dt, b.shell);
    const displacement = before.add(b.v).multiplyScalar(dt / 2);
    let distance = displacement.length();
    const dir = displacement.normalize();
    updateTracer(T, b.m, dir, camera);
    let fused = false;
    if (b.shell && b.travelled + distance >= b.fuse) {
      distance = Math.max(0, b.fuse - b.travelled);
      fused = true;
    }
    if (b.owned && !respawnAt) {
      let hit = nearestInsectHit(
        T,
        origin,
        dir,
        new Map([...insects].filter(([id]) => !localKills.has(id))),
        distance,
      );
      const ray = new T.Raycaster(origin, dir, 0, distance);
      for (const v of snap?.vehicles || []) {
        if (v.id === b.originVehicle) continue;
        const model = fleetModels.get(v.id);
        if (!model?.visible) continue;
        model.updateWorldMatrix(true, true);
        const h = nearestMeshHit(ray, model);
        if (h && (!hit || h.distance < hit.distance)) hit = { ...h, vehicle: v.id };
      }
      for (const p of snap?.pilots || []) {
        if (p.id === id || p.life !== 'alive' || p.vehicle_id) continue;
        const model =
          p.mode === 'turret' ? turrets[p.state.turret]?.userData.person : basePeople.get(p.id);
        if (!model?.visible) continue;
        model.updateWorldMatrix(true, true);
        const h = nearestMeshHit(ray, model);
        if (h && (!hit || h.distance < hit.distance)) hit = { ...h, target: p.id };
      }
      const solidRay = new T.Ray(origin, dir);
      for (const box of colliders) {
        const point = solidRay.intersectBox(box, new T.Vector3());
        if (point) {
          const d = origin.distanceTo(point);
          if (d <= distance && (!hit || d < hit.distance)) hit = { point, distance: d, wall: true };
        }
      }
      if (hit) {
        if (b.shell) {
          const impact = shellImpact(hit, b.travelled + hit.distance, MAP.metres(FLAK.minRange));
          if (impact.kind === 'blast') explosion(b, hit.point);
          else if (impact.kind === 'direct') {
            hitEffects.burst(hit.point, camera);
            if (hit.vehicle || hit.target)
              action('friendly-hit', {
                vehicle: hit.vehicle,
                target: hit.target,
                shot: b.shot,
                amount: impact.damage,
              });
            else if (hit.id !== undefined && b.wave === snap.wave)
              damageEnemy(hit.id, impact.damage * (b.damageFactor ?? 1), b.shot, hit.point);
          } else hitEffects.burst(hit.point, camera);
        } else {
          hitEffects.burst(hit.point, camera, {
            key: b.shot,
          });
          sound.play('impact', hit.point, { ref: 12 });
          if (hit.vehicle)
            action('friendly-hit', { vehicle: hit.vehicle, shot: b.shot, weapon: b.weapon });
          else if (hit.target)
            action('friendly-hit', { target: hit.target, shot: b.shot, weapon: b.weapon });
          else if (!hit.wall && b.wave === snap.wave && !localKills.has(hit.id)) {
            damageEnemy(
              hit.id,
              b.baseDamage * (1 + (snap.upgrades?.weapons || 0)) * (b.damageFactor ?? 1),
              b.shot,
              hit.point,
            );
          }
        }
        b.life = 0;
        fused = false;
      } else if (fused) explosion(b, origin.clone().addScaledVector(dir, distance));
    }
    b.m.position.addScaledVector(dir, distance);
    b.travelled += distance;
    b.life -= dt;
    if (fused) b.life = 0;
    if (b.life <= 0) {
      scene.remove(b.m);
      b.m.userData.dispose();
      trails.splice(i, 1);
    }
  }
}

// Fixed timestep flight: thrust, quadratic drag, gravity, angle-of-attack lift, wind-relative velocity.
function physics(dt) {
  if (respawnAt || onFoot || !myVehicle) return;
  if (myVehicle.type === 'tank') {
    const active = controlFocus.active && canCapture(),
      manual = flightInput(keys, pad, active);
    const state = { ...localMotion(), fuelAvailable: remainingFuel() > 0 };
    stepTank(
      T,
      state,
      {
        forward: -manual.pitch * currentFactors().controls,
        turn: (manual.roll || -manual.yaw) * currentFactors().controls,
      },
      colliders,
      dt,
      VEHICLES.tank,
    );
    if (state.hp <= 0) {
      crash();
      return;
    }
    me.position.fromArray(state.p);
    me.quaternion.fromArray(state.q);
    vel.fromArray(state.v);
    landed = state.landed;
    gas = state.gas;
    shooting = active && hasAmmo() && (mouseFire || manual.fire);
    cooldown -= dt;
    if (shooting && cooldown <= 0) {
      cooldown = TANK_MG.pilot.interval * currentFactors().interval;
      shoot(new T.Vector3(0, 0, -1).applyQuaternion(me.quaternion));
    }
    return;
  }
  const active = controlFocus.active && canCapture();
  const manual = flightInput(keys, pad, active);
  if (active && (keys.Space || pad.heavy) && myVehicle.supplies.ammo.bomb !== undefined)
    fireHeavy('bomb');
  const assisted = active && controlMode === 'mouse' && performance.now() > padManualUntil;
  const auto = assisted
    ? mouseFlightControls(T, { q: me.quaternion, omega, direction: mouseDirection })
    : { pitch: 0, roll: 0, yaw: 0 };
  const inversion = currentFactors().controls;
  const pitch = (manual.pitch || auto.pitch) * inversion,
    roll = (manual.roll || auto.roll) * inversion,
    yaw = (manual.yaw || auto.yaw) * inversion;
  gas = T.MathUtils.clamp(gas + manual.throttle * currentFactors().controls * dt * 0.4, 0, 1);
  const wind = new T.Vector3();
  const fan = OFFICE_LAYOUT.fan.position;
  if (snap?.fan && Math.abs(me.position.x - fan[0]) < 0.65) {
    const strength = Math.max(
      0,
      1 - Math.hypot(me.position.y - fan[1], me.position.z - fan[2]) / 0.2,
    );
    wind.x = MAP.metres(20) * strength;
  }
  const { forward, stall } = stepFlight(
    T,
    {
      q: me.quaternion,
      vel,
      omega,
      wind,
      gas,
      wing,
      engine: engine && remainingFuel() > 0,
      pitch,
      roll,
      yaw,
      scale: MAP.ratio,
      profile: upgradedVehicle(VEHICLES[myVehicle?.type || 'fighter'], snap?.upgrades),
    },
    dt,
  );
  const previousPosition = me.position.clone();
  me.position.addScaledVector(vel, dt);
  const landing = resolveLanding(
    T,
    {
      position: me.position,
      vel,
      q: me.quaternion,
      omega,
      gear: VEHICLES[myVehicle?.type || 'fighter'].gear,
    },
    previousPosition,
    colliders,
    dt,
  );
  const wasLanded = landed;
  landed = landing.landed;
  if (landed) {
    // Rolling friction and rudder/taxi steering. Pull back with enough airspeed to lift off.
    vel.x *= Math.exp(-dt * 0.35);
    vel.z *= Math.exp(-dt * 0.35);
    if (gas < 0.12) {
      const speed = vel.length();
      vel.multiplyScalar(Math.max(0, 1 - (MAP.metres(6) * dt) / Math.max(1e-9, speed)));
    }
    me.rotateY(-manual.yaw * inversion * dt * 0.7);
    if (manual.pitch * inversion > 0 && vel.length() > MAP.metres(18)) {
      me.rotateX(dt * 0.7);
      vel.y = MAP.metres(2);
      me.position.y += 0.16 * ACTOR_UNIT;
      landed = false;
    }
    if (!wasLanded) notify('Posé · Ctrl : réduire les gaz · F : sortir à l’arrêt', 3);
  }
  for (const prop of me.userData.props || [me.userData.prop])
    prop.rotation.z += dt * gas * (engine && remainingFuel() > 0 ? 70 : 0);
  $('stallWarning').classList.toggle('hidden', stall > 0.8);
  cooldown -= dt;
  shooting =
    active && myVehicle && myVehicle.type !== 'bomber' && hasAmmo() && (manual.fire || mouseFire);
  if (shooting && cooldown <= 0 && hp > 0) {
    cooldown += FIRE_INTERVAL * currentFactors().interval;
    shoot(forward);
  }
  if (!shooting) cooldown = Math.max(0, cooldown);
  damageCd -= dt;
  const p = me.position;
  let collision =
    !!landing.hard ||
    p.y < 0.4 * ACTOR_UNIT ||
    p.y > OFFICE_LAYOUT.bounds.ceiling ||
    Math.abs(p.x) > OFFICE_LAYOUT.bounds.x ||
    Math.abs(p.z) > OFFICE_LAYOUT.bounds.z;
  if (!collision)
    for (const b of colliders)
      if (
        !(
          landed &&
          Math.abs(p.y - (b.max.y + VEHICLES[myVehicle?.type || 'fighter'].gear)) < 0.2 * ACTOR_UNIT
        ) &&
        b
          .clone()
          .expandByScalar(0.3 * ACTOR_UNIT)
          .containsPoint(p)
      ) {
        collision = true;
        break;
      }
  if (collision && damageCd <= 0) {
    const impact = vel.length() / MAP.ratio;
    sound.play(impact > 30 ? 'crash' : 'impact', p, { ref: 12 });
    hp = Math.max(0, hp - impact * 2.1);
    damageCd = 0.65;
    if (hp <= 0 || impact > 30) {
      crash();
      return;
    }
    vel.multiplyScalar(-0.45);
    p.addScaledVector(vel, 0.2);
    if (hp < 65 && wing) {
      wing = 0;
      me.userData.wing.scale.x = 0.52;
      notify('Aile endommagée', 2);
    }
    if (hp < 35) engine = 0;
  }
}
const radar = $('radar').getContext('2d');
function drawRadar() {
  radar.clearRect(0, 0, 220, 220);
  radar.fillStyle = '#54766640';
  for (const box of colliders)
    if (box.max.y > 0.01 && box.max.y < OFFICE_LAYOUT.bounds.ceiling * 0.9)
      radar.fillRect(
        110 + box.min.x / 0.04,
        110 + (box.min.z / 0.04) * 0.88,
        (box.max.x - box.min.x) / 0.04,
        ((box.max.z - box.min.z) / 0.04) * 0.88,
      );
  radar.strokeStyle = '#77988740';
  radar.lineWidth = 1;
  for (let i = 22; i < 220; i += 44) {
    radar.beginPath();
    radar.moveTo(i, 0);
    radar.lineTo(i, 220);
    radar.moveTo(0, i);
    radar.lineTo(220, i);
    radar.stroke();
  }
  function dot(p, c, r) {
    radar.fillStyle = c;
    radar.beginPath();
    radar.arc(110 + p.x / 0.04, 110 + (p.z / 0.04) * 0.88, r, 0, Math.PI * 2);
    radar.fill();
  }
  dot(new T.Vector3(OFFICE_LAYOUT.bin.x, 0, OFFICE_LAYOUT.bin.z), '#eee5ae', 5);
  for (const g of insects.values())
    if (inRadarCoverage(g.position, stations)) dot(g.position, '#efaa74', 3);
  for (const g of basePeople.values()) if (g.visible) dot(g.position, '#8abbb2', 2);
  for (const g of others.values()) dot(g.position, '#8abbb2', 3);
  for (const st of stations) dot(st, '#f5da91', 2);
  dot(
    onFoot && basePeople.get(id)?.visible ? basePeople.get(id).position : me.position,
    '#d5ef73',
    4,
  );
  radar.font = '10px sans-serif';
  radar.fillStyle = '#9fb9a5';
  radar.fillText('RADAR / BUREAU 01', 9, 15);
}
let lastCountdownTick = null;
function updateAudio() {
  if (!joined) return;
  const purg = !!respawnAt,
    activeCamera = purg ? purgCamera : camera,
    sceneName = purg ? 'purgatory' : 'flight',
    changed = sound.scene !== sceneName;
  sound.distanceScale = purg ? 1 : ACTOR_UNIT;
  sound.setScene(sceneName);
  activeCamera.updateMatrixWorld();
  sound.listener(
    activeCamera.position,
    new T.Vector3(0, 0, -1).applyQuaternion(activeCamera.quaternion),
    new T.Vector3(0, 1, 0).applyQuaternion(activeCamera.quaternion),
  );
  if (changed) {
    const pos = purg ? { x: soulBody?.x || 0, y: 1.3, z: soulBody?.z || 4 } : me.position;
    sound.play('spawn', pos, { ref: purg ? 8 : 16, level: 0.65 });
  }
  const keep = new Set();
  if (!purg) {
    keep.add('office-ambience');
    sound.loop('office-ambience', 'ambience', { x: -2, y: 1.2, z: 1.1 }, { ref: 500 });
    const seconds =
      snap?.phase === 'prep' && snap.next_wave_at > 0
        ? Math.ceil((snap.next_wave_at - Date.now() - clockOffset) / 1000)
        : null;
    if (seconds !== lastCountdownTick && seconds > 0 && seconds <= 3)
      sound.play('tick', camera.position, { ref: 8 });
    lastCountdownTick = seconds;
    if (!onFoot && me.visible && hp > 0 && engine && remainingFuel() > 0) {
      keep.add('engine-self');
      sound.loop('engine-self', 'engine', me.position, {
        rate: 0.65 + gas * 1.2,
        level: 0.65,
        ref: 14,
      });
    }
    const planes = [...others.entries()]
      .filter(
        ([key, g]) =>
          g.visible &&
          (!myVehicle || crewSeat !== 'pilot' || key !== myVehicle.id) &&
          snap?.vehicles.find((v) => v.id === key)?.seats.some((s) => s.seat === 'pilot'),
      )
      .sort(
        (a, b) =>
          a[1].position.distanceToSquared(activeCamera.position) -
          b[1].position.distanceToSquared(activeCamera.position),
      )
      .slice(0, 10);
    for (const [id, g] of planes) {
      const pilot = snap?.vehicles.find((p) => p.id === id);
      if (pilot?.state.engine === 0 || pilot?.supplies?.fuel <= 0) continue;
      const key = 'engine-' + id;
      keep.add(key);
      sound.loop(key, 'engine', g.position, {
        rate:
          0.8 +
          Math.min(
            1.2,
            new T.Vector3().fromArray(pilot?.state.v || [0, 0, 0]).length() / MAP.metres(50),
          ),
        ref: 10,
      });
    }
    for (const v of snap?.vehicles || []) {
      const g = fleetModels.get(v.id);
      if (!g?.visible) continue;
      const state = myVehicle?.id === v.id && crewSeat === 'pilot' ? localMotion() : v.state,
        forward = new T.Vector3(0, 0, -1).applyQuaternion(g.quaternion),
        speed = new T.Vector3().fromArray(state.v).length() / MAP.ratio,
        intensity = diveIntensity(speed, forward.y, VEHICLES[v.type].maxSpeed);
      if (v.type === 'interceptor' && v.seats.length && intensity > 0.01) {
        const key = 'dive-' + v.id;
        keep.add(key);
        sound.loop(key, 'dive', g.position, {
          rate: 0.7 + intensity * 0.8,
          level: intensity,
          ref: 22,
        });
      }
    }
    if (snap?.fan) {
      keep.add('fan');
      sound.loop('fan', 'fan', fanGroup.position, { ref: 60 });
    }
    const bugs = [...insects.entries()]
      .sort(
        (a, b) =>
          a[1].position.distanceToSquared(activeCamera.position) -
          b[1].position.distanceToSquared(activeCamera.position),
      )
      .slice(0, 6);
    for (const [id, g] of bugs)
      if (g.position.distanceTo(activeCamera.position) < 55) {
        const key = 'bug-' + id;
        keep.add(key);
        sound.loop(key, 'insect', g.position, { ref: 5, rate: 0.9 + (id % 4) * 0.07 });
      }
  } else {
    for (const b of (soulArena?.bodies || [])
      .filter((b) => b.kind === 'enemy' && !b.gone)
      .sort(
        (a, b) =>
          Math.hypot(a.x - activeCamera.position.x, a.z - activeCamera.position.z) -
          Math.hypot(b.x - activeCamera.position.x, b.z - activeCamera.position.z),
      )
      .slice(0, 6)) {
      const key = 'soul-bug-' + b.id;
      keep.add(key);
      sound.loop(key, 'insect', { x: b.x, y: 0.9, z: b.z }, { ref: 5, level: 0.6, rate: 0.8 });
    }
  }
  sound.keep(keep);
  audioHUD();
}
let prev = performance.now(),
  acc = 0;
function updateCountdown() {
  if (snap?.phase !== 'prep') {
    $('start').disabled = false;
    return;
  }
  const seconds = Math.max(0, Math.ceil((snap.next_wave_at - Date.now() - clockOffset) / 1000));
  $('phaseText').textContent = snap.mission_started
    ? (snap.wave > 0 ? 'Prime de vague : +' + snap.waveReward + ' $ · ' : '') +
      'Prochaine vague dans ' +
      seconds +
      ' s'
    : 'Lancez la partie : première vague dans 10 s.';
  $('start').textContent = !snap.mission_started
    ? 'Lancer la partie →'
    : snap.wave === 0
      ? 'Décollage dans ' + seconds + ' s'
      : 'Lancer la vague maintenant →';
  $('start').disabled = !!snap.mission_started && snap.wave === 0;
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(Math.max(0, (now - prev) / 1000), 0.25);
  prev = now;
  const zoomFov = holdZoom.fov(zoomScope());
  if (camera.fov !== zoomFov) {
    camera.fov = zoomFov;
    camera.updateProjectionMatrix();
  }
  hitEffects.update(dt, camera);
  combatEffects.update(dt, camera);
  crashEffects.update(dt, colliders);
  previousPad = pad;
  try {
    pad = document.hasFocus() ? readPad(navigator.getGamepads?.()) : neutralPad();
  } catch {
    pad = neutralPad();
  }
  $('padStatus').textContent = pad.connected
    ? '🎮 Manette active · 3 axes'
    : '🎮 Appuyez sur un bouton de votre manette';
  if (
    joined &&
    controlFocus.active &&
    Math.max(Math.abs(pad.pitch), Math.abs(pad.roll), Math.abs(pad.yaw)) > 0.05
  ) {
    padManualUntil = now + 1500;
    mouseDirection.set(0, 0, -1).applyQuaternion(me.quaternion);
  }
  if (
    joined &&
    controlFocus.active &&
    onFoot &&
    !myVehicle &&
    turretIndex < 0 &&
    !respawnAt &&
    pad.heavy &&
    !previousPad.heavy
  )
    interactVehicle();
  if (joined && respawnAt && pad.heavy && !previousPad.heavy) {
    paperSuppressed = false;
    renderPaper();
  }
  if (joined && controlFocus.active && pad.fire && !previousPad.fire) pistol();
  if (joined && pad.start && !previousPad.start && !respawnAt)
    action(snap?.phase === 'lost' ? 'reset' : 'start');
  if (joined && pad.help && !previousPad.help) {
    releaseMouse();
    $('help').classList.toggle('hidden');
  }
  rotor.rotation.x += dt * (snap?.fan === 0 ? 0 : 28);
  winds.forEach((w, i) => {
    const f = OFFICE_LAYOUT.fan.position,
      t = (now * 0.0001 + i * 0.07) % 0.65;
    w.position.set(f[0] + t, f[1] + Math.sin(i * 2.2) * 0.12, f[2] + Math.cos(i * 2.2) * 0.12);
    w.visible = snap?.fan !== 0;
  });
  if (joined) {
    enemies(Date.now());
    updateOthers(dt);
    updateOrdnance(dt);
    acc += dt;
    while (acc >= 1 / 120) {
      physics(1 / 120);
      simulateVacantAircraft(1 / 120);
      acc -= 1 / 120;
    }
    if (turretIndex >= 0) {
      $('crosshair').classList.remove('hidden');
      $('crosshair').classList.remove('offscreen');
    }
    if (!respawnAt && now > msgUntil)
      $('notice').textContent = controlFocus.active
        ? ''
        : 'Curseur libre · Cliquez dans le décor pour reprendre';
    if (!onFoot && !respawnAt) {
      const assisted = controlMode === 'mouse' && now > padManualUntil;
      if (assisted) mouseCameraRotation(T, mouseDirection, mouseCameraQ, dt);
      else if (controlMode === 'mouse' && controlFocus.active && !keys.KeyC) {
        mouseDirection.set(0, 0, -1).applyQuaternion(me.quaternion);
        mouseCameraQ.copy(me.quaternion);
      }
      if (!keys.KeyC || !controlFocus.active) {
        freeLook.yaw *= Math.exp(-12 * dt);
        freeLook.pitch *= Math.exp(-12 * dt);
      }
      const baseQ = assisted ? mouseCameraQ : me.quaternion;
      const orbit = baseQ
        .clone()
        .multiply(
          new T.Quaternion().setFromEuler(new T.Euler(freeLook.pitch, freeLook.yaw, 0, 'YXZ')),
        );
      const offset = new T.Vector3(0, 3.5, 11).multiplyScalar(ACTOR_UNIT).applyQuaternion(orbit);
      camera.position.lerp(me.position.clone().add(offset), 1 - Math.exp(-10 * dt));
      camera.up.set(0, 1, 0).applyQuaternion(orbit);
      camera.lookAt(
        me.position
          .clone()
          .add(new T.Vector3(0, 0, -60).multiplyScalar(ACTOR_UNIT).applyQuaternion(orbit)),
      );
    }
    updateAimHUD();
    $('speed').textContent = ((vel.length() / MAP.ratio) * 3.6).toFixed(0);
    $('alt').textContent = Math.max(0, me.position.y).toFixed(2);
    $('gas').textContent = Math.round(gas * 100);
    $('health').textContent = Math.max(0, Math.round(hp)) + ' %';
    $('hpbar').style.width = hp + '%';
    networkStatus();
    drawRadar();
    updateCountdown();
  } else {
    camera.position.set(-1.65 + Math.sin(now * 0.00008) * 0.08, 1.08, 2.6);
    camera.lookAt(OFFICE_LAYOUT.base.originX, 0.91, OFFICE_LAYOUT.base.originZ - 0.08);
    me.userData.prop.rotation.z += dt * 15;
  }
  stepProjectiles(dt);
  if (respawnAt) {
    $('mouseAim').classList.add('hidden');
    $('mouseHint').classList.add('hidden');
    canvas.classList.remove('mouseFlight');
  }
  if (joined) updateBaseWorld(dt, now);
  updateVehicles(dt);
  updatePlacement();
  updateFallingEnemies(dt);
  updateContextHUD();
  if (respawnAt && soulBody) {
    physicalPurgatory(dt, now);
    renderer.render(purgScene, purgCamera);
  } else renderer.render(scene, camera);
  updateAudio();
  updateVehicleCare(dt);
  updateTankReticle();
}
requestAnimationFrame(frame);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

let placementKind = 'dca';
let placingEquipment = false,
  placementCandidate = null,
  purchaseBusy = false,
  placementToken = null;
const ghosts = {
  dca: makeAntiaircraft(T, scene, { box, cyl }, [{ x: 0, y: 0, z: 0 }])[0],
  refuel: installationModel({ kind: 'refuel', x: 0, y: 0, z: 0 }),
  radar: installationModel({ kind: 'radar', x: 0, y: 0, z: 0 }),
  bed: installationModel({ kind: 'bed', x: 0, y: 0, z: 0 }),
};
let ghost = ghosts.dca;
for (const model of Object.values(ghosts)) {
  model.visible = false;
  model.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.45;
      o.material.depthWrite = false;
      o.userData.projectileSolid = false;
    }
  });
}
function toggleShop() {
  if (bankUI.opened || bedUI.opened || purchaseUI.opened) return;
  if (!joined || respawnAt || !$('papers').classList.contains('hidden')) return;
  if (placingEquipment) cancelPlacement();
  const open = $('shop').classList.contains('hidden');
  $('shop').classList.toggle('hidden', !open);
  if (open) {
    releaseMouse();
    renderShop();
  } else captureMouse();
}
function renderShop() {
  if (!snap) return;
  $('wallet').textContent = snap.dollars + ' $';
  $('shopBalance').textContent = snap.dollars + ' $ · Caisse commune';
  const key = JSON.stringify([
    snap.dollars,
    snap.upgrades,
    snap.equipment?.length,
    snap.purchases,
    !!myVehicle,
    turretIndex,
    selfBase()?.grounded,
    purchaseBusy,
  ]);
  if ($('shopItems').dataset.key === key) return;
  $('shopItems').dataset.key = key;
  $('shopItems').replaceChildren();
  for (const [item, profile] of Object.entries(SHOP)) {
    const card = document.createElement('article'),
      title = document.createElement('h3'),
      text = document.createElement('p'),
      button = document.createElement('button'),
      level = snap.upgrades?.[item] || 0,
      owned = snap.purchases?.find((o) => o.owner === id && o.item === item),
      price = shopPrice(item, snap.upgrades, purchaseCount(snap, item));
    title.textContent = profile.name + (profile.max > 1 ? ' · ' + level + '/' + profile.max : '');
    text.textContent = profile.description;
    button.textContent =
      profile.max && level >= profile.max
        ? 'Acquis'
        : owned
          ? 'Déjà payé · Reprendre la pose'
          : price + ' $ · ' + (profile.kind === 'placement' ? 'Signer le bon' : 'Acheter');
    button.disabled =
      purchaseBusy ||
      (!owned && snap.dollars < price) ||
      (profile.max && level >= profile.max) ||
      (profile.kind === 'placement' &&
        (!!myVehicle || turretIndex >= 0 || selfBase()?.grounded === false));
    button.onclick = () => {
      if (profile.kind === 'placement') {
        if (owned) beginPlacement(owned);
        else
          purchaseUI.open(
            item,
            snap.pilots.find((p) => p.id === id),
          );
      } else purchase(item);
    };
    card.append(title, text, button);
    $('shopItems').append(card);
  }
}
async function purchase(item) {
  if (purchaseBusy) return;
  if (SHOP[item]?.kind === 'placement') return;
  purchaseBusy = true;
  renderShop();
  try {
    accept(
      await api('buy', {
        id,
        item,
        expectedPrice: shopPrice(item, snap.upgrades, purchaseCount(snap, item)),
        request:
          globalThis.crypto?.randomUUID?.() ||
          Date.now().toString(36) +
            '-' +
            Math.random().toString(36).slice(2) +
            '-' +
            Math.random().toString(36).slice(2),
        ground: groundReport(),
        position: placementCandidate,
      }),
    );
    sound.play('board', camera.position, { ref: 8 });
  } catch (e) {
    notify(e.message, 4);
  } finally {
    purchaseBusy = false;
    renderShop();
  }
}
function cancelPlacement() {
  placingEquipment = false;
  placementCandidate = null;
  placementToken = null;
  ghost.visible = false;
  $('placementControls').classList.add('hidden');
}
function updatePlacement() {
  if (!placingEquipment) return;
  const body = selfBase();
  if (!body || myVehicle || turretIndex >= 0 || respawnAt) {
    cancelPlacement();
    return;
  }
  const w = { ...baseWorld(body), face: body.face };
  const p = placementAhead(w),
    candidate =
      body.grounded !== false
        ? supportedPlacement(
            p,
            colliders,
            [
              ...stations,
              ...(snap?.vehicles || [])
                .filter((v) => v.state.landed)
                .map((v) => ({
                  x: v.state.p[0],
                  y: v.state.p[1],
                  z: v.state.p[2],
                  clearance: (VEHICLES[v.type].span * ACTOR_UNIT) / 2,
                })),
            ],
            placementKind,
          )
        : null;
  placementCandidate = candidate;
  ghost.visible = true;
  ghost.position.set(p.x, candidate?.y ?? w.y, p.z);
  ghost.traverse((o) => {
    if (o.isMesh) o.material.color.set(candidate ? '#badb84' : '#e87b68');
  });
  $('placeConfirm').disabled = !candidate || purchaseBusy;
  $('placeConfirm').textContent = 'E · Poser · déjà payé';
  $('placementStatus').textContent = candidate
    ? 'Surface libre · E : poser · déjà payé'
    : 'Surface trop petite, occupée ou hors de portée';
}
$('shopOpen').onclick = toggleShop;
$('shopClose').onclick = toggleShop;
$('placeCancel').onclick = cancelPlacement;
$('placeConfirm').onclick = placePurchased;

const fallingEnemies = [];
function disposeCorpse(corpse) {
  scene.remove(corpse.g);
  sound.endFollowing(corpse.soundKey);
  corpse.g.traverse((o) => o.geometry?.dispose());
  for (const m of corpse.materials) m.dispose();
}
function fallEnemy(enemy) {
  const g = insects.get(enemy);
  if (!g) return;
  insects.delete(enemy);
  insectStatus.remove(enemy);
  const clones = new Map();
  g.traverse((o) => {
    if (o.isMesh) {
      if (!clones.has(o.material)) {
        const m = o.material.clone();
        m.transparent = true;
        m.userData.fadeBase = m.opacity;
        m.depthWrite = false;
        clones.set(o.material, m);
      }
      o.material = clones.get(o.material);
    }
  });
  for (const material of g.userData.disposables || []) material.dispose();
  fallingEnemies.push({
    g,
    ground: !!currentRoster()[enemy]?.ground,
    soundKey: 'fall:' + snap.wave + ':' + enemy,
    sounded: false,
    landed: false,
    materials: [...clones.values()],
    age: 0,
    v: (g.userData.velocity || new T.Vector3())
      .clone()
      .clampLength(0, MAP.metres(30))
      .multiplyScalar(0.4),
  });
  while (fallingEnemies.length > 80) disposeCorpse(fallingEnemies.shift());
}
function updateFallingEnemies(dt) {
  for (let i = fallingEnemies.length - 1; i >= 0; i--) {
    const c = fallingEnemies[i];
    c.age += dt;
    if (!c.ground && !c.sounded) {
      c.sounded = true;
      if (!respawnAt) sound.followOnce(c.soundKey, 'fall', c.g.position, { ref: 18 });
    }
    if (!c.ground && c.sounded && !respawnAt) sound.moveFollowing(c.soundKey, c.g.position);

    const previous = c.g.position.y;
    c.v.y -= MAP.metres(REFERENCE.gravity) * dt;
    c.v.multiplyScalar(Math.exp(-0.35 * dt));
    c.g.position.addScaledVector(c.v, dt);
    let floor = 0;
    for (const b of colliders)
      if (
        c.g.position.x >= b.min.x &&
        c.g.position.x <= b.max.x &&
        c.g.position.z >= b.min.z &&
        c.g.position.z <= b.max.z &&
        b.max.y <= previous + INSECT_SCALE
      )
        floor = Math.max(floor, b.max.y);
    if (c.g.position.y < floor + INSECT_SCALE * 0.25) {
      c.g.position.y = floor + INSECT_SCALE * 0.25;
      c.v.set(0, 0, 0);
      if (!c.landed) {
        c.landed = true;
        sound.endFollowing(c.soundKey);
      }
    } else {
      c.g.rotation.x += dt * 2.6;
      c.g.rotation.z += dt * 1.7;
    }
    const opacity = Math.max(0, 1 - c.age / 4);
    for (const m of c.materials) m.opacity = (m.userData.fadeBase ?? 1) * opacity;
    if (c.age >= 4) {
      disposeCorpse(c);
      fallingEnemies.splice(i, 1);
    }
  }
}

function pistol() {
  if (
    !joined ||
    !controlFocus.active ||
    boardingBusy ||
    soulBusy ||
    !canCapture() ||
    myVehicle ||
    turretIndex >= 0 ||
    (!onFoot && !respawnAt)
  )
    return;
  const purg = !!respawnAt,
    cam = purg ? purgCamera : camera,
    scale = purg ? 1 : MAP.ratio;
  cam.updateMatrixWorld();
  let dir = cam.getWorldDirection(new T.Vector3()),
    origin = cam.position.clone();
  let ray = new T.Raycaster(origin, dir, 0, 150 * scale);
  const shot = id + ':pistol:' + ++shotSequence;
  let hit = null;
  const consider = (model, meta) => {
    if (!model?.visible) return;
    model.updateWorldMatrix(true, true);
    const h = nearestMeshHit(ray, model);
    if (h && (!hit || h.distance < hit.distance)) hit = { ...h, ...meta };
  };
  const scan = () => {
    hit = null;
    if (purg) {
      for (const body of soulArena?.bodies || [])
        if (!body.gone && body.entity !== id)
          consider(
            soulMeshes.get(body.id),
            body.kind === 'enemy' ? { soul: body.id } : { target: body.entity },
          );
      const wallRay = new T.Ray(origin, dir);
      for (const box of purgColliders) {
        const point = wallRay.intersectBox(box, new T.Vector3());
        if (point && (!hit || point.distanceTo(origin) < hit.distance))
          hit = { wall: true, point, distance: point.distanceTo(origin) };
      }
    } else {
      const enemy = nearestInsectHit(
        T,
        origin,
        dir,
        new Map([...insects].filter(([i]) => !localKills.has(i))),
        150 * scale,
      );
      if (enemy) hit = { ...enemy, enemy: enemy.id };
      for (const v of snap.vehicles || []) consider(fleetModels.get(v.id), { vehicle: v.id });
      for (const p of snap.pilots)
        if (p.id !== id && p.life === 'alive' && !p.vehicle_id)
          consider(
            p.mode === 'turret' ? turrets[p.state.turret]?.userData.person : basePeople.get(p.id),
            { target: p.id },
          );
      const solid = new T.Ray(origin, dir);
      for (const box of colliders) {
        const point = solid.intersectBox(box, new T.Vector3());
        if (point && (!hit || point.distanceTo(origin) < hit.distance))
          hit = { wall: true, point, distance: point.distanceTo(origin) };
      }
    }
  };
  scan();
  const target = (hit?.point || origin.clone().addScaledVector(dir, 150 * scale))
      .clone()
      .addScaledVector(dir, 0.01 * scale),
    person = purg
      ? soulMeshes.get(soulArena?.bodies.find((b) => b.entity === id && b.kind === 'player')?.id)
      : basePeople.get(id);
  if (!person?.userData.pistolMuzzle) return;
  posePersonalWeapon(person, true, purg);
  const shotAim = muzzleAim(T, cam, person.userData.pistolMuzzle, target, 150 * scale);
  if (!shotAim) return;
  origin = shotAim.origin;
  dir = shotAim.direction;
  ray = new T.Raycaster(origin, dir, 0, shotAim.range);
  scan();
  sound.play('shot', origin, { ref: 12 });
  action('pistol-trace', {
    shot,
    origin: origin.toArray(),
    direction: dir.toArray(),
    incarnation: snap.pilots.find((p) => p.id === id)?.incarnation,
  });
  const targetScene = purg ? purgScene : scene;
  const line = makeTracer(T, targetScene, origin, dir, '#ffe48d');
  if (purg) line.scale.setScalar(scale / MAP.ratio);
  line.userData.until = performance.now() + 90;
  pistolTrails.push({ line, targetScene });
  while (pistolTrails.length > 64) {
    const old = pistolTrails.shift();
    old.targetScene.remove(old.line);
    old.line.userData.dispose();
  }
  if (hit?.soul) action('soul-hit', { soul: hit.soul, shot });
  else if (hit?.target)
    action('friendly-hit', {
      target: hit.target,
      shot,
      incarnation: snap.pilots.find((p) => p.id === hit.target)?.incarnation,
    });
  else if (hit?.vehicle) action('friendly-hit', { vehicle: hit.vehicle, shot });
  else if (hit?.enemy !== undefined) damageEnemy(hit.enemy, 10, shot, hit.point);
}

const pistolTrails = [];
function vehicleColor(v) {
  return new T.Color().setHSL(vehicleHue(v?.supplies?.sequence || 0) / 360, 0.58, 0.57);
}
let crewRenderKey = '';
function renderCrew() {
  const self = snap?.pilots.find((p) => p.id === id),
    panel = $('crewPanel');
  if (!panel) return;
  const vehicle = snap?.vehicles.find((v) => v.id === self?.vehicle_id);
  const previous = activeTransfer?.id;
  activeTransfer =
    snap?.seatRequests?.find(
      (r) =>
        (r.requester === id && r.status === 'signing') ||
        (r.recipient === id && r.status === 'offered'),
    ) || null;
  if (activeTransfer && activeTransfer.id !== previous) {
    boardingOpen = true;
    releaseMouse();
    paperContext = '';
  }
  panel.classList.toggle('hidden', !vehicle || VEHICLES[vehicle.type].seats.length < 2);
  const renderKey = JSON.stringify([
    self?.vehicle_id,
    self?.seat,
    vehicle?.seats,
    snap?.seatRequests,
  ]);
  if (renderKey === crewRenderKey) return;
  crewRenderKey = renderKey;
  panel.replaceChildren();
  if (!vehicle) return;
  const title = document.createElement('strong');
  title.textContent = 'Postes du ' + VEHICLES[vehicle.type].name;
  panel.append(title);
  const pending = snap.seatRequests?.find((r) => r.requester === id || r.recipient === id);
  if (pending) {
    const status = document.createElement('p');
    status.textContent =
      pending.status === 'offered'
        ? 'Demande signée · attente du collègue'
        : 'Contrat de transfert à signer';
    panel.append(status);
    const cancel = document.createElement('button');
    cancel.textContent = pending.recipient === id ? 'Refuser l’échange' : 'Annuler la demande';
    cancel.onclick = () => action('seat-reject', { request: pending.id });
    panel.append(cancel);
    if (activeTransfer) {
      const open = document.createElement('button');
      open.textContent = 'Ouvrir le contrat';
      open.onclick = () => {
        boardingOpen = true;
        renderPaper();
      };
      panel.append(open);
    }
  } else
    for (const seat of VEHICLES[vehicle.type].seats) {
      const occupant = vehicle.seats.find((s) => s.seat === seat),
        button = document.createElement('button');
      button.textContent =
        '[' +
        (VEHICLES[vehicle.type].seats.indexOf(seat) + 1) +
        '] ' +
        SEAT_NAMES[seat] +
        (occupant
          ? ' · ' + (snap.pilots.find((p) => p.id === occupant.pilot)?.name || 'Occupé')
          : ' · Libre') +
        (seat === self.seat ? ' · Vous' : '');
      button.disabled = seat === self.seat;
      button.classList.toggle('currentSeat', seat === self.seat);
      button.onclick = () => action('seat-request', { seat });
      panel.append(button);
    }
}

$('personalFire').onpointerdown = (e) => {
  e.preventDefault();
  if (controlFocus.touch && !controlFocus.active) controlFocus.capture();
  pistol();
};

const vacantAircraft = new Map();
function simulateVacantAircraft(dt) {
  if (!snap) return;
  const host = [...snap.pilots].sort((a, b) => a.id.localeCompare(b.id))[0]?.id;
  if (host !== id) {
    vacantAircraft.clear();
    return;
  }
  const active = new Set();
  for (const v of snap.vehicles) {
    if (v.state.hp <= 0 || v.seats.some((s) => s.seat === 'pilot')) continue;

    active.add(v.id);
    let s = vacantAircraft.get(v.id);
    if (!s) {
      s = structuredClone(v.state);
      vacantAircraft.set(v.id, s);
    }
    s.fuelAvailable = v.supplies?.fuel > 0;
    if (v.type === 'tank') stepTank(T, s, { forward: 0, turn: 0 }, colliders, dt, VEHICLES.tank);
    else stepVacantAircraft(T, s, upgradedVehicle(VEHICLES[v.type], snap.upgrades), colliders, dt);
    Object.assign(v.state, s);
  }
  for (const key of vacantAircraft.keys()) if (!active.has(key)) vacantAircraft.delete(key);
}

function equipPistolModel(person) {
  if (person.userData.pistolMuzzle) return;
  const arm = person.userData.arms?.[1];
  if (!arm) return;
  const gun = new T.Group();
  pm(gun, 0.12, 0.38, 0.12, '#364638', 0, -0.42, 0.05);
  pm(gun, 0.14, 0.12, 0.2, '#795f42', 0, -0.25, 0);
  const muzzle = new T.Object3D();
  muzzle.position.set(0, -0.64, 0.05);
  gun.add(muzzle);
  arm.elbow.add(gun);
  person.userData.pistolMuzzle = muzzle;
}
function posePersonalWeapon(person, own, purg = false) {
  const cam = purg ? purgCamera : camera;
  const direction = own
    ? cam.getWorldDirection(new T.Vector3())
    : new T.Vector3(0, 0, 1).applyQuaternion(person.quaternion);
  if (own) person.rotation.y = Math.atan2(direction.x, direction.z);
  aimPistol(T, person, direction);
}

function remainingFuel() {
  const supply = myVehicle?.supplies;
  if (!supply) return 300;
  if (supply.servicing) return supply.fuel;
  const age = Math.max(0, (performance.now() - (snap.receivedAt || performance.now())) / 1000);
  return Math.max(0, supply.fuel - (engine ? gas * age : 0));
}
function currentFactors() {
  return clauseFactors(snap?.pilots.find((p) => p.id === id)?.contractClause);
}
function installationModel(st) {
  const g = new T.Group();
  g.position.set(st.x, st.y, st.z);
  g.scale.setScalar(MAP.ratio);
  scene.add(g);
  box(0, 0.15, 0, 4, 0.3, 3, st.kind === 'radar' ? '#527b87' : '#bb8c44', g);
  if (st.kind === 'bed') {
    box(0, 0.45, 0, 1.6, 0.35, 3, '#e2d6ad', g);
    box(0, 0.7, -1, 1.35, 0.2, 0.65, '#f7edcb', g);
    for (const x of [-0.65, 0.65])
      for (const z of [-1.2, 1.2]) box(x, 0.15, z, 0.15, 0.3, 0.15, '#664e34', g);
    return g;
  }
  if (st.kind === 'radar') {
    cyl(0, 2, 0, 0.18, 0.25, 4, '#d3dbbf', g);
    box(0, 4, 0, 3, 1.5, 0.2, '#7fbdad', g);
  } else {
    cyl(-1, 0.9, 0, 0.6, 0.6, 1.5, '#d9b958', g);
    box(0.8, 1, 0, 1, 1.7, 0.9, '#557a69', g);
    const ring = new T.Mesh(
      new T.RingGeometry(39.5, 40, 64),
      new T.MeshBasicMaterial({
        color: '#d9b958',
        side: T.DoubleSide,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    ring.userData.projectileSolid = false;
    g.add(ring);
  }
  return g;
}

$('paperTear').onclick = async () => {
  if (boardingBusy || soulBusy || $('papers').classList.contains('hidden')) return;
  const annex = pendingAnnex();
  let message = '';
  boardingBusy = true;
  $('paperTear').disabled = true;
  $('signClear').disabled = true;
  $('signSubmit').disabled = true;
  clearSignature();
  $('stampEcho').classList.remove('show');
  $('papers').classList.add('tearing');
  try {
    const result = annex
      ? await api('dossier-choice', { id, token: annex.token, choice: 'tear' })
      : null;
    await new Promise((resolve) => setTimeout(resolve, 320));
    replacementCounter++;
    if (result) accept(result);
    message = annex ? 'Feuillet déchiré.' : 'Document déchiré · Un nouvel exemplaire vous attend.';
  } catch (e) {
    message = e.message;
  } finally {
    boardingBusy = false;
    $('papers').classList.remove('tearing');
    paperContext = '';
    renderPaper();
    $('paperMessage').textContent = message;
  }
};

function currentAmmoKey() {
  return myVehicle?.type === 'tank' && crewSeat === 'cannon' ? 'coax' : crewSeat;
}
function hasAmmo() {
  return (
    !myVehicle ||
    aircraftFire.available(myVehicle.id, crewSeat, myVehicle.supplies, currentAmmoKey()) >=
      (myVehicle.type === 'spitfire' ? 6 : 1)
  );
}
let nextHeavyAt = 0;
async function fireHeavy(weapon = null) {
  if (
    !joined ||
    respawnAt ||
    !myVehicle ||
    heavyPending ||
    !controlFocus.active ||
    (myVehicle.type === 'tank' && crewSeat === 'cannon' && keys.KeyC) ||
    performance.now() < nextHeavyAt
  )
    return;
  weapon ??=
    myVehicle.type === 'tank' && crewSeat === 'cannon'
      ? availableShell(myVehicle.supplies.ammo, selectedShell)
      : crewSeat === 'pilot'
        ? 'bomb'
        : null;
  if (!weapon || !HEAVY[weapon] || (myVehicle.supplies.ammo[weapon] || 0) < 1) return;
  const state = localMotion();
  heavyPending = true;
  nextHeavyAt = performance.now() + HEAVY[weapon].interval * 1000 * currentFactors().interval;
  try {
    accept(
      await api('heavy-fire', {
        id,
        vehicle: myVehicle.id,
        occupation: snap.pilots.find((p) => p.id === id).occupation,
        state,
        weapon,
        shot: id + ':heavy:' + ++shotSequence,
        direction: weaponDirection().toArray(),
      }),
    );
    selectedShell = availableShell(myVehicle?.supplies?.ammo || {}, selectedShell) || selectedShell;
    sound.play(weapon === 'bomb' ? 'exit' : 'flak', me.position, { ref: 25 });
  } catch (e) {
    notify(e.message, 2);
  } finally {
    heavyPending = false;
  }
}
const ordnanceModels = new Map();
function updateOrdnance(dt) {
  const active = new Set();
  for (const shot of snap?.ordnance || []) {
    active.add(shot.shot);
    let model = ordnanceModels.get(shot.shot);
    if (!model) {
      model =
        shot.weapon === 'bomb'
          ? makeBomb()
          : new T.Mesh(
              shot.weapon === 'ap'
                ? new T.ConeGeometry(MAP.metres(0.22), MAP.metres(1.8), 8)
                : new T.CylinderGeometry(MAP.metres(0.16), MAP.metres(0.32), MAP.metres(1.2), 8),
              new T.MeshBasicMaterial({
                color: new T.Color().setHSL(vehicleHue(shot.sequence || 0) / 360, 0.58, 0.57),
              }),
            );
      if (shot.weapon === 'bomb') {
        model.scale.setScalar(MAP.metres(0.8));
        model.traverse((o) => {
          if (o.isMesh) {
            o.material = o.material.clone();
            o.material.color.setHSL(vehicleHue(shot.sequence || 0) / 360, 0.58, 0.57);
          }
        });
      }
      model.userData.projectileSolid = false;
      scene.add(model);
      ordnanceModels.set(shot.shot, model);
    }
    const lag = Math.max(0, Math.min(0.25, (Date.now() + clockOffset - shot.updated) / 1000));
    model.position.fromArray(shot.p).addScaledVector(new T.Vector3().fromArray(shot.v), lag);
    if (Math.hypot(...shot.v) > 1e-8)
      model.quaternion.setFromUnitVectors(
        shot.weapon === 'bomb' ? new T.Vector3(0, 0, -1) : new T.Vector3(0, 1, 0),
        new T.Vector3().fromArray(shot.v).normalize(),
      );
  }
  for (const [id, model] of ordnanceModels)
    if (!active.has(id)) {
      scene.remove(model);
      model.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      ordnanceModels.delete(id);
    }
}

const contextHUD = new ContextHUD($('contextHUD'));
function updateContextHUD() {
  const modal = !canCapture();
  const model =
    joined && !modal
      ? equipmentHUD({
          vehicle: myVehicle,
          seat: crewSeat,
          turret: turretIndex >= 0,
          dead: !!respawnAt,
          hp,
          speed: (vel.length() / MAP.ratio) * 3.6,
          altitude: Math.max(0, me.position.y),
          gas,
          fuel: remainingFuel(),
          ammo: myVehicle
            ? aircraftFire.available(myVehicle.id, crewSeat, myVehicle.supplies, currentAmmoKey())
            : 0,
          shell: selectedShell,
          range: flakRange,
          ready:
            turretIndex >= 0 ? cooldown <= 0 : performance.now() >= nextHeavyAt && !heavyPending,
          stall: !$('stallWarning').classList.contains('hidden'),
        })
      : null;
  contextHUD.update(model);
  const range = model?.readout;
  $('aimRange').classList.toggle('hidden', !range);
  if (range) {
    $('aimDistance').textContent = range.metres.toFixed(3) + ' m';
    $('aimGauge').value = range.fraction;
    $('aimRange').style.left = `calc(${$('crosshair').style.left || '50%'} + 25px)`;
    $('aimRange').style.top = `calc(${$('crosshair').style.top || '50%'} + 18px)`;
  }
}
const bankUI = new BankUI({
  root: $('bank'),
  document,
  snapshot: () => snap,
  command: (path, body) => api(path, { id, ...body }),
  accept,
  onOpen: () => {
    releaseMouse();
    cancelPlacement();
    $('shop').classList.add('hidden');
    $('help').classList.add('hidden');
    renderPaper();
  },
  onClose: () => {
    renderPaper();
    captureMouse();
  },
  archive: (record) => {
    paperArchive.push(record);
    try {
      sessionStorage.setItem('moucheron-dossier:' + room, JSON.stringify(paperArchive));
    } catch {}
    renderArchive();
    sound.play('stamp', paperSource(), { ref: 6 });
  },
});
function toggleBank() {
  if (bedUI.opened || purchaseUI.opened) return;
  if (!joined || boardingBusy || soulBusy || boardingSelectionBusy) return;
  if (bankUI.opened) bankUI.close();
  else bankUI.open();
}
$('bankOpen').onclick = toggleBank;

const bedUI = new BedUI({
  root: $('bedPanel'),
  snapshot: () => snap,
  command: (body) => api('bed-contract', { id, ...body }),
  accept,
  ground: groundReport,
  onOpen: () => {
    releaseMouse();
    $('shop').classList.add('hidden');
    $('help').classList.add('hidden');
    renderPaper();
  },
  onClose: () => {
    renderPaper();
    captureMouse();
  },
  archive: (record) => {
    paperArchive.push(record);
    renderArchive();
    try {
      sessionStorage.setItem('moucheron-dossier:' + room, JSON.stringify(paperArchive));
    } catch {}
    notify('Contrat de réapparition enregistré', 3);
  },
});

const interactionTiming = new InteractionTiming();
function beginBoardingFeedback(kind, seat) {
  const timing = interactionTiming.begin(kind);
  $('boardingPending').textContent = 'Préparation du dossier · ' + (SEAT_NAMES[seat] || seat) + '…';
  $('boardingPending').classList.remove('hidden');
  timing.mark('feedback');
  return timing;
}
function finishBoardingFeedback(timing, status) {
  $('boardingPending').classList.add('hidden');
  timing.finish(status);
}
// Read-only development diagnostics; no body positions, names or credentials.
Object.defineProperty(globalThis, 'moucheronInteractionTimings', {
  get: () => structuredClone(interactionTiming.records),
});

function beginPlacement(order) {
  cancelPlacement();
  placementToken = order.token;
  placementKind = order.item;
  ghost = ghosts[order.item];
  placingEquipment = true;
  $('shop').classList.add('hidden');
  $('placementControls').classList.remove('hidden');
  notify('Achat payé · E : poser · Échap : conserver pour plus tard', 4);
  captureMouse();
}
async function placePurchased() {
  if (!placementCandidate || !placementToken || purchaseBusy || !canCapture()) return;
  purchaseBusy = true;
  const token = placementToken;
  try {
    const self = snap.pilots.find((p) => p.id === id);
    accept(
      await api('place-purchase', {
        id,
        token,
        epoch: snap.base.epoch,
        incarnation: self.incarnation,
        ground: groundReport(),
        position: placementCandidate,
      }),
    );
    cancelPlacement();
    sound.play('board', camera.position, { ref: 8 });
  } catch (e) {
    notify(e.message, 4);
  } finally {
    purchaseBusy = false;
    renderShop();
  }
}
const purchaseUI = new PurchaseUI({
  root: $('purchasePanel'),
  snapshot: () => snap,
  ground: groundReport,
  command: (body) =>
    api('purchase-sign', {
      id,
      ...body,
      item: purchaseUI.item,
      request: purchaseUI.request,
      expectedPrice: purchaseUI.price,
    }),
  accept,
  onOpen: () => {
    releaseMouse();
    $('shop').classList.add('hidden');
    renderPaper();
  },
  onClose: () => {
    renderPaper();
    const order = snap?.purchases?.find((o) => o.token === purchaseUI.request && o.owner === id);
    if (order && !purchaseUI.invalidated) beginPlacement(order);
    else captureMouse();
  },
  archive: (record) => {
    paperArchive.push({ ...record, title: 'Bon de commande · ' + SHOP[purchaseUI.item].name });
    renderArchive();
  },
});

let nextWashAt = 0,
  washPending = false,
  reticleKey = '';
const sprays = new Map(),
  cleanStars = [];
function addCleanStars(e) {
  if (Date.now() + clockOffset - e.at > 1500) return;
  const positions = new Float32Array(24 * 3);
  for (let i = 0; i < 24; i++) {
    const a = i * 2.39996;
    positions.set(
      [
        e.p[0] + Math.cos(a) * MAP.metres(3),
        e.p[1] + MAP.metres(1 + (i % 4)),
        e.p[2] + Math.sin(a) * MAP.metres(3),
      ],
      i * 3,
    );
  }
  const geometry = new T.BufferGeometry().setAttribute(
    'position',
    new T.BufferAttribute(positions, 3),
  );
  const model = new T.Points(
    geometry,
    new T.PointsMaterial({
      color: '#fff9a2',
      size: MAP.metres(0.45),
      transparent: true,
      depthWrite: false,
    }),
  );
  scene.add(model);
  cleanStars.push({ model, life: 1 });
  while (cleanStars.length > 16) {
    const old = cleanStars.shift();
    scene.remove(old.model);
    old.model.geometry.dispose();
    old.model.material.dispose();
  }
}
function updateVehicleCare(dt) {
  const now = performance.now();
  while (pistolTrails.length > 64) {
    const old = pistolTrails.shift();
    old.targetScene.remove(old.line);
    old.line.userData.dispose();
  }
  for (let i = pistolTrails.length - 1; i >= 0; i--)
    if (now > pistolTrails[i].line.userData.until) {
      const { line, targetScene } = pistolTrails.splice(i, 1)[0];
      targetScene.remove(line);
      line.userData.dispose();
    }
  for (const v of snap?.vehicles || []) {
    const paint = fleetModels.get(v.id)?.userData.paint;
    if (paint)
      paint.color
        .copy(vehicleColor(v))
        .lerp(new T.Color('#5b5131'), Math.min(1, v.dirt || 0) * 0.8);
  }
  const dirt = !respawnAt && myVehicle ? myVehicle.dirt || 0 : 0;
  $('dirtView').style.opacity = String(Math.min(1, dirt) * WASH.maxOpacity);
  $('dirtWarning').classList.toggle('hidden', dirt < WASH.warning);
  const local =
    joined &&
    !myVehicle &&
    turretIndex < 0 &&
    groundActive() &&
    keys.Space &&
    (respawnAt || selfBase()?.grounded !== false);
  const active = new Map();
  if (local) {
    const origin = camera.position.clone();
    const person = respawnAt
      ? soulArena?.bodies.find((b) => b.entity === id && b.kind === 'player')
      : selfBase();
    const scale = respawnAt ? 1 : MAP.ratio;
    if (person) {
      const w = respawnAt ? person : baseWorld(person);
      origin.set(w.x, (w.y || 0) + 0.9 * scale, w.z);
    }
    const direction = camera.getWorldDirection(new T.Vector3());
    active.set(id, {
      origin: origin.toArray(),
      direction: direction.toArray(),
      targetScene: respawnAt ? purgScene : scene,
    });
    if (!respawnAt && now >= nextWashAt && !washPending) {
      nextWashAt = now + 200;
      washPending = true;
      const self = snap.pilots.find((p) => p.id === id);
      api('wash', {
        id,
        direction: direction.toArray(),
        ground: groundReport(),
        epoch: snap.base.epoch,
        incarnation: self.incarnation,
      })
        .then(accept)
        .catch((e) => notify(e.message, 2))
        .finally(() => {
          washPending = false;
        });
    }
  }
  for (const p of snap?.pilots || [])
    if (
      p.id !== id &&
      p.life === 'alive' &&
      p.mode === 'foot' &&
      p.state.washing &&
      Date.now() + clockOffset - p.state.washing.at < 350
    )
      active.set(p.id, { ...p.state.washing, targetScene: scene });
  for (const [key, stream] of active) {
    let spray = sprays.get(key);
    if (!spray || spray.parent !== stream.targetScene) {
      if (spray) {
        spray.parent.remove(spray);
        spray.geometry.dispose();
        spray.material.dispose();
      }
      const geometry = new T.BufferGeometry().setAttribute(
        'position',
        new T.BufferAttribute(new Float32Array(28 * 3), 3),
      );
      spray = new T.Points(
        geometry,
        new T.PointsMaterial({
          color: '#f2dd73',
          size: 0.001,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        }),
      );
      stream.targetScene.add(spray);
      sprays.set(key, spray);
    }
    const pos = spray.geometry.attributes.position;
    const origin = new T.Vector3().fromArray(stream.origin),
      direction = new T.Vector3().fromArray(stream.direction).normalize();
    // Decorative particles stop at the first physical surface. Damage/cleaning remains server-owned.
    let range = WASH.range;
    const ray = new T.Ray(origin, direction);
    for (const b of stream.targetScene === scene ? colliders : purgColliders) {
      const hit = ray.intersectBox(b, new T.Vector3());
      if (hit) range = Math.min(range, hit.distanceTo(origin));
    }
    for (let i = 0; i < 28; i++) {
      const t = ((now / 180 + i / 28) % 1) * range;
      const point = origin.clone().addScaledVector(direction, t);
      pos.setXYZ(i, point.x, point.y, point.z);
    }
    pos.needsUpdate = true;
    spray.geometry.computeBoundingSphere();
  }
  for (const [key, spray] of sprays)
    if (!active.has(key)) {
      spray.parent.remove(spray);
      spray.geometry.dispose();
      spray.material.dispose();
      sprays.delete(key);
    }
  for (let i = cleanStars.length - 1; i >= 0; i--) {
    const star = cleanStars[i];
    star.life -= dt;
    star.model.material.opacity = Math.max(0, star.life);
    star.model.position.y += dt * MAP.metres(2);
    if (star.life <= 0) {
      scene.remove(star.model);
      star.model.geometry.dispose();
      star.model.material.dispose();
      cleanStars.splice(i, 1);
    }
  }
}
function updateTankReticle() {
  const shown =
    joined &&
    myVehicle?.type === 'tank' &&
    crewSeat === 'cannon' &&
    !keys.KeyC &&
    !respawnAt &&
    canCapture();
  const root = $('tankReticle');
  root.classList.toggle('hidden', !shown);
  if (!shown) return;
  const direction = weaponDirection(),
    weapon = availableShell(myVehicle.supplies.ammo, selectedShell) || selectedShell;
  const carrier = myVehicle.state.v,
    key = JSON.stringify([
      weapon,
      direction.toArray().map((n) => Math.round(n * 100)),
      carrier.map((n) => Math.round(n * 1000)),
      camera.fov,
      innerWidth,
      innerHeight,
    ]);
  if (reticleKey === key) return;
  reticleKey = key;
  root.replaceChildren();
  const origin = me.userData.turrets[0].userData.muzzle.getWorldPosition(new T.Vector3());
  let previousLabelY = -Infinity;
  for (const mark of ballisticMarks(weapon, direction.toArray(), carrier)) {
    const projected = origin.clone().add(new T.Vector3().fromArray(mark.point)).project(camera);
    if (Math.abs(projected.y) > 0.9 || Math.abs(projected.x) > 0.9 || projected.z > 1) continue;
    const pixelY = ((50 - projected.y * 50) * innerHeight) / 100;
    if (Math.abs(pixelY - innerHeight / 2) < 12 || Math.abs(pixelY - previousLabelY) < 14) continue;
    previousLabelY = pixelY;
    const tick = document.createElement('span');
    tick.textContent = '— ' + mark.metres.toFixed(2) + ' m';
    tick.style.left = 'calc(' + (50 + projected.x * 50) + '% + 12px)';
    tick.style.top = 50 - projected.y * 50 + '%';
    root.append(tick);
  }
}
