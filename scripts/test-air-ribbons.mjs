// Rubans d'air : état de l'air selon l'incidence, ancrages sur les ailes, rubans
// invisibles en vol normal puis naissants à l'approche du décrochage, son associé.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {
  AirRibbons,
  CALM,
  ONSET_START,
  RIBBON_MIN_SPEED,
  airflow,
  attackAngle,
  ribbonLook,
  wingAnchors,
} from '../src/air-ribbons.ts';
import { PLANE_TYPES, planeSpec } from '../src/plane-physics.ts';
import { MAP } from '../src/scale.ts';
import { GAME_CATALOG, LOOP_KINDS } from '../src/game-audio/catalog.ts';
import { synthesize } from '../src/game-audio/synth.ts';

const wing = { stallAngle: 0.3, zeroLift: 0.055 };
const fast = 40;
// L'air est calme loin du décrochage, naissant à l'approche, profond au-delà.
assert.deepEqual(airflow(0.05, fast, wing), CALM, 'vol de croisière : rien');
assert.deepEqual(airflow(0.1, fast, wing), CALM, 'en dessous de 55 % de l’angle : rien');
const near = airflow(wing.stallAngle * 0.8 - wing.zeroLift, fast, wing);
assert.ok(near.onset > 0 && near.onset < 1 && near.stalled === 0, 'approche');
assert.ok(near.level > 0 && near.level < 0.5, 'approche : discret');
const edge = airflow(wing.stallAngle - wing.zeroLift, fast, wing);
assert.ok(Math.abs(edge.onset - 1) < 1e-9 && edge.stalled === 0, 'au seuil du décrochage');
const deep = airflow(wing.stallAngle + 0.2 - wing.zeroLift, fast, wing);
assert.equal(deep.stalled, 1);
assert.equal(deep.level, 1, 'décrochage profond : pleine force');
assert.ok(airflow(-0.6, fast, wing).level > 0, 'le décrochage dos fonctionne aussi');
assert.deepEqual(airflow(0.5, RIBBON_MIN_SPEED - 1, wing), CALM, 'à l’arrêt : rien');
assert.deepEqual(airflow(NaN, fast, wing), CALM);
// Monotone avec l'incidence.
let previous = 0;
for (let a = 0; a < 0.7; a += 0.01) {
  const level = airflow(a - wing.zeroLift, fast, wing).level;
  assert.ok(level >= previous - 1e-12, 'le niveau ne baisse pas avec l’incidence');
  previous = level;
}
assert.ok(ONSET_START > 0.3 && ONSET_START < 0.8);
// Plus l'air est perturbé, plus le ruban est large, long et ondulé.
const calmLook = ribbonLook(near),
  stallLook = ribbonLook(deep);
assert.equal(stallLook.width, calmLook.width, 'la largeur ne change pas avec le décrochage');
assert.ok(stallLook.life > calmLook.life);
assert.ok(stallLook.wobble > 5 * calmLook.wobble && stallLook.opacity > calmLook.opacity);

// Angle d'incidence depuis la vitesse et l'orientation (nez vers -Z, dessus +Y).
const level = new T.Quaternion();
const cruise = attackAngle(T, level, new T.Vector3(0, 0, -MAP.metres(40)));
assert.ok(Math.abs(cruise.alpha) < 1e-9 && Math.abs(cruise.speed - 40) < 1e-6);
const sinking = attackAngle(T, level, new T.Vector3(0, -MAP.metres(10), -MAP.metres(30)));
assert.ok(sinking.alpha > 0.3, 'le nez au-dessus de la trajectoire : incidence positive');
const pitched = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0.4);
assert.ok(attackAngle(T, pitched, new T.Vector3(0, 0, -1)).alpha > 0.35, 'nez cabré');

// Ancrages : un ruban par bout d'aile, à l'intérieur de l'aile.
for (const type of PLANE_TYPES) {
  const anchors = wingAnchors(type);
  assert.equal(anchors.length, 2, type);
  const [right, left] = anchors;
  assert.ok(right[0] > 0 && left[0] < 0, type + ' côtés');
  assert.ok(Math.abs(right[0] + left[0]) < 0.1, type + ' symétrique');
  // A model unit is about 1.9 reference metres: the tips stand at the same share of the span.
  const ratio = (right[0] - left[0]) / planeSpec(type).size.span;
  assert.ok(ratio > 0.45 && ratio < 0.6, type + ' : bouts d’aile à l’envergure, ' + ratio);
}
assert.deepEqual(wingAnchors('tank'), [], 'pas d’ailes, pas de rubans');

