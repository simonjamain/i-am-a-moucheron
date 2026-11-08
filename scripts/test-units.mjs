// Issue #105: HUD distances and speeds are the real ones of the office.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatDistance, formatSpeed } from '../src/units.js';
import { MAP, FLAK, ACTOR_UNIT } from '../src/scale.js';
import { MOBILE_FUSE } from '../src/mobile-flak.js';
import { GROUND_BOUNDS } from '../src/ground-defense.js';
import { equipmentHUD } from '../src/hud.js';
import { cursorAmmoText } from '../src/live-hud.js';
import { fullAmmo } from '../src/logistics.js';

assert.equal(formatDistance(0.0015), '1,5 mm');
assert.equal(formatDistance(0.024), '2,4 cm');
assert.equal(formatDistance(0.3), '30 cm');
assert.equal(formatDistance(3.6), '3,60 m');
assert.equal(formatDistance(-1), '0,0 mm');
assert.equal(formatSpeed(0.05), '5,0 cm/s');
assert.equal(formatSpeed(0.21), '21 cm/s');
assert.equal(formatSpeed(7.25), '7,3 m/s');

// Against the scene: the desk floor spans 8,24 m by 7,02 m; a 1,80 m reference
// character is 5,4 mm tall; the DCA fuse spans 30 cm–3,60 m with a 2,4 cm burst.
assert.equal(formatDistance(GROUND_BOUNDS[2] - GROUND_BOUNDS[0]), '8,24 m');
assert.equal(formatDistance(GROUND_BOUNDS[3] - GROUND_BOUNDS[1]), '7,02 m');
assert.equal(formatDistance(MAP.metres(1.8)), '5,4 mm');
assert.equal(formatDistance(MAP.metres(FLAK.minRange)), '30 cm');
assert.equal(formatDistance(MAP.metres(FLAK.maxRange)), '3,60 m');
assert.equal(formatDistance(MAP.metres(FLAK.radius)), '2,4 cm');
assert.equal(formatDistance(MAP.metres(MOBILE_FUSE.max)), '6,0 cm');
assert.ok(ACTOR_UNIT > 0);

// HUD models: no reference km/h or metres left.
const fighter = { id: 'v', type: 'fighter', supplies: { ammo: { pilot: 100 } } };
const flight = equipmentHUD({ vehicle: fighter, seat: 'pilot', speed: 0.42, altitude: 0.75 });
assert.deepEqual(flight.left.slice(1, 3), ['42 cm/s', 'Altitude 75 cm · Gaz 0 %']);
assert.equal(equipmentHUD({ turret: true, range: 1000 }).left[1], '3,00 m');
const truck = { id: 't', type: 'flaktruck', supplies: { ammo: fullAmmo('flaktruck') } };
assert.match(equipmentHUD({ vehicle: truck, seat: 'cannon' }).right[3], /1,5 mm–6,0 cm/);
assert.match(cursorAmmoText({ vehicle: truck, seat: 'cannon', proximity: 5 }), /1,5 cm$/);
for (const file of ['src/client.js', 'src/hud.js', 'src/live-hud.js', 'src/index.html'])
  assert.doesNotMatch(readFileSync(file, 'utf8'), /km\/h|m réf\.|mètres de référence/, file);
const client = readFileSync('src/client.js', 'utf8');
assert.doesNotMatch(client, /MAP\.ratio\) \* 3\.6|MAP\.reference\(me\.position\.y\)/);
console.log('Units: real mm/cm/m and cm/s–m/s in HUD, checked against the office dimensions.');
