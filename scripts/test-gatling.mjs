// Tourelle automatique Gatling : règles, cadence, modèle articulé, rotation du
// faisceau, tirs visuels étalés et boucle sonore continue.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../vendor/three.module.min.js';
import { Game } from '../server/game.js';
import { VEHICLES } from '../src/fleet.ts';
import { newGroundDefense, groundCommand } from '../src/ground-defense-state.ts';
import { SENTRY, GATLING, fireGroundSentries } from '../src/ground-sentry.ts';
import { advancePaidService } from '../src/paid-service.ts';
import { AIRDROP_KINDS, airdropCommand } from '../src/airdrop.ts';
import { MODEL_DATA } from '../src/meshy-gatling-data.js';
import {
  createGatlingModel,
  stepGatlingSpin,
  firingBarrel,
  GATLING_MAX_SPIN,
  GATLING_SCALE,
  GATLING_MAX_ELEVATION,
} from '../src/gatling-model.ts';
import { GroundDefenseUI } from '../src/ground-defense-ui.js';
import { synthesize, AUDIO_PROFILES } from '../src/game-audio/synth.ts';
import { createGroundModel } from '../src/ground-model.ts';
import { swarmFrame } from '../src/waves.js';

// --- Règles demandées -------------------------------------------------------
assert.equal(GATLING.cost, 25);
assert.equal(GATLING.hp, 150);
assert.equal(GATLING.damage, 30);
assert.equal(GATLING.ammo, 1000);
assert.equal(GATLING.range, SENTRY.range, 'même portée que la tourelle automatique');
assert.ok(Math.abs(1000 / GATLING.intervalMs - 12) < 1e-9, '12 tirs par seconde');

// La Gatling ne s'achète plus : on y arrive en améliorant une tourelle automatique.
const asCastor = { castor: true };
function placeGatling(state, a, dollars = 999, now = 0) {
  groundCommand(state, { action: 'build', kind: 'sentry', a }, a, dollars, now, asCastor);
  const built = state.structures.at(-1);
  groundCommand(state, { action: 'upgrade', id: built.id, variant: 'gatling' }, a, dollars, now);
  return built;
}
const defense = newGroundDefense();
assert.throws(
  () =>
    groundCommand(
      defense,
      { action: 'build', kind: 'gatling', a: [0, 0] },
      [0, 0],
      99,
      1,
      asCastor,
    ),
  /invalide/,
  'la Gatling ne se construit pas directement',
);
groundCommand(defense, { action: 'build', kind: 'sentry', a: [0, 0] }, [0, 0], 99, 1, asCastor);
const id = defense.structures[0].id;
assert.throws(
  () => groundCommand(defense, { action: 'upgrade', id, variant: 'gatling' }, [0, 0], 24.9),
  /insuffisante/,
);
assert.equal(defense.structures[0].kind, 'sentry', 'refus : rien ne change');
const bought = groundCommand(defense, { action: 'upgrade', id, variant: 'gatling' }, [0, 0], 50);
assert.equal(bought.price, 25);
const gun = defense.structures[0];
assert.deepEqual([gun.kind, gun.hp, gun.maxHp, gun.ammo], ['gatling', 150, 150, 1000]);
assert.throws(
  () =>
    groundCommand(
      defense,
      { action: 'build', kind: 'sentry', a: [0, 0.01] },
      [0, 0],
      50,
      1,
      asCastor,
    ),
  /occupé/,
  'une Gatling occupe son emplacement comme les autres tourelles',
);
// Plafond partagé par les deux types de tourelle.
const crowd = newGroundDefense();
for (let i = 0; i < SENTRY.maxPerRoom; i++) {
  const at = [(i % 6) * 0.05, Math.floor(i / 6) * 0.05];
  if (i % 2) placeGatling(crowd, at);
  else groundCommand(crowd, { action: 'build', kind: 'sentry', a: at }, at, 999, 1, asCastor);
}
assert.throws(
  () =>
    groundCommand(
      crowd,
      { action: 'build', kind: 'sentry', a: [0.5, 0.5] },
      [0.5, 0.5],
      999,
      1,
      asCastor,
    ),
  /maximal/,
);

