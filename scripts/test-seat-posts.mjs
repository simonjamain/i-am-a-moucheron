// Boarding by aiming at the post (src/seat-posts.ts, docs/ui-guidelines.md).
import assert from 'node:assert/strict';
import * as T from '../vendor/three.webgpu.min.js';
import { Game } from '../server/game.js';
import { VEHICLES, vehicleAccess, vehicleEntry } from '../src/fleet.ts';
import { MAP, ACTOR_UNIT } from '../src/scale.ts';
import { OFFICE_LAYOUT } from '../src/layout.ts';
import { SEAT_POSTS, aimPost, freeSeat, pickPost, postReach } from '../src/seat-posts.ts';
import { createGraphics } from '../src/graphics.ts';
import { PostHighlight, SELECTION_LAYER } from '../src/post-highlight.ts';

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

// The surface actually hit picks the post it lies deepest in: a roof gun inside the
// turret's sphere wins over the turret; a surface outside every post hides the spheres.
const nested = [
  { seat: 'turret', centre: [0, 0, -5], radius: 2 },
  { seat: 'roof', centre: [0, 1, -5], radius: 0.6 },
];
const roof = { point: [0, 1.2, -4.8], distance: 4.8 };
assert.equal(aimPost([0, 0, 0], [0, 0, -1], nested, roof).seat, 'roof');
assert.equal(
  aimPost([0, 0, 0], [0, 0, -1], nested, { point: [0, -1, -3.5], distance: 3.6 }).seat,
  'turret',
);
assert.equal(
  aimPost([0, 0, 0], [0, 0, -1], nested, { point: [0, 0, -1], distance: 1 }),
  null,
  'a wing in front hides the post',
);
assert.equal(aimPost([0, 0, 0], [0, 0, -1], nested, null).seat, 'turret', 'margin: no surface');

// Every vehicle is boarded by aiming; each seat belongs to exactly one post.
for (const [type, profile] of Object.entries(VEHICLES))
  assert.deepEqual(
    (SEAT_POSTS[type] || []).flatMap((p) => p.seats),
    [...profile.seats],
    type + ': every seat in exactly one post, in seat order',
  );
// A cabin post boards its first free seat.
const cabin = SEAT_POSTS.flyingcastor[1];
assert.equal(freeSeat(cabin, []), 'passenger1');
assert.equal(freeSeat(cabin, [{ seat: 'passenger1' }, { seat: 'passenger3' }]), 'passenger2');
assert.equal(
  freeSeat(cabin, [{ seat: 'passenger1' }, { seat: 'passenger2' }, { seat: 'passenger3' }]),
  undefined,
);
// Every outlined mesh exists in its model, every post lies on (or against) its model,
// and a highlight builds and shows.
const graphics = createGraphics(T, new T.Scene());
const FACTORIES = {
  fighter: 'makePlane',
  lightfighter: 'makeLightFighter',
  spitfire: 'makeSpitfire',
  interceptor: 'makeStuka',
  bomber: 'makeBomber',
  medbomber: 'makeMediumBomber',
  tank: 'makeTank',
  helicopter: 'makeHelicopter',
  flaktruck: 'makeFlakTruck',
  castor: 'makeCastor',
  flyingcastor: 'makeFlyingCastor',
};
assert.deepEqual(Object.keys(FACTORIES).sort(), Object.keys(VEHICLES).sort());
for (const [type, factory] of Object.entries(FACTORIES)) {
  const model = graphics[factory]('#7b8155');
  model.scale.setScalar(ACTOR_UNIT);
  model.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(model);
  for (const post of SEAT_POSTS[type]) {
    const name = type + ':' + post.seats[0];
    for (const mesh of post.outline.meshes)
      assert.ok(model.getObjectByName(mesh)?.isMesh, name + ': mesh ' + mesh);
    const centre = model.localToWorld(new T.Vector3(...post.local));
    assert.ok(
      box.distanceToPoint(centre) < post.radius * ACTOR_UNIT,
      name + ': the aiming sphere touches the model',
    );
    const highlight = new PostHighlight(T, model, post);
    highlight.show();
    const shown = [];
    model.traverse((o) => o.userData.postOutline && o.visible && shown.push(o));
    assert.equal(shown.length, post.outline.meshes.length, name + ': outline parts shown');
    const camera = new T.PerspectiveCamera();
    assert.ok(
      shown.every((o) => !o.layers.test(camera.layers) && o.layers.isEnabled(SELECTION_LAYER)),
      'mask meshes are invisible to the game camera, only in the selection layer',
    );
    assert.ok(
      shown.every((o) => o.raycast.length === 0),
      'outlines are never hit by rays',
    );
    highlight.hide();
    highlight.dispose();
  }
  let outlines = 0;
  model.traverse((o) => o.userData.postOutline && outlines++);
  assert.equal(outlines, 0, type + ': dispose removes the outline meshes');
}

// Shared reach rule: any side of the vehicle, within its half-size + reach.
const p = [2, VEHICLES.medbomber.gear, -1];
const ground = 0;
const at = (dx, dz, y = ground) => ({ x: p[0] + dx, y, z: p[2] + dz });
for (const [type, profile] of Object.entries(VEHICLES)) {
  const v = { type, state: { p: [p[0], profile.gear, p[2]], q: [0, 0, 0, 1], hp: 100 } };
  const reach = MAP.metres(postReach(profile));
  for (const [dx, dz] of [
    [reach * 0.9, 0],
    [-reach * 0.9, 0],
    [0, reach * 0.9],
    [0, -reach * 0.9],
  ])
    assert.ok(vehicleAccess(at(dx, dz), v), `${type}: reachable from ${dx}, ${dz}`);
  assert.ok(!vehicleAccess(at(reach * 1.05, 0), v), type + ': too far');
  for (const seat of profile.seats)
    assert.ok(vehicleAccess(vehicleEntry(v, seat), v), type + ': old circles stay in reach');
}
const medium = { type: 'medbomber', state: { p, q: [0, 0, 0, 1], hp: 100 } };
assert.ok(!vehicleAccess(at(0, 0, MAP.metres(3)), medium), 'another floor');
assert.ok(!vehicleAccess({ ...at(0, 0), parachute: true }, medium), 'not under a parachute');
assert.ok(!vehicleAccess(at(0, 0), { ...medium, state: { ...medium.state, hp: 0 } }), 'wreck');

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
  'Seat posts: ray picking, every seat of every vehicle on one post, cabins, outlines on real meshes, reach from any side, server boarding.',
);
