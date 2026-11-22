// The purgatory's decor (docs/purgatory-scene.md): an administration on a cloud.
// Furniture never stands in the walkable hall (the shared physics is unchanged),
// the cloud is flat where souls walk and wider than the hall, the sky clouds stay
// clear of it, and the VIP guard's idle pose is a small, looping breath.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {
  CLOUD_FLOOR,
  COUNTER,
  PURGATORY_HALL,
  createPurgatoryScene,
  purgatoryProps,
} from '../src/purgatory-scene.ts';
import { SKY_CLOUDS, cloudHeight, cloudPuffs, createCloudFloor } from '../src/purgatory-clouds.ts';
import { PURGATORY_RULES, VIP_GUARD, VIP_LANE } from '../src/purgatory-queue.ts';
import { propFootprint, modelBoxes } from '../src/office-props.ts';
import { WALK_WORLDS } from '../src/scale.ts';
import { VIP_GUARD as GUARD_RIG, VIP_GUARD_MODEL } from '../src/vip-guard-model.ts';
import { VIP_GUARD_DATA } from '../src/vip-guard-data.js';
import { PostHighlight, selectionRect } from '../src/post-highlight.ts';

const U = WALK_WORLDS.purgatory.sceneScale;
const walk = PURGATORY_RULES.bounds({ bodies: [] });

// The flat part covers the walkable rectangle of the shared physics.
assert.ok(PURGATORY_HALL.minX <= walk.minX && PURGATORY_HALL.maxX >= walk.maxX);
assert.ok(PURGATORY_HALL.minZ <= walk.minZ && PURGATORY_HALL.maxZ >= walk.maxZ);
for (let x = walk.minX; x <= walk.maxX; x += 0.5)
  for (let z = walk.minZ; z <= walk.maxZ; z += 0.5)
    assert.equal(cloudHeight(x, z, PURGATORY_HALL), 0, 'flat where souls walk');
// The cloud reaches well past the invisible wall, lumpy at its edge.
assert.ok(CLOUD_FLOOR.minX <= walk.minX - 5 && CLOUD_FLOOR.maxX >= walk.maxX + 5);
assert.ok(CLOUD_FLOOR.maxZ >= walk.maxZ + 10);
assert.ok(cloudHeight(CLOUD_FLOOR.maxX - 0.5, 40, PURGATORY_HALL) > 0.2, 'lumps beyond the hall');
const puffs = cloudPuffs(CLOUD_FLOOR);
assert.ok(puffs.length > 80 && puffs.length < 400, 'puffs: ' + puffs.length);
for (const p of puffs) {
  const inside = p.x > walk.minX && p.x < walk.maxX && p.z > walk.minZ + 1 && p.z < walk.maxZ;
  // A puff over the hall stays under the floor.
  if (inside)
    assert.ok(p.y + p.r * p.squash <= 0.01, 'puff pokes through the hall ' + JSON.stringify(p));
}
assert.deepEqual(cloudPuffs(CLOUD_FLOOR), puffs, 'same decor for every player');
const floor = createCloudFloor(T, CLOUD_FLOOR, PURGATORY_HALL);
assert.equal(floor.children.length, 2);

// Sky clouds float clear of the ground cloud and inside the camera's reach.
for (const c of SKY_CLOUDS) {
  const clearX = c.x - c.w / 2 > CLOUD_FLOOR.maxX + 5 || c.x + c.w / 2 < CLOUD_FLOOR.minX - 5;
  const clearZ = c.z - c.d / 2 > CLOUD_FLOOR.maxZ + 5 || c.z + c.d / 2 < CLOUD_FLOOR.minZ - 5;
  const clearY = c.y - c.h / 2 > 8 || c.y + c.h / 2 < -8;
  assert.ok(clearX || clearZ || clearY, 'sky cloud overlaps the floor: ' + JSON.stringify(c));
  assert.ok(Math.hypot(c.x, c.y, c.z - 40) < 150, 'within the purgatory camera far plane');
}

// Furniture: nothing that blocks stands in the walkable hall, except the counter
// behind its front edge (z < 0), and nothing crosses the VIP ropes.
const props = purgatoryProps();
assert.ok(props.length > 60, 'a furnished office: ' + props.length);
for (const p of props) {
  if (!modelBoxes(p.model).length) continue; // small items are walked over
  const box = propFootprint(p);
  const min = { x: box.min.x * U, z: box.min.z * U },
    max = { x: box.max.x * U, z: box.max.z * U };
  const overlaps = max.x > walk.minX && min.x < walk.maxX && max.z > walk.minZ && min.z < walk.maxZ;
  assert.ok(!overlaps, p.model + ' stands in the hall at ' + [min.x, min.z, max.x, max.z]);
}
// The counter: three desks for the queue and one at the VIP window, all
// behind the edge of the hall and in front of Saint Pierre.
const desks = props.filter((p) => p.model === 'Desk');
assert.equal(desks.length, COUNTER.desks.length + 1);
for (const d of desks) {
  const box = propFootprint(d);
  assert.ok(box.max.z * U < 0, 'desk front behind the hall edge');
  assert.ok(box.min.z * U > COUNTER.saintZ, 'Saint Pierre stands behind the desks');
}
// Behind Saint Pierre: office equipment only, kept sober.
const OFFICE_EQUIPMENT = new Set(['Whiteboard', 'Filing_Cabinet', 'Photocopier', 'Bookshelf']);
const back = props.filter((p) => p.z * U < COUNTER.saintZ && Math.abs(p.x * U) < walk.maxX);
assert.ok(back.length >= 2 && back.length <= 6, 'a sober back office: ' + back.length);
for (const p of back) assert.ok(OFFICE_EQUIPMENT.has(p.model), p.model + ' behind Saint Pierre');
const ropes = VIP_LANE.filter((o) => !o.vip);
for (const p of props) {
  if (!modelBoxes(p.model).length) continue;
  const box = propFootprint(p);
  for (const o of ropes)
    assert.ok(
      box.max.z * U < 0 || box.min.x * U > o.x || box.max.x * U < o.x,
      p.model + ' crosses a rope',
    );
}

