// Tourelle automatique Gatling : règles, cadence, modèle articulé, rotation du
// faisceau, tirs visuels étalés et boucle sonore continue.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../vendor/three.module.min.js';
import { Game } from '../server/game.js';
import { VEHICLES } from '../src/fleet.ts';
import { newGroundDefense, groundCommand } from '../src/ground-defense-state.js';
import { SENTRY, GATLING, fireGroundSentries } from '../src/ground-sentry.ts';
import { advancePaidService } from '../src/paid-service.js';
import { AIRDROP_KINDS, airdropCommand } from '../src/airdrop.ts';
import { MODEL_DATA } from '../src/meshy-gatling-data.js';
import {
  createGatlingModel,
  stepGatlingSpin,
  firingBarrel,
  GATLING_MAX_SPIN,
  GATLING_SCALE,
} from '../src/gatling-model.ts';
import { GroundDefenseUI } from '../src/ground-defense-ui.js';
import { synthesize, AUDIO_PROFILES } from '../src/game-audio/synth.ts';
import { createGroundModel } from '../src/ground-model.js';
import { swarmFrame } from '../src/waves.js';

// --- Règles demandées -------------------------------------------------------
assert.equal(GATLING.cost, 25);
assert.equal(GATLING.hp, 150);
assert.equal(GATLING.damage, 30);
assert.equal(GATLING.ammo, 1000);
assert.equal(GATLING.range, SENTRY.range, 'même portée que la tourelle automatique');
assert.ok(Math.abs(1000 / GATLING.intervalMs - 6) < 1e-9, '6 tirs par seconde');

const defense = newGroundDefense();
assert.throws(
  () => groundCommand(defense, { action: 'build', kind: 'gatling', a: [0, 0] }, [0, 0], 99),
  /Castor/,
);
assert.throws(
  () =>
    groundCommand(defense, { action: 'build', kind: 'gatling', a: [0, 0] }, [0, 0], 24.9, 1, {
      castor: true,
    }),
  /insuffisante/,
);
const bought = groundCommand(
  defense,
  { action: 'build', kind: 'gatling', a: [0, 0] },
  [0, 0],
  50,
  1000,
  { castor: true },
);
assert.equal(bought.price, 25);
const gun = defense.structures[0];
assert.deepEqual([gun.kind, gun.hp, gun.maxHp, gun.ammo], ['gatling', 150, 150, 1000]);
assert.throws(
  () =>
    groundCommand(defense, { action: 'build', kind: 'sentry', a: [0, 0.01] }, [0, 0], 50, 1, {
      castor: true,
    }),
  /occupé/,
  'une Gatling occupe son emplacement comme les autres tourelles',
);
// Plafond partagé par les deux types de tourelle.
const crowd = newGroundDefense();
for (let i = 0; i < SENTRY.maxPerRoom; i++)
  groundCommand(
    crowd,
    {
      action: 'build',
      kind: i % 2 ? 'gatling' : 'sentry',
      a: [(i % 6) * 0.05, Math.floor(i / 6) * 0.05],
    },
    [(i % 6) * 0.05, Math.floor(i / 6) * 0.05],
    999,
    1,
    { castor: true },
  );
assert.throws(
  () =>
    groundCommand(crowd, { action: 'build', kind: 'gatling', a: [0.5, 0.5] }, [0.5, 0.5], 999, 1, {
      castor: true,
    }),
  /maximal/,
);

// --- Cadence : 6 tirs/s malgré un tick serveur de 250 ms ------------------------
const range = newGroundDefense();
groundCommand(range, { action: 'build', kind: 'gatling', a: [0, 0] }, [0, 0], 99, 0, {
  castor: true,
});
const turret = range.structures[0];
const damage = [];
let shots = 0;
for (let now = 1000; now <= 11000; now += 250)
  shots += fireGroundSentries(range.structures, [{ id: 1, p: [0.1, 0, 0] }], now, (t, s, d) => {
    damage.push(d);
  });
