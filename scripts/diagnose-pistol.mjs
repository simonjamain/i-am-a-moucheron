import { makeTracer, makeShotTrace, moveShotTrace } from '../src/tracers.js';
import { muzzleAim } from '../src/personal-aim.js';
// Executes the current pistol() function in a controlled Three.js scene.
import * as T from '../vendor/three.module.min.js';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAP } from '../src/scale.js';
import { nearestMeshHit } from '../src/insect-hits.js';
const source = readFileSync('src/client.js', 'utf8'),
  pistol = source.slice(
    source.indexOf('function pistol()'),
    source.indexOf('let crewRenderKey', source.indexOf('function pistol()')),
  );
async function shoot({ camera, target, colliders = [], office = false }) {
  const scene = new T.Scene(),
    mesh = new T.Mesh(new T.SphereGeometry(0.4, 12, 8), new T.MeshBasicMaterial());
  mesh.position.copy(target);
  scene.add(mesh);
  const actions = [],
    traces = [];
  const person = new T.Group(),
    muzzle = new T.Object3D();
  muzzle.position.set(0.003, 0.01, 0);
  person.add(muzzle);
  person.userData.pistolMuzzle = muzzle;
  scene.add(person);
  const c = {
    T,
    makeTracer,
    makeShotTrace,
    moveShotTrace,
    performance,
    MAP,
    joined: true,
    controlFocus: { active: true },
    groundDefenseUI: { active: false },
    boardingBusy: false,
    soulBusy: false,
    canCapture: () => true,
    myVehicle: null,
    turretIndex: -1,
    onFoot: true,
    respawnAt: office ? 0 : 1,
    camera,
    purgCamera: camera,
    scene,
    purgScene: scene,
    id: 'me',
    shotSequence: 0,
    soulArena: {
      bodies: [
        { id: 7, kind: 'enemy', entity: null },
        { id: 1, kind: 'player', entity: 'me' },
      ],
    },
    soulMeshes: new Map([
      [7, mesh],
      [1, person],
    ]),
    purgColliders: colliders,
    snap: { vehicles: [], pilots: [{ id: 'me', incarnation: 0, pistolAmmo: 120 }] },
    pendingPistolShots: new Set(),
    PISTOL_CAPACITY: 120,
    notify() {},
    muzzleAim,
    posePersonalWeapon() {},
    nearestMeshHit,
    sound: { play() {} },
    action: (route, b) => {
      if (route === 'pistol-trace') traces.push(b);
      else actions.push({ route, ...b });
      return true;
    },
    setTimeout: (fn) => fn(),
  };
  vm.createContext(c);
  vm.runInContext(pistol, c);
  vm.runInContext('pistol()', c);
  await Promise.resolve();
  await Promise.resolve();
  return office ? traces : actions;
}
const camera = new T.PerspectiveCamera();
camera.position.set(0, MAP.metres(1.35 + 5.2 * Math.sin(0.24)), MAP.metres(5.2 * Math.cos(0.24)));
camera.lookAt(0, MAP.metres(1.35), 0);
camera.updateMatrixWorld();
const dir = camera.getWorldDirection(new T.Vector3()),
  ground = new T.Plane(new T.Vector3(0, 1, 0), 0),
  groundPoint = new T.Ray(camera.position, dir).intersectPlane(ground, new T.Vector3());
assert.ok(groundPoint && Math.abs(groundPoint.z) < 0.03);
assert.ok(dir.y < 0);
const horizontal = new T.PerspectiveCamera();
horizontal.position.set(0, 1, 2);
horizontal.lookAt(0, 1, -100);
horizontal.updateMatrixWorld();
// Purgatory (scale 1, 150 units of range): hits a soul, misses beyond range, walls block.
const sphere = (z) => new T.Vector3(0, 1, z);
assert.equal((await shoot({ camera: horizontal, target: sphere(-20) })).length, 1);
assert.equal((await shoot({ camera: horizontal, target: sphere(-200) })).length, 0);
assert.equal(
  (
    await shoot({
      camera: horizontal,
      target: sphere(-20),
      colliders: [new T.Box3(new T.Vector3(-1, 0, -6), new T.Vector3(1, 3, -5))],
    })
  ).length,
  0,
);
// Office: no weapon on foot, not even a trace request.
assert.equal((await shoot({ camera: horizontal, target: sphere(-20), office: true })).length, 0);
console.log(
  JSON.stringify(
    {
      defaultView: {
        directionY: dir.y,
        groundHitReferenceMetres: MAP.reference(Math.abs(groundPoint.z)),
      },
      purgatoryRange: 150,
      tests: {
        purgatorySoul: 'hit',
        beyondRange: 'no hit',
        purgatoryWall: 'shot blocked',
        office: 'no pistol',
      },
    },
    null,
    2,
  ),
);