// The guard: a user-approved Meshy rig, drawn a head taller than the souls,
// breathing on a loop (the pose at 0 and 1 matches, moves stay small).
assert.equal(VIP_GUARD_DATA.source.sha256.slice(0, 8), 'b12c8906');
assert.equal(VIP_GUARD_DATA.source.bones, 48);
assert.ok(VIP_GUARD_DATA.source.triangles < 2000);
const rig = GUARD_RIG.createRig(T);
rig.container.updateMatrixWorld(true);
const size = new T.Box3().setFromObject(rig.mesh).getSize(new T.Vector3());
near(size.y, VIP_GUARD_MODEL.height * U, 0.08 * U, 'guard height');
const head = rig.bones.Bone_028;
const at = (t) => (rig.pose(t), head.getWorldPosition(new T.Vector3()));
const start = at(0),
  end = at(1 - 1e-9);
assert.ok(start.distanceTo(end) < 1e-3, 'the idle loops');
let travel = 0;
for (let t = 0; t < 1; t += 0.05) travel = Math.max(travel, at(t).distanceTo(start));
assert.ok(travel > 0.003 && travel < 0.15 * U, 'breath and look stay small: ' + travel);

// The whole scene builds without a document (software renderer: no shaders).
const built = createPurgatoryScene(T, {
  humanoid: () => new T.Group(),
  box: (parent, w, h, d, color, x, y, z) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  },
  shaders: false,
});
built.update(0.016, 1000, {
  super: false,
  saintX: 0,
  vip: false,
  deskServed: false,
  vipServed: false,
});
built.update(0.5, 1500, { super: true, saintX: 0, vip: true, deskServed: true, vipServed: false });
assert.ok(built.saint.scale.x > 1.3, 'Super Saint-Pierre is taller');
assert.ok(built.colliders.length >= 2);
assert.ok(!built.scene.getObjectByName('purgatoire-nuages-ciel'), 'no shader clouds without WebGL');
// The guard is aimed at like a vehicle post: a ray through him hits his mesh.
built.scene.updateMatrixWorld(true);
const centre = new T.Box3().setFromObject(built.guard).getCenter(new T.Vector3());
const aim = new T.Raycaster(
  new T.Vector3(centre.x, centre.y, centre.z + 6),
  new T.Vector3(0, 0, -1),
);
assert.ok(aim.intersectObject(built.guard, true).length > 0, 'the guard can be aimed at');
// Its outline mask is skinned on his own skeleton: it follows the breath and
// the look instead of staying in the bind pose.
const highlight = new PostHighlight(T, built.guard, {
  seats: [],
  local: [0, 0, 0],
  radius: 0,
  outline: { meshes: [] },
});
const masks = [];
built.guard.traverse((o) => o.name === 'post-outline' && masks.push(o));
const skin = built.scene.getObjectByName('vigile-vip-meshy');
assert.equal(masks.length, 1, 'one mask for the guard mesh');
assert.ok(
  masks[0].isSkinnedMesh && masks[0].skeleton === skin.skeleton,
  'mask on the guard skeleton',
);
assert.ok(masks[0].bindMatrix.equals(skin.bindMatrix));
// The outline pass only covers the guard's part of the screen.
const view = new T.PerspectiveCamera(62, 16 / 9, 0.1, 150);
view.position.set(centre.x - 2, centre.y + 1, centre.z + 6);
view.lookAt(centre);
view.updateMatrixWorld();
const screen = { x: 1920, y: 1080 };
assert.equal(selectionRect(T, view, screen, 8), null, 'nothing shown, no pass');
highlight.show();
built.scene.updateMatrixWorld(true);
const rect = selectionRect(T, view, screen, 8);
assert.ok(
  rect && rect.w * rect.h < 0.25 * screen.x * screen.y,
  'a small rectangle: ' + JSON.stringify(rect),
);
const middle = new T.Vector3().copy(centre).project(view);
const px = ((middle.x + 1) / 2) * screen.x,
  py = ((middle.y + 1) / 2) * screen.y;
assert.ok(px > rect.x && px < rect.x + rect.w && py > rect.y && py < rect.y + rect.h, 'around him');
highlight.hide();
assert.equal(selectionRect(T, view, screen, 8), null);
const guardSpot = built.scene.getObjectByName('vigile-vip').position;
assert.ok(Math.hypot(guardSpot.x - VIP_GUARD.x, guardSpot.z - VIP_GUARD.z) < 1e-9);

console.log(
  `Purgatory scene: ${props.length} props off the hall, ${puffs.length} puffs, ` +
    `${SKY_CLOUDS.length} sky clouds, guard ${size.y.toFixed(2)} units tall.`,
);

function near(a, b, eps, label) {
  assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} vs ${b}`);
}
