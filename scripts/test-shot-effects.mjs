// Issue #108: H2 rocket/missile exhausts (darker, thicker trails, brighter flame,
// far-visible halo) and Castor auto-turret shots visible to every player.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../vendor/three.module.min.js';
import { EXHAUST_PROFILES, MissileExhaust } from '../src/missile-exhaust.js';
import { GroundDefenseUI } from '../src/ground-defense-ui.js';
import { newGroundDefense } from '../src/ground-defense-state.js';

const luminance = (hex) => new T.Color(hex).getHSL({}).l;
const OLD_PUFF = [0x777b77, 0xb6b5a7];
for (const [weapon, profile] of Object.entries(EXHAUST_PROFILES)) {
  assert.ok(
    profile.puff.every((c, i) => luminance(c) < luminance(OLD_PUFF[i])),
    weapon + ' darker',
  );
  assert.ok(profile.puffScale > 1 && profile.opacity > 0.35, weapon + ' thicker');
  assert.ok(profile.flame > 1 && profile.halo > 0, weapon + ' brighter, haloed');
}
assert.ok(EXHAUST_PROFILES.missile.halo > EXHAUST_PROFILES.rocket.halo, 'missile halo stands out');
assert.ok(EXHAUST_PROFILES.missile.pulse > 0, 'guided missile halo pulses');

const scene = new T.Scene();
const exhaust = new MissileExhaust(T, scene);
const missile = new T.Group(),
  rocket = new T.Group();
exhaust.attach('m', missile, 'missile');
exhaust.attach('r', rocket, 'rocket');
const halo = missile.children.find((o) => o.isSprite);
assert.ok(halo, 'halo sprite');
assert.equal(halo.material.sizeAttenuation, false, 'constant screen size: visible from afar');
assert.equal(halo.material.blending, T.AdditiveBlending);
assert.equal(exhaust.emitters.get('m').profile, EXHAUST_PROFILES.missile);
for (let i = 0; i < 30; i++) {
  missile.position.x = i * 0.01;
  rocket.position.x = i * 0.01;
  exhaust.update(
    1 / 60,
    new Map([
      ['m', missile.position],
      ['r', rocket.position],
    ]),
  );
}
assert.ok(exhaust.puffs.length > 10, 'trail emitted');
const colors = new Set(exhaust.puffs.map((p) => p.material.color.getHex()));
for (const c of colors)
  assert.ok(
    [...EXHAUST_PROFILES.missile.puff, ...EXHAUST_PROFILES.rocket.puff].includes(c),
    'puff colour from a profile',
  );
assert.ok(exhaust.puffs.some((p) => p.scale === EXHAUST_PROFILES.missile.puffScale));
assert.equal(
  readFileSync('src/client.js', 'utf8').match(
    /missileExhaust\.attach\(shot\.shot, model, shot\.weapon\)/,
  )?.length,
  1,
);

// Castor auto-turret: the server effect names the turret; the client draws a
// tracer and a muzzle flash from that model's real muzzle, with recoil.
assert.match(readFileSync('server/game.js', 'utf8'), /kind: 'sentry-shot',\s*sentry: sentry\.id,/);
const client = readFileSync('src/client.js', 'utf8');
const handler = client.slice(
  client.indexOf("if (e.kind === 'sentry-shot'"),
  client.indexOf("if (e.kind === 'blast')"),
);
assert.match(handler, /groundDefenseUI\.sentryShot\(e\.sentry, e\.target\)/);
assert.match(handler, /emitBullet\(origin, direction, TRACER_COLOR, false, false\)/);
assert.match(handler, /combatEffects\.muzzle\(origin, direction\)/);

class Element {
  constructor(tag) {
    this.tag = tag;
    this.style = {};
    this.children = [];
  }
  setAttribute() {}
  append(...items) {
    this.children.push(...items);
  }
  querySelectorAll(tag) {
    return this.children.filter((c) => c.tag === tag);
  }
  querySelector(tag) {
    return this.querySelectorAll(tag)[0];
  }
}
const document = { createElement: (tag) => new Element(tag), body: new Element('body') };
const defense = newGroundDefense();
defense.structures.push({
  id: '7',
  kind: 'sentry',
  position: [0.5, 0.2],
  angle: 0,
  hp: 100,
  ammo: 10,
});
defense.revision = 1;
const snap = { code: 'FX', base: { epoch: 1 }, groundDefense: defense, dollars: 0 };
const ui = new GroundDefenseUI({
  T,
  scene: new T.Scene(),
  document,
  snapshot: () => snap,
  foot: () => null,
  aim: () => null,
  available: () => false,
  enabled: () => false,
  captureMouse() {},
  releaseMouse() {},
  notify() {},
  command: async () => true,
});
ui.update();
const target = [0.9, 0.02, 0.2];
const shot = ui.sentryShot('7', target);
assert.ok(shot, 'turret found by id');
assert.ok(Math.hypot(shot.position.x - 0.5, shot.position.z - 0.2) < 0.02, 'muzzle on the turret');
assert.ok(shot.position.y > 0.004, 'muzzle above the floor');
const toTarget = new T.Vector3(...target).sub(shot.position).normalize();
assert.ok(shot.direction.dot(toTarget) > 0.999, 'tracer heads for the target');
assert.equal(ui.sentries.get('7').recoil, 1, 'recoil kick');
assert.equal(ui.sentryShot('missing', target), null);
console.log(
  'Shot effects: darker/thicker H2 trails, bright haloed flames, turret tracers from the muzzle.',
);
