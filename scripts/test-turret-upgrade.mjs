// Amélioration des tourelles automatiques : arbre, règles serveur, portée de survol
// et formulaire papier (signature, tampon REFUSÉ faute de fonds).
import assert from 'node:assert/strict';
import { newGroundDefense, groundCommand } from '../src/ground-defense-state.ts';
import {
  SENTRY,
  GATLING,
  TURRET_UPGRADES,
  BUYABLE_TURRETS,
  upgradesOf,
  upgradeCost,
  upgradeInReach,
} from '../src/ground-sentry.ts';
import { MAP } from '../src/scale.ts';
import { POST_REACH } from '../src/seat-posts.ts';
import { UpgradeUI } from '../src/upgrade-ui.ts';

// --- Arbre : seule la tourelle de base s'achète, la Gatling est une amélioration.
assert.deepEqual(BUYABLE_TURRETS, ['sentry']);
assert.deepEqual(upgradesOf('sentry'), ['gatling']);
assert.deepEqual(upgradesOf('gatling'), [], 'dernier stade : plus rien à améliorer');
assert.deepEqual(upgradesOf('barricade'), []);
assert.deepEqual(Object.keys(TURRET_UPGRADES).sort(), ['gatling', 'sentry']);
assert.equal(upgradeCost('gatling'), GATLING.cost, 'prix de la Gatling d’aujourd’hui');

// --- Serveur : remise à neuf complète, pour le prix de la variante.
const castor = { castor: true };
const defense = newGroundDefense();
groundCommand(defense, { action: 'build', kind: 'sentry', a: [0, 0] }, [0, 0], 50, 1, castor);
const turret = defense.structures[0];
turret.hp = 12;
turret.ammo = 3;
turret.lastShotAt = 500;
const upgrade = { action: 'upgrade', id: turret.id, variant: 'gatling' };
assert.throws(() => groundCommand(defense, upgrade, [0, 0], GATLING.cost - 0.01), /insuffisante/);
assert.deepEqual(
  [turret.kind, turret.hp, turret.ammo],
  ['sentry', 12, 3],
  'refus : rien ne change',
);
assert.throws(
  () => groundCommand(defense, upgrade, [5, 5], 99),
  /Approchez/,
  'il faut être à proximité',
);
assert.throws(
  () => groundCommand(defense, { ...upgrade, variant: 'sentry' }, [0, 0], 99),
  /ne peut pas être améliorée/,
  'pas de variante hors de l’arbre',
);
const revision = defense.revision;
assert.equal(groundCommand(defense, upgrade, [0, 0], 99).price, 25);
assert.equal(defense.revision, revision + 1);
assert.deepEqual(
  [turret.kind, turret.hp, turret.maxHp, turret.ammo, turret.lastShotAt],
  ['gatling', GATLING.hp, GATLING.hp, GATLING.ammo, undefined],
  'réparée et rechargée au maximum de la Gatling',
);
assert.throws(
  () => groundCommand(defense, upgrade, [0, 0], 99),
  /ne peut pas être améliorée/,
  'une tourelle au dernier stade ne s’améliore plus',
);
// Une tourelle détruite ne se refond pas.
const ruin = newGroundDefense();
groundCommand(ruin, { action: 'build', kind: 'sentry', a: [0, 0] }, [0, 0], 50, 1, castor);
ruin.structures[0].hp = 0;
assert.throws(
  () =>
    groundCommand(
      ruin,
      { action: 'upgrade', id: ruin.structures[0].id, variant: 'gatling' },
      [0, 0],
      99,
    ),
  /ne peut pas être améliorée/,
);

