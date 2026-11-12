// Castor V top view (camera above the truck, floor cursor) and the green
// refuel spheres drawn with the radii the paid service really uses.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {
  TOP_VIEW_CURSOR_LIMIT,
  TOP_VIEW_HEIGHT,
  moveTopCursor,
  resetTopCursor,
  topViewGroundPoint,
  topViewPose,
} from '../src/castor-top-view.js';
import { ServiceZones, serviceZoneList } from '../src/service-zones.js';
import { CASTOR_SERVICE_RADIUS, SERVICE_RADIUS } from '../src/logistics.js';
import { withinService } from '../src/paid-service.js';

// A truck standing on a 5 cm high deck, heading +X (east): the view stays north-up.
const truck = new T.Vector3(1, 0.05, 2);
const pose = topViewPose(T, truck);
assert.ok(pose.eye.distanceTo(truck.clone().add(new T.Vector3(0, TOP_VIEW_HEIGHT, 0))) < 1e-12);
assert.ok(pose.up.distanceTo(new T.Vector3(0, 0, -1)) < 1e-9, 'screen up is north (-Z)');
for (const yaw of [0, 1, -Math.PI / 2, 2.5])
  assert.deepEqual(
    topViewPose(
      T,
      truck,
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
    ).up.toArray(),
    pose.up.toArray(),
    'the heading of the truck never turns the view',
  );

const camera = new T.PerspectiveCamera(62, 16 / 9, 0.00005, 40);
camera.position.copy(pose.eye);
camera.up.copy(pose.up);
camera.lookAt(pose.target);
camera.updateMatrixWorld();
const ground = 0;
const below = topViewGroundPoint(T, camera, { x: 0, y: 0 }, ground);
assert.ok(Math.hypot(below.x - truck.x, below.z - truck.z) < 1e-9, 'centre cursor under truck');
const ahead = topViewGroundPoint(T, camera, { x: 0, y: 0.8 }, ground);
assert.ok(truck.z - ahead.z > 0.15 && Math.abs(ahead.x - truck.x) < 1e-9, 'screen top is north');
const right = topViewGroundPoint(T, camera, { x: 0.8, y: 0 }, ground);
assert.ok(
  right.x - truck.x > 0.15 && Math.abs(right.z - truck.z) < 1e-9,
  'screen right is east (+X)',
);
// The building reach (24 cm) fits on screen in every direction.
const edge = topViewGroundPoint(T, camera, { x: 0, y: TOP_VIEW_CURSOR_LIMIT }, ground);
assert.ok(edge.distanceTo(new T.Vector3(truck.x, 0, truck.z)) > 0.24, 'reach visible');

// The mouse moves the cursor in screen space and it stays on screen.
const cursor = resetTopCursor({});
assert.deepEqual(cursor, { x: 0, y: 0.3 });
moveTopCursor(cursor, 100, -50, { width: 1000, height: 500 });
assert.ok(Math.abs(cursor.x - 0.2) < 1e-12 && Math.abs(cursor.y - 0.5) < 1e-12);
moveTopCursor(cursor, 1e6, 1e6, { width: 1000, height: 500 });
assert.deepEqual(cursor, { x: TOP_VIEW_CURSOR_LIMIT, y: -TOP_VIEW_CURSOR_LIMIT });

// Refuel spheres: fixed stations and living Castors only, real service radii.
const station = { kind: 'refuel', x: 0.5, y: 0.02, z: -1, slot: 4 };
const fleet = [
  { id: 'c1', type: 'castor', state: { hp: 40, p: [2, 0.004, 2] } },
  { id: 'c2', type: 'castor', state: { hp: 0, p: [3, 0.004, 3] } },
  { id: 't1', type: 'tank', state: { hp: 40, p: [2, 0.004, 2] } },
];
const zones = serviceZoneList([station, { kind: 'dca', x: 0, y: 0, z: 0 }], fleet);
assert.deepEqual(
  zones.map((z) => [z.key, z.radius]),
  [
    ['station:4', SERVICE_RADIUS],
    ['castor:c1', CASTOR_SERVICE_RADIUS],
  ],
);
// A plane just inside each sphere is served; just outside is not.
const plane = (p) => ({ type: 'spitfire', state: { hp: 100, p } });
for (const zone of zones) {
  const inside = [zone.p[0] + zone.radius * 0.99, zone.p[1], zone.p[2]];
  const outside = [zone.p[0] + zone.radius * 1.01, zone.p[1], zone.p[2]];
  assert.ok(withinService(plane(inside), [station], fleet), zone.key + ' inside served');
  assert.ok(!withinService(plane(outside), [station], fleet), zone.key + ' outside not served');
}

const scene = new T.Scene();
const spheres = new ServiceZones(T, scene);
const displayed = new T.Vector3(2.01, 0.004, 2);
spheres.update(zones, (zone) => (zone.vehicle === 'c1' ? displayed : null));
const meshes = scene.children.filter((o) => o.name === 'service-zone');
assert.equal(meshes.length, 2);
assert.equal(meshes[0].geometry, meshes[1].geometry, 'shared sphere geometry');
assert.equal(meshes[0].material, meshes[1].material, 'shared material');
assert.ok(meshes[0].material.transparent && !meshes[0].material.depthWrite);
assert.equal(meshes[0].scale.x, SERVICE_RADIUS);
assert.ok(meshes[1].position.equals(displayed), 'follows the displayed Castor');
assert.equal(meshes[1].scale.x, CASTOR_SERVICE_RADIUS);
spheres.update(zones.slice(0, 1));
assert.equal(scene.children.length, 1, 'a destroyed Castor loses its sphere');
spheres.update([]);
assert.equal(scene.children.length, 0);
console.log('Castor top view and refuel spheres OK');
