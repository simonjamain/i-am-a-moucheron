// Boarding by aiming at the post (src/seat-posts.ts, docs/ui-guidelines.md).
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { Game } from '../server/game.js';
import { VEHICLES, vehicleAccess, vehicleEntry } from '../src/fleet.ts';
import { MAP, ACTOR_UNIT } from '../src/scale.ts';
import { OFFICE_LAYOUT } from '../src/layout.ts';
import {
  SEAT_POSTS,
  POINT_BOARDING,
  POST_REACH,
  pickPost,
  pointBoarding,
} from '../src/seat-posts.ts';
import { makeB3 } from '../src/b3-model.js';
import { PostHighlight, SIGNAL_COLOR } from '../src/post-highlight.ts';

// Ray picking: nearest post along the ray, never behind, inside a sphere counts.
const posts = [
  { seat: 'near', centre: [0, 0, -5], radius: 1 },
  { seat: 'far', centre: [0, 0, -10], radius: 1 },
  { seat: 'side', centre: [3, 0, -5], radius: 1 },
];
assert.deepEqual(pickPost([0, 0, 0], [0, 0, -1], posts), { seat: 'near', distance: 4 });
assert.equal(pickPost([0, 0, 0], [0, 0, 1], posts), null, 'posts behind the eye are ignored');
assert.equal(pickPost([0, 0, 0], [0, 1, 0], posts), null);
assert.equal(pickPost([0, 0, -5], [0, 0, -1], posts).seat, 'near', 'eye inside a post');
const side = Math.SQRT1_2;
assert.equal(pickPost([0, 0, -2], [side, 0, -side], posts).seat, 'side');

// The medium bomber is boarded by aiming; every seat has exactly one post.
assert.ok(pointBoarding('medbomber') && !pointBoarding('bomber') && !pointBoarding(null));
for (const type of POINT_BOARDING)
  assert.deepEqual(
    SEAT_POSTS[type].map((p) => p.seat),
    [...VEHICLES[type].seats],
    type + ': one post per seat, in seat order',
  );
// Every outlined mesh exists in the model, and a highlight builds and shows.
const model = makeB3(T, new T.Scene());
model.scale.setScalar(ACTOR_UNIT);
for (const post of SEAT_POSTS.medbomber) {
  for (const name of post.outline.meshes)
    assert.ok(model.getObjectByName(name)?.isMesh, post.seat + ': mesh ' + name);
  const highlight = new PostHighlight(T, model, post);
  highlight.show(SIGNAL_COLOR);
  const shown = [];
  model.traverse((o) => o.userData.postOutline && o.visible && shown.push(o));
  assert.equal(shown.length, post.outline.meshes.length, post.seat + ': outline parts shown');
  assert.ok(
    shown.every((o) => o.raycast.length === 0),
    'outlines are never hit by rays',
  );
  highlight.hide();
  highlight.dispose();
}
let outlines = 0;
model.traverse((o) => o.userData.postOutline && outlines++);
assert.equal(outlines, 0, 'dispose removes the outline meshes');

// Shared reach rule: any side of the bomber, within half-span + reach; rings elsewhere.
const p = [2, VEHICLES.medbomber.gear, -1];
const medium = { type: 'medbomber', state: { p, q: [0, 0, 0, 1], hp: 100 } };
const ground = 0;
const at = (dx, dz, y = ground) => ({ x: p[0] + dx, y, z: p[2] + dz });
const reach = MAP.metres(VEHICLES.medbomber.span / 2 + POST_REACH);
for (const [dx, dz] of [
  [reach * 0.9, 0],
  [-reach * 0.9, 0],
  [0, reach * 0.9],
  [0, -reach * 0.9],
])
  assert.ok(vehicleAccess(at(dx, dz), medium, 'ventral'), `reachable from ${dx}, ${dz}`);
assert.ok(!vehicleAccess(at(reach * 1.05, 0), medium), 'too far');
assert.ok(!vehicleAccess(at(0, 0, MAP.metres(3)), medium), 'another floor');
assert.ok(!vehicleAccess({ ...at(0, 0), parachute: true }, medium), 'not under a parachute');
assert.ok(!vehicleAccess(at(0, 0), { ...medium, state: { ...medium.state, hp: 0 } }), 'wreck');
for (const seat of VEHICLES.medbomber.seats)
  assert.ok(vehicleAccess(vehicleEntry(medium, seat), medium, seat), 'old circles stay in reach');
// A ring-boarded vehicle keeps its circle rule: the far side of the hull is refused.
const biplane = { type: 'bomber', state: { p, q: [0, 0, 0, 1], hp: 100 } };
const e = vehicleEntry(biplane, 'pilot');
assert.ok(vehicleAccess(e, biplane, 'pilot'));
assert.ok(!vehicleAccess({ x: 2 * p[0] - e.x, y: e.y, z: 2 * p[2] - e.z }, biplane, 'pilot'));

// Server: a player beside the bomber, away from any circle, selects and signs a post.
const game = new Game({ now: () => 100000 });
const player = game.join({ code: 'POSTS', name: 'Pointeur' });
const room = game.rooms.get('POSTS');
const vehicle = game.createVehicle(room, 'medbomber');
const body = game.base(room, room.pilots.get(player.id));
const beside = { x: vehicle.state.p[0], z: vehicle.state.p[2] + MAP.metres(4) };
body.x = (beside.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT;
body.z = (OFFICE_LAYOUT.base.originZ - beside.z) / ACTOR_UNIT;
body.y = vehicle.state.p[1] - VEHICLES.medbomber.gear;
const report = { epoch: room.base.epoch, body: { ...body } };
const call = (path, b) => game.command('POSTS', player.id, path, b);
call('vehicle-select', { vehicle: vehicle.id, seat: 'tail', ground: report });
for (const form of [1, 2])
  call('vehicle-sign', {
    vehicle: vehicle.id,
    seat: 'tail',
    signature: true,
    form,
    ground: report,
  });
assert.equal(vehicle.seats.get('tail'), player.id, 'tail post taken from the side');
const far = { ...report, body: { ...body, x: body.x + 200 } };
const other = game.join({ code: 'POSTS', name: 'Loin' });
assert.throws(
  () =>
    game.command('POSTS', other.id, 'vehicle-select', {
      vehicle: vehicle.id,
      seat: 'pilot',
      ground: far,
    }),
  /Approchez-vous de cet appareil/,
);

console.log(
  'Seat posts: ray picking, one post per seat, outlines on real meshes, reach from any side, server boarding.',
);