// --- Cadence : 12 tirs/s malgré un tick serveur de 250 ms ------------------------
const range = newGroundDefense();
placeGatling(range, [0, 0], 99);
const turret = range.structures[0];
const damage = [];
let shots = 0;
for (let now = 1000; now <= 11000; now += 250)
  shots += fireGroundSentries(range.structures, [{ id: 1, p: [0.1, 0, 0] }], now, (t, s, d) => {
    damage.push(d);
  });
assert.ok(shots >= 120 && shots <= 121, '10 s de feu continu = 120 tirs, obtenu ' + shots);
assert.ok(damage.every((d) => d === 30));
assert.equal(turret.ammo, 1000 - shots);
assert.deepEqual(turret.aimTarget, [0.1, 0, 0]);
// Hors portée : aucun tir, aucune munition perdue.
const before = turret.ammo;
assert.equal(
  fireGroundSentries(range.structures, [{ id: 1, p: [0.9, 0, 0] }], 12000, () => {}),
  0,
);
assert.equal(turret.ammo, before);
// Inactive puis cible : un seul tir au départ, pas de rafale de rattrapage.
assert.equal(
  fireGroundSentries(range.structures, [{ id: 1, p: [0.1, 0, 0] }], 20000, () => {}),
  1,
);
// Une cible tuée au premier tir n'est pas touchée deux fois dans le même tick.
const dying = newGroundDefense();
placeGatling(dying, [0, 0], 99);
const victim = { id: 7, p: [0.1, 0, 0], dead: false };
dying.structures[0].lastShotAt = 1000;
const hitIds = [];
fireGroundSentries(dying.structures, [victim], 1400, (t) => {
  hitIds.push(t.id);
  t.dead = true;
});
assert.deepEqual(hitIds, [7], 'pas de second tir sur une cible déjà abattue');
// Les munitions limitent les tirs.
const low = newGroundDefense();
placeGatling(low, [0, 0], 99);
low.structures[0].ammo = 1;
low.structures[0].lastShotAt = 1000;
assert.equal(
  fireGroundSentries(low.structures, [{ id: 1, p: [0.1, 0, 0] }], 1400, () => {}),
  1,
);
assert.equal(low.structures[0].ammo, 0);

// --- Recharge payante jusqu'à 1000 ---------------------------------------------
turret.ammo = 10;
for (let i = 0; i < 2; i++)
  advancePaidService([], [{ kind: 'refuel', x: 0, y: 0, z: 0 }], 1000, {}, 5, range);
assert.equal(
  turret.ammo,
  1000,
  'recharge payante jusqu’à la capacité de la Gatling (5 s = moitié, comme tout équipement)',
);

// --- Castor et Castor volant -------------------------------------------------------
assert.ok(!AIRDROP_KINDS.includes('gatling'), 'la Gatling ne se largue pas : elle s’améliore');
const tools = new GroundDefenseUI({
  T,
  scene: new T.Scene(),
  command: async () => true,
  snapshot: () => null,
  available: () => true,
  enabled: () => true,
  notify: () => {},
  releaseMouse: () => {},
  builder: () => null,
  document: {
    createElement: () => ({ style: {}, append() {}, setAttribute() {}, classList: { add() {} } }),
    body: { append() {} },
  },
}).tools;
assert.ok(
  !tools.some(([kind]) => kind === 'gatling'),
  'la Gatling n’est plus dans le menu d’achat',
);