assert.ok(shots >= 60 && shots <= 61, '10 s de feu continu = 60 tirs, obtenu ' + shots);
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
groundCommand(dying, { action: 'build', kind: 'gatling', a: [0, 0] }, [0, 0], 99, 0, {
  castor: true,
});
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
groundCommand(low, { action: 'build', kind: 'gatling', a: [0, 0] }, [0, 0], 99, 0, {
  castor: true,
});
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
assert.ok(AIRDROP_KINDS.includes('gatling'), 'le Castor volant peut larguer la Gatling');
assert.equal(airdropCommand('gatling', { x: 1, z: 2, yaw: 0.5 }).kind, 'gatling');
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
assert.ok(tools.some(([kind, label]) => kind === 'gatling' && /Gatling/.test(label)));

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
const { group, yaw, pitch, spin, barrels, muzzle } = model;
assert.equal(group.scale.x, GATLING_SCALE);
assert.equal(yaw.parent, group);
assert.equal(pitch.parent, yaw);
assert.equal(spin.parent, pitch);
assert.equal(muzzle.parent, pitch, 'la bouche ne tourne pas sur elle-même');
assert.equal(group.getObjectByName('socle-fixe').parent, group);
assert.equal(group.getObjectByName('tete-gatling').parent, yaw);
assert.equal(group.getObjectByName('faisceau-canons').parent, spin, 'tous les canons tournent');
// La base circulaire du faisceau s'incline avec les canons mais ne tourne pas sur elle-même.
const base = group.getObjectByName('anneau-faisceau');
assert.equal(base.parent, pitch, 'l’anneau suit l’élévation du canon');
assert.notEqual(base.parent, spin);
base.geometry.computeBoundingBox();
const baseBox = base.geometry.boundingBox;
assert.ok(Math.abs((baseBox.min.x + baseBox.max.x) / 2) < 0.004, 'anneau centré sur l’axe (X)');
// 0,009 unité (0,2 mm) de décalage vient du modèle Meshy : ses canons sont un peu bas dans l'ouverture.
assert.ok(Math.abs((baseBox.min.y + baseBox.max.y) / 2) < 0.012, 'anneau centré sur l’axe (Y)');
pitch.rotation.x = 0.7;
group.updateMatrixWorld(true);
const along = new T.Vector3(0, 0, -1).applyQuaternion(base.getWorldQuaternion(new T.Quaternion()));
const aimed = muzzle
  .getWorldPosition(new T.Vector3())
  .sub(pitch.getWorldPosition(new T.Vector3()))
  .normalize();
assert.ok(along.distanceTo(aimed) < 1e-6, 'l’anneau pointe dans le sens du canon');
pitch.rotation.x = 0;
assert.equal(barrels.length, 6);
assert.ok(barrels.every((b) => b.parent === spin));
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
  Math.abs(GATLING_MAX_SPIN - 2 * Math.PI) < 1e-9,
  '1 tour/s : un tir par canon et par tour',
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
assert.equal(ui.takeGatlingShots(1100).length, 0, 'pas de tir avant l’intervalle de 1/6 s');
ui.noteGatlingBurst('9', 4, null, 1100);
assert.equal(
  ui.takeGatlingShots(1900).length,
  2,
  'image en retard : jamais plus de deux tirs à la fois',
);
ui.noteGatlingBurst('9', 6, [0.2, 0, 0.2], 2000);
let released = 0;
for (let t = 2000; t < 3000; t += 16) released += ui.takeGatlingShots(t).length;
assert.ok(released >= 5 && released <= 6, 'six tirs en une seconde, obtenu ' + released);
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
assert.ok(energy(0) > energy(2400) * 3, 'les six impulsions sont audibles');
assert.ok(Math.abs(energy(0) - energy(rate / 6)) < energy(0) * 0.6, 'cadence régulière');

console.log(
  'Gatling: règles, cadence 6/s, modèle articulé, rotation du faisceau, tirs étalés et son continu OK',
);