// --- Portée : celle des postes des véhicules (demi-taille + POST_REACH).
const stand = { kind: 'sentry', hp: SENTRY.hp, position: [0, 0] };
const edge = SENTRY.footprint + MAP.metres(POST_REACH);
assert.ok(upgradeInReach(stand, { x: edge * 0.95, y: 0, z: 0 }));
assert.ok(!upgradeInReach(stand, { x: edge * 1.05, y: 0, z: 0 }), 'trop loin');
assert.ok(!upgradeInReach(stand, { x: 0, y: MAP.metres(3), z: 0 }), 'autre étage');
assert.ok(!upgradeInReach({ ...stand, kind: 'gatling' }, { x: 0, y: 0, z: 0 }), 'dernier stade');
assert.ok(!upgradeInReach({ ...stand, hp: 0 }, { x: 0, y: 0, z: 0 }), 'détruite');
assert.ok(!upgradeInReach(stand, null));

// --- Formulaire : mêmes gestes que les autres documents papier.
class Element {
  constructor() {
    this.map = new Map();
    this.classList = { add() {}, remove() {} };
    this.width = 800;
    this.height = 200;
    this.textContent = '';
  }
  querySelector(k) {
    if (!this.map.has(k)) this.map.set(k, new Element());
    return this.map.get(k);
  }
  getContext() {
    return { clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
  setPointerCapture() {}
}
const snapshot = {
  base: { epoch: 'e' },
  dollars: 10,
  groundDefense: { structures: [{ id: 't1', kind: 'sentry', hp: 150 }] },
};
const root = new Element();
const sent = [];
const ui = new UpgradeUI({
  root,
  snapshot: () => snapshot,
  ground: () => null,
  command: async () => {
    sent.push(ui.variant());
    return snapshot;
  },
  accept() {},
  onOpen() {},
  onClose() {},
});
const self = { life: 'alive', incarnation: 0 };
const sign = async () => {
  const e = { pointerId: 1, clientX: 10, clientY: 10, preventDefault() {} };
  ui.canvas.onpointerdown(e);
  ui.canvas.onpointerup({ ...e, clientX: 90 });
  await new Promise((r) => setImmediate(r));
};
ui.openTurret({ id: 't1', kind: 'gatling' }, self);
assert.ok(!ui.opened, 'pas de formulaire pour une tourelle au dernier stade');
ui.openTurret({ id: 't1', kind: 'sentry' }, self);
assert.ok(ui.opened);
assert.equal(ui.price(), 25);
assert.equal(ui.clauses.state.rule.clauses.length, 1, 'une case par variante');
assert.equal(ui.clauses.state.checked.size, 0, 'jamais pré-cochée');
await sign();
assert.equal(sent.length, 0, 'pas de signature sans case cochée');
// Fonds insuffisants (10 $ < 25 $) : on signe, tampon REFUSÉ, rien n'est envoyé.
ui.clauses.toggle('gatling');
await sign();
assert.equal(sent.length, 0, 'une demande sans fonds n’est pas transmise');
assert.ok(!ui.opened && ui.invalidated, 'le formulaire refusé se ferme');
assert.match(root.querySelector('[data-bed-status]').textContent, /caisse commune/);
// Avec les fonds : une commande, une seule.
snapshot.dollars = 40;
ui.openTurret({ id: 't1', kind: 'sentry' }, self);
ui.clauses.toggle('gatling');
ui.clauses.toggle('gatling');
await sign();
assert.equal(sent.length, 0, 'case décochée : pas de signature');
ui.clauses.toggle('gatling');
await sign();
assert.deepEqual(sent, ['gatling']);
// Le formulaire se ferme si la tourelle a été améliorée ou détruite entre-temps.
snapshot.groundDefense.structures[0].kind = 'sentry';
ui.openTurret({ id: 't1', kind: 'sentry' }, self);
ui.observe(self);
assert.ok(ui.opened);
snapshot.groundDefense.structures[0].kind = 'gatling';
ui.observe(self);
assert.ok(!ui.opened, 'tourelle déjà refondue par un autre joueur');
console.log('Amélioration des tourelles : arbre, serveur, portée, formulaire et tampon REFUSÉ OK');