// --- Modèle : quatre pièces, un seul atlas, rotation du faisceau ---------------------
assert.equal(
  MODEL_DATA.sourceSha256,
  'a2a4e7eb9b42aed070b12c1a004ef4b998275b205c033f451f8dda9b39c07920',
);
assert.deepEqual(
  MODEL_DATA.parts.map((p) => p.part),
  ['socle', 'tete', 'rotor', 'anneau'],
);
assert.equal(
  MODEL_DATA.parts.reduce((n, p) => n + p.triangles, 0),
  MODEL_DATA.triangles,
  'aucun triangle perdu',
);
assert.ok(MODEL_DATA.texture.startsWith('data:image/webp;base64,'));
assert.equal(MODEL_DATA.rotor.barrels, 6);
const model = createGatlingModel(T);
const { group, yaw, pitch, barrel, spin, barrels, muzzle } = model;
assert.equal(group.scale.x, GATLING_SCALE);
assert.equal(yaw.parent, group);
assert.equal(pitch.parent, yaw);
assert.equal(barrel.parent, pitch);
assert.equal(spin.parent, barrel);
assert.equal(muzzle.parent, barrel, 'la bouche ne tourne pas sur elle-même');
assert.equal(group.getObjectByName('socle-fixe').parent, group, 'le socle ne bouge jamais');
const head = group.getObjectByName('tete-gatling');
assert.equal(head.parent, pitch, 'toute la tête se lève avec le pivot d’élévation');
assert.equal(group.getObjectByName('faisceau-canons').parent, spin, 'tous les canons tournent');
// La base circulaire du faisceau suit les canons mais ne tourne pas sur elle-même.
const base = group.getObjectByName('anneau-faisceau');
assert.equal(base.parent, barrel, 'l’anneau suit l’élévation du canon');
assert.notEqual(base.parent, spin);
base.geometry.computeBoundingBox();
const baseBox = base.geometry.boundingBox;
assert.ok(Math.abs((baseBox.min.x + baseBox.max.x) / 2) < 0.004, 'anneau centré sur l’axe (X)');
// 0,009 unité (0,2 mm) de décalage vient du modèle Meshy : ses canons sont un peu bas dans l'ouverture.
assert.ok(Math.abs((baseBox.min.y + baseBox.max.y) / 2) < 0.012, 'anneau centré sur l’axe (Y)');
// Pivot d'élévation : sommet de la couronne, sur l'axe de lacet.
const [ex, ey, ez] = MODEL_DATA.elevation;
assert.deepEqual([pitch.position.x, pitch.position.y, pitch.position.z], [ex, ey, ez]);
// Tout ce qui est au-dessus du pivot se lève d'un bloc ; le point du pivot reste immobile.
const pivotPoint = () => new T.Vector3(ex, ey, ez).applyMatrix4(head.matrixWorld);
const upright = () =>
  new T.Vector3(0, 1, 0).applyQuaternion(head.getWorldQuaternion(new T.Quaternion()));
group.updateMatrixWorld(true);
const restPivot = pivotPoint();
const restLed = model.lens.getWorldPosition(new T.Vector3());
const restSocle = new T.Box3().setFromObject(group.getObjectByName('socle-fixe'));
pitch.rotation.x = 0.7;
group.updateMatrixWorld(true);
assert.ok(pivotPoint().distanceTo(restPivot) < 1e-9, 'le pivot ne bouge pas');
const forward = new T.Vector3(0, 0, -1).applyQuaternion(
  head.getWorldQuaternion(new T.Quaternion()),
);
assert.ok(Math.abs(forward.y - Math.sin(0.7)) < 1e-9, 'la tête se lève de l’angle demandé');
assert.ok(upright().z > 0.6, 'le haut de la tête bascule vers l’arrière');
const tiltedLed = model.lens.getWorldPosition(new T.Vector3());
assert.ok(tiltedLed.distanceTo(restLed) > 0.003, 'le radar et son témoin suivent la tête');
const along = new T.Vector3(0, 0, -1).applyQuaternion(base.getWorldQuaternion(new T.Quaternion()));
const aimed = muzzle
  .getWorldPosition(new T.Vector3())
  .sub(barrel.getWorldPosition(new T.Vector3()))
  .normalize();
