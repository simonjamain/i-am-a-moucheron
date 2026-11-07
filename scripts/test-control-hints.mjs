import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { controlHints, controlHintItems } from '../src/live-hud.js';
import { VEHICLES } from '../src/fleet.js';

const AIRPLANE_ONLY = /gouverne|tangage|roulis|gaz|cap\b/;

// Castor (issue #96): real ground-vehicle and construction commands, never flight ones.
const castor = controlHints({ vehicle: { type: 'castor' }, seat: 'pilot', build: true });
assert.doesNotMatch(castor, AIRPLANE_ONLY);
assert.doesNotMatch(castor, /parachute|sauter|postes/);
for (const expected of [
  /Z\/S : avancer\/reculer/,
  /Q\/D : tourner/,
  /Clic : mitrailleuse/,
  /G \/ clic molette : construire/,
  /V : vue tactique/,
  /F : sortir/,
])
  assert.match(castor, expected);
assert.doesNotMatch(controlHints({ vehicle: { type: 'castor' }, seat: 'pilot' }), /construire/);

// On foot: middle-click construction and mouse-wheel camera zoom.
const foot = controlHints({ build: true });
for (const expected of [
  /Molette : zoom/,
  /G \/ clic molette : construire/,
  /E : interagir/,
  /Espace : jet/,
  /P : achats/,
])
  assert.match(foot, expected);
assert.match(controlHints({ airborne: true }), /Espace : parachute.*Molette : zoom/);
const purgatory = controlHints({ dead: true, build: false });
assert.match(purgatory, /E : formulaires/);
assert.doesNotMatch(purgatory, /construire|achats/);

// Construction wheel and active tools, on foot and from the Castor.
assert.match(controlHints({ wheel: true }), /Relâcher G \/ clic molette : valider/);
assert.match(controlHints({ building: { mode: 'barricade' } }), /fixer le début/);
assert.match(controlHints({ building: { mode: 'barricade', anchored: true } }), /poser la fin/);
const castorWall = controlHints({ building: { mode: 'sticky', castor: true } });
assert.match(castorWall, /Z\/S\/Q\/D : conduire.*démarrer la dépose \(1 \$ \/ 20 cm\)/);
assert.match(
  controlHints({ building: { mode: 'barricade', castor: true, anchored: true } }),
  /arrêter la dépose/,
);
assert.match(controlHints({ building: { mode: 'fan' } }), /R : orienter/);
assert.doesNotMatch(controlHints({ building: { mode: 'bunker', castor: true } }), /R : orienter/);
assert.match(controlHints({ building: { mode: 'repair' } }), /Clic \/ E : réparer/);

// Fixed stations: DCA fuse, LEGO bunker and heavy cannon, all left with F.
assert.match(controlHints({ turret: true }), /fusée/);
assert.match(controlHints({ station: 'dca' }), /Clic \/ Espace : obus.*fusée/);
for (const station of ['bunker', 'antitank']) {
  const text = controlHints({ station });
  assert.doesNotMatch(text, /fusée|parachute|sauter/);
  assert.match(text, /F : sortir/);
}
assert.match(controlHints({ station: 'bunker' }), /balles/);
assert.match(controlHints({ station: 'antitank' }), /obus antichar/);

// Every seat of every vehicle has a dedicated, non-empty help and the right seat range.
for (const [type, spec] of Object.entries(VEHICLES))
  for (const seat of spec.seats) {
    const vehicle = { type, supplies: { ammo: type === 'stuka' ? { bomb: 2 } : {} } };
    const items = controlHintItems({ vehicle, seat });
    assert.ok(items.length > 4, type + ' ' + seat);
    assert.ok(
      items.every((item) => typeof item === 'string' && item),
      type + ' ' + seat,
    );
    const text = items.join(' · ');
    assert.match(text, /F : (sauter \/ )?sortir/);
    if (spec.seats.length > 1)
      assert.match(text, new RegExp('1–' + spec.seats.length + ' : postes'));
    else assert.doesNotMatch(text, /postes/);
    if (spec.ground) assert.doesNotMatch(text, /parachute/);
    if (seat !== 'pilot' || spec.ground || type === 'helicopter')
      assert.doesNotMatch(text, /gouverne/);
  }
assert.match(
  controlHints({ vehicle: { type: 'tank' }, seat: 'cannon' }),
  /Clic : canon.*Espace : coaxiale/,
);
assert.match(controlHints({ vehicle: { type: 'spitfire' }, seat: 'pilot' }), /A\/E : gouverne/);
assert.match(controlHints({ vehicle: { type: 'helicopter' }, seat: 'pilot' }), /Clic : roquettes/);
assert.match(controlHints({ vehicle: { type: 'flaktruck' }, seat: 'cannon' }), /proximité/);

// The client feeds the help from the occupied station kind and the construction state,
// and lets the Castor driver's V toggle the tactical view before the wave council.
const client = readFileSync('src/client.js', 'utf8');
const call = client.slice(client.indexOf("$('commandHelp').textContent = controlHints({"));
for (const field of ['station:', 'build: groundDefenseUI.available()', 'wheel:', 'building:'])
  assert.ok(call.slice(0, 900).includes(field), field);
const council = client.indexOf("interactionKey === 'KeyV' &&");
assert.ok(client.slice(council, council + 250).includes("myVehicle?.type !== 'castor'"));
assert.ok(council < client.indexOf("interactionKey === 'KeyV' && myVehicle?.type === 'castor'"));

console.log(
  'Control hints: foot, building, stations, Castor and every vehicle seat match their inputs.',
);