// Rubans : rien en vol normal, naissance à l'approche, dissipation ensuite.
const scene = new T.Scene();
const ribbons = new AirRibbons(T, scene, () => 0.5);
const plane = new T.Group();
plane.scale.setScalar(0.003);
scene.add(plane);
const params = planeSpec('fighter').params;
const speedAt = (alpha) => {
  // Vitesse dont l'incidence vue du modèle vaut alpha (nez le long de -Z).
  const v = MAP.metres(40);
  return new T.Vector3(0, -Math.sin(alpha) * v, -Math.cos(alpha) * v);
};
const step = (alpha, flying = true) => {
  plane.position.add(new T.Vector3(0, 0, -0.0015));
  const flow = ribbons.emit('p1', 'fighter', plane, speedAt(alpha), params, flying, 1 / 60);
  ribbons.update(1 / 60, new T.PerspectiveCamera());
  return flow;
};
for (let i = 0; i < 90; i++) step(0.05);
assert.equal(ribbons.mesh.geometry.drawRange.count, 0, 'vol normal : aucun ruban');
assert.equal(ribbons.ribbons.size, 0);
for (let i = 0; i < 90; i++) step(params.stallAngle * 0.85 - params.zeroLift);
const approach = ribbons.mesh.geometry.drawRange.count;
const approachAlpha = Math.max(...ribbons.mesh.geometry.attributes.alpha.array);
assert.ok(approach > 0, 'à l’approche du décrochage les rubans naissent');
assert.equal(ribbons.ribbons.size, 2, 'un ruban par bout d’aile');
for (let i = 0; i < 90; i++) step(params.stallAngle + 0.25);
const stalled = ribbons.mesh.geometry.drawRange.count;
assert.ok(stalled >= approach);
assert.ok(
  Math.max(...ribbons.mesh.geometry.attributes.alpha.array) > approachAlpha,
  'au décrochage ils sont plus marqués',
);
const positions = ribbons.mesh.geometry.attributes.position.array;
for (let i = 0; i < stalled; i++)
  assert.ok(Number.isFinite(positions[ribbons.mesh.geometry.index.array[i] * 3]), 'sommets finis');
assert.ok(
  Math.max(...ribbons.mesh.geometry.attributes.alpha.array) <= 0.71,
  'translucides, jamais opaques',
);
// La fin du ruban disparaît progressivement : le point le plus ancien est invisible.
{
  const alpha = ribbons.mesh.geometry.attributes.alpha.array;
  const count = ribbons.mesh.geometry.index.array.length;
  const used = new Set(
    ribbons.mesh.geometry.index.array.slice(0, ribbons.mesh.geometry.drawRange.count),
  );
  const lastVertices = [...used].sort((a, b) => a - b).slice(-2);
  const peak = Math.max(...alpha);
  for (const v of lastVertices) assert.ok(alpha[v] < 0.05 * peak, 'la queue s’éteint, ' + alpha[v]);
  assert.ok(count > 0);
  // Turbulence arrondie : l'axe du ruban ne fait aucun angle saillant entre deux pièces.
  const pos = ribbons.mesh.geometry.attributes.position.array;
  const centre = (k) => [0, 1, 2].map((c) => (pos[2 * k * 3 + c] + pos[(2 * k + 1) * 3 + c]) / 2);
  let worst = 0;
  // The first of the two equal ribbons: its samples come first in the buffer.
  const pieces = ribbons.mesh.geometry.drawRange.count / 6 / 2 + 1;
  for (let k = 1; k < pieces - 1; k++) {
    const a = centre(k - 1),
      b = centre(k),
      c = centre(k + 1);
    const u = b.map((v, i) => v - a[i]),
      w = c.map((v, i) => v - b[i]);
    // Hops much shorter than the ribbon's width (0.5 mm) are invisible.
    if (Math.hypot(...u) < 5e-5 || Math.hypot(...w) < 5e-5) continue;
    const dot =
      u.reduce((s2, v, i) => s2 + v * w[i], 0) / (Math.hypot(...u) * Math.hypot(...w) || 1);
    const ang = Math.acos(Math.min(1, Math.max(-1, dot)));
    worst = Math.max(worst, ang);
  }
  assert.ok(pieces > 60, 'chaque segment est tracé en plusieurs morceaux d’une courbe lisse');
  assert.ok(worst < 0.3, 'courbe arrondie, virage max ' + worst);
}
// Dès que l'incidence redevient normale les points vieillissent puis disparaissent.
for (let i = 0; i < 400; i++) step(0.05);
assert.equal(ribbons.ribbons.size, 0, 'rubans dissipés');
assert.equal(ribbons.mesh.geometry.drawRange.count, 0);
// Au sol (ou détruit) : rien, même à forte incidence.
for (let i = 0; i < 30; i++) step(params.stallAngle + 0.25, false);
assert.equal(ribbons.ribbons.size, 0, 'au sol : aucun ruban');
assert.equal(ribbons.levels.get('p1').level, 0);
ribbons.forget('p1');
assert.equal(ribbons.levels.has('p1'), false);

// Son : boucle de frottement d'air, sans couture, silencieuse hors décrochage par son niveau.
assert.ok(LOOP_KINDS.includes('airflow') && GAME_CATALOG.airflow.loop);
const hiss = synthesize('airflow', 24000);
assert.equal(hiss.length, 24000);
assert.ok(hiss.every(Number.isFinite) && Math.max(...hiss.map(Math.abs)) > 0.05, 'audible');
assert.ok(Math.abs(hiss[0] - hiss.at(-1)) < 0.5, 'bouclage sans saut');
console.log('Rubans d’air : incidence, ancrages, naissance au décrochage, dissipation, son OK');