assert.ok(along.distanceTo(aimed) < 1e-6, 'l’anneau pointe dans le sens du canon');
assert.ok(forward.distanceTo(aimed) < 1e-6, 'tête, anneau et canons pointent ensemble');
assert.ok(
  new T.Box3().setFromObject(group.getObjectByName('socle-fixe')).equals(restSocle),
  'le socle reste immobile',
);
pitch.rotation.x = 0;
group.updateMatrixWorld(true);
assert.equal(barrels.length, 6);
assert.ok(barrels.every((b) => b.parent === spin));
assert.equal(
  GATLING_MAX_ELEVATION,
  (45 * Math.PI) / 180,
  'au-delà de 45° la tête s’enfonce dans le socle',
);
const materials = new Set();
group.traverse((o) => o.isMesh && o.userData.meshyShared && materials.add(o.material));
assert.equal(materials.size, 1, 'les quatre pièces partagent l’atlas Meshy');
// Le faisceau est centré sur l'axe de rotation et à symétrie sextuple.
const rotor = group.getObjectByName('faisceau-canons').geometry;
rotor.computeBoundingBox();
const box = rotor.boundingBox;
assert.ok(Math.abs((box.min.x + box.max.x) / 2) < 0.004, 'faisceau centré en X sur l’axe');
assert.ok(Math.abs((box.min.y + box.max.y) / 2) < 0.004, 'faisceau centré en Y sur l’axe');
const radii = barrels.map((b) => Math.hypot(b.position.x, b.position.y));
assert.ok(
  Math.max(...radii) - Math.min(...radii) < 0.01, // le maillage Meshy source n'est pas parfaitement régulier
  'six canons sur un même cercle',
);
const angles = barrels.map((b) => Math.atan2(b.position.y, b.position.x)).sort((a, b) => a - b);
for (let i = 0; i < 6; i++) {
  const gap = (angles[(i + 1) % 6] - angles[i] + 2 * Math.PI) % (2 * Math.PI);
  assert.ok(Math.abs(gap - Math.PI / 3) < 0.12, 'canons espacés de 60°');
}
// Tourner de 60° ramène chaque bouche à la place d'une autre.
spin.rotation.z = Math.PI / 3;
spin.updateMatrixWorld(true);
const rotated = barrels.map((b) => b.getWorldPosition(new T.Vector3()));
group.updateMatrixWorld(true);
const rest = [];
spin.rotation.z = 0;
spin.updateMatrixWorld(true);
for (const b of barrels) rest.push(b.getWorldPosition(new T.Vector3()));
for (const p of rotated)
  assert.ok(
    rest.some((q) => q.distanceTo(p) < 0.0004),
    'symétrie du faisceau',
  );
// Le faisceau reste exactement sur l'axe quand il pivote.
const axisOf = (angle) => {
  spin.rotation.z = angle;
  group.updateMatrixWorld(true);
  return muzzle.getWorldPosition(new T.Vector3());
};
assert.ok(axisOf(0).distanceTo(axisOf(1.3)) < 1e-9, 'la bouche centrale ne bouge pas');
// Dimensions : ~16 mm de haut, canons ~8 mm.
const size = new T.Box3().setFromObject(group).getSize(new T.Vector3());
assert.ok(size.y > 0.014 && size.y < 0.018, 'hauteur ' + size.y);
// Le modèle est aussi construit pour l'aperçu et la pose.
const preview = createGroundModel(T, { kind: 'gatling', position: [0, 0], angle: 0, hp: 150 });
assert.ok(preview.userData.sentry?.spin);

// --- Inertie du faisceau -------------------------------------------------------------
const wheel = { angle: 0, speed: 0 };
for (let i = 0; i < 90; i++) stepGatlingSpin(wheel, 1 / 60, true);
assert.ok(wheel.speed > GATLING_MAX_SPIN * 0.95, 'monte à pleine vitesse en 1,5 s');
assert.ok(
  Math.abs(GATLING_MAX_SPIN - 4 * Math.PI) < 1e-9,
  '2 tours/s : un tir par canon et par tour',
);
const spun = wheel.angle;
for (let i = 0; i < 30; i++) stepGatlingSpin(wheel, 1 / 60, false);
assert.ok(wheel.speed > 0 && wheel.speed < GATLING_MAX_SPIN, 'ralentit sans s’arrêter net');
assert.notEqual(wheel.angle, spun);
for (let i = 0; i < 600; i++) stepGatlingSpin(wheel, 1 / 60, false);
assert.equal(wheel.speed, 0);
// La bouche qui tire est celle du haut du faisceau.
const top = firingBarrel(0);
assert.ok(barrels[top].position.y > 0.04);

// --- Tirs visuels étalés, sans rafale, et son continu --------------------------------
const ui = Object.create(GroundDefenseUI.prototype);
ui.sentries = new Map([
  [
    '9',
    {
      kind: 'gatling',
      container: { position: new T.Vector3(0.1, 0, 0.2) },
      spinState: { angle: 0, speed: GATLING_MAX_SPIN },
      queued: 0,
    },
  ],
]);
assert.equal(ui.noteGatlingBurst('9', 2, [0.2, 0, 0.2], 1000), true);
assert.equal(ui.noteGatlingBurst('404', 1, null, 1000), false, 'tourelle inconnue');
assert.equal(ui.takeGatlingShots(1000).length, 1, 'un tir à la fois, à la cadence de l’arme');
assert.equal(ui.takeGatlingShots(1050).length, 0, 'pas de tir avant l’intervalle de 1/12 s');
ui.noteGatlingBurst('9', 4, null, 1100);
assert.equal(
  ui.takeGatlingShots(1900).length,
  2,
  'image en retard : jamais plus de deux tirs à la fois',
);
// Le serveur annonce jusqu'à 3 tirs par tick de 250 ms : 12 tirs par seconde à l'écran.
let released = 0;
for (let t = 2000; t < 3000; t += 16) {
  if ((t - 2000) % 250 < 16) ui.noteGatlingBurst('9', 3, [0.2, 0, 0.2], t);
  released += ui.takeGatlingShots(t).length;
}
assert.ok(released >= 11 && released <= 12, 'douze tirs en une seconde, obtenu ' + released);
const sounds = ui.gatlingSounds({ x: 0, y: 0, z: 0 }, 2500);
assert.equal(sounds.length, 1, 'une seule voix par tourelle en train de tirer');
assert.equal(sounds[0].key, 'gatling-9');
assert.equal(ui.gatlingSounds(null, 9e9).length, 0, 'plus de son une fois le feu cessé');
const client = readFileSync('src/client.js', 'utf8');
assert.match(client, /groundDefenseUI\.gatlingSounds\(activeCamera\.position\)/);
assert.match(client, /sound\.loop\(gun\.key, 'gatling'/);
assert.match(
  client,
  /emitBullet\(origin, direction, TRACER_COLOR, false, false, null, null, silent\)/,
);

// --- Boucle sonore sans couture -----------------------------------------------------
assert.ok(AUDIO_PROFILES.gatling);
const rate = 24000;
const loop = synthesize('gatling', rate);
assert.equal(loop.length, rate, 'boucle d’une seconde = six tirs');
assert.ok(loop.every(Number.isFinite));
assert.ok(Math.abs(loop[0] - loop.at(-1)) < 0.1, 'raccord de boucle sans claquement');
const energy = (from) => {
  let sum = 0;
  for (let i = from; i < from + 240; i++) sum += loop[i] ** 2;
  return sum;
};
assert.ok(energy(0) > energy(1200) * 3, 'les douze impulsions sont audibles');
assert.ok(Math.abs(energy(0) - energy(rate / 12)) < energy(0) * 0.6, 'cadence régulière');

// --- Achat complet côté serveur, depuis un Castor -----------------------------------
const game = new Game({ now: () => 100000 });
const joined = game.join({ code: 'GATLING', name: 'Armurier' });
const room = game.rooms.get('GATLING');
const pilot = room.pilots.get(joined.id);
const castor = game.createVehicle(room, 'castor');
castor.state.p = [0, VEHICLES.castor.gear, 0];
castor.state.landed = true;
castor.seats.set('pilot', joined.id);
pilot.mode = 'flight';
pilot.seat = 'pilot';
pilot.vehicle_id = castor.id;
room.dollars = 40;
const order = (request, body) =>
  game.command('GATLING', joined.id, 'ground-defense', {
    epoch: room.base.epoch,
    request,
    ...body,
  });
assert.throws(
  () => order('gatling:direct', { action: 'build', kind: 'gatling', a: [0, 0] }),
  /invalide/,
  'la Gatling ne se commande plus à l’achat',
);
let snap = order('gatling:base', { action: 'build', kind: 'sentry', a: [0, 0] });
assert.equal(snap.dollars, 35, '5 $ débités pour la tourelle de base');
const baseId = snap.groundDefense.structures[0].id;
room.groundDefense.structures[0].hp = 10; // abîmée : la refonte la remet à neuf
room.groundDefense.structures[0].ammo = 3;
snap = order('gatling:first', { action: 'upgrade', target: baseId, variant: 'gatling' });
assert.equal(snap.dollars, 10, '25 $ débités pour la refonte');
assert.deepEqual(
  [snap.groundDefense.structures[0].kind, snap.groundDefense.structures[0].hp],
  ['gatling', 150],
);
assert.equal(snap.groundDefense.structures[0].ammo, 1000);
snap = order('gatling:first', { action: 'upgrade', target: baseId, variant: 'gatling' });
assert.equal(snap.dollars, 10, 'nouvel essai réseau idempotent');
assert.equal(snap.groundDefense.structures.length, 1);
assert.throws(
  () => order('gatling:again', { action: 'upgrade', target: baseId, variant: 'gatling' }),
  /ne peut pas être améliorée/,
  'plus d’amélioration possible au dernier stade',
);

// --- Tick serveur : un effet par tourelle et par tick porte le nombre de tirs ----------
let clock = 200000;
const live = new Game({ now: () => clock });
live.join({ code: 'GATFIRE', name: 'Tireur' });
const arena = live.rooms.get('GATFIRE');
arena.phase = 'combat';
arena.started = clock;
const roster = live.plan(arena).roster;
clock += 2000;
const first = swarmFrame(roster, 2, arena.groundAgents).find(Boolean);
assert.ok(first, 'un ennemi est présent');
const standing = {
  position: [first.p[0], first.p[2]],
  y: Math.max(0, first.p[1] - 0.025),
  angle: 0,
  hp: 150,
  maxHp: 150,
};
arena.groundDefense.structures.push(
  { id: 'g1', kind: 'gatling', ammo: 1000, ...standing },
  { id: 's1', kind: 'sentry', ammo: 180, ...standing },
);
arena.effects = [];
for (let i = 0; i < 8; i++) {
  clock += 250;
  live.advanceSentries(arena, clock);
}
const gatlingEffects = arena.effects.filter((e) => e.sentry === 'g1');
const sentryEffects = arena.effects.filter((e) => e.sentry === 's1');
assert.ok(gatlingEffects.length > 0, 'la Gatling tire sur l’ennemi présent');
assert.ok(
  gatlingEffects.every((e) => e.turret === 'gatling' && e.shots >= 1 && e.shots <= 3),
  'un effet par tick de 250 ms, 1 à 3 tirs à 12 tirs/s',
);
assert.ok(
  gatlingEffects.some((e) => e.shots === 3),
  'à 12 tirs/s un tick porte bien jusqu’à trois tirs',
);
assert.ok(
  sentryEffects.every((e) => e.turret === undefined && e.shots === undefined),
  'la tourelle T-01 garde son effet par tir',
);
const fired = 1000 - arena.groundDefense.structures.find((s) => s.id === 'g1').ammo;
assert.equal(
  gatlingEffects.reduce((n, e) => n + e.shots, 0),
  fired,
  'les effets comptent exactement les munitions consommées',
);

console.log(
  'Gatling: règles, cadence 12/s, modèle articulé, rotation du faisceau, tirs étalés et son continu OK',
);
