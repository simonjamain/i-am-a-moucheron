import { muzzleAim } from '../src/personal-aim.js';
// Executes the current pistol() function in a controlled Three.js scene.
import * as T from '../vendor/three.module.min.js';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAP } from '../src/scale.js';
import { nearestInsectHit, nearestMeshHit } from '../src/insect-hits.js';
const source = readFileSync('src/client.js', 'utf8'),
  pistol = source.slice(
    source.indexOf('function pistol()'),
    source.indexOf('let crewRenderKey', source.indexOf('function pistol()')),
  );
function shoot({ camera, target, colliders = [] }) {
  const scene = new T.Scene(),
    mesh = new T.Mesh(new T.SphereGeometry(0.002, 12, 8), new T.MeshBasicMaterial());
  mesh.position.copy(target);
  scene.add(mesh);
  const actions = [];
  const person = new T.Group(),
    muzzle = new T.Object3D();
  muzzle.position.set(0.003, 0.01, 0);
  person.add(muzzle);
  person.userData.pistolMuzzle = muzzle;
  scene.add(person);
  const c = {
    T,
    MAP,
    joined: true,
    controlFocus: { active: true },
    boardingBusy: false,
    soulBusy: false,
    canCapture: () => true,
    myVehicle: null,
    turretIndex: -1,
    onFoot: true,
    respawnAt: 0,
    camera,
    purgCamera: camera,
    scene,
    purgScene: scene,
    id: 'me',
    shotSequence: 0,
    insects: new Map([[0, mesh]]),
    localKills: new Set(),
    snap: { vehicles: [], pilots: [] },
    fleetModels: new Map(),
    basePeople: new Map([['me', person]]),
    muzzleAim,
    posePersonalWeapon() {},
    turrets: [],
    colliders,
    nearestInsectHit,
    nearestMeshHit,
    sound: { play() {} },
    action: (route, b) => actions.push({ route, ...b }),
    damageEnemy: (enemy, amount) => actions.push({ enemy, amount }),
    setTimeout: (fn) => fn(),
  };
  vm.createContext(c);
  vm.runInContext(pistol, c);
  vm.runInContext('pistol()', c);
  return actions;
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
horizontal.position.set(0, 0.01, 0.02);
horizontal.lookAt(0, 0.01, -1);
horizontal.updateMatrixWorld();
assert.equal(shoot({ camera: horizontal, target: new T.Vector3(0, 0.01, -0.2) }).length, 1);
assert.equal(shoot({ camera: horizontal, target: new T.Vector3(0, 0.01, -0.5) }).length, 0);
assert.equal(
  shoot({
    camera: horizontal,
    target: new T.Vector3(0, 0.01, -0.2),
    colliders: [new T.Box3(new T.Vector3(-0.01, 0, 0.005), new T.Vector3(0.01, 0.03, 0.015))],
  }).length,
  0,
);
console.log(
  JSON.stringify(
    {
      defaultView: {
        directionY: dir.y,
        groundHitReferenceMetres: MAP.reference(Math.abs(groundPoint.z)),
      },
      rangeWorldMetres: 150 * MAP.ratio,
      tests: {
        nearTarget: 'hit: 10 PV',
        beyond45cm: 'no hit',
        obstacleBehindActorButInFrontOfCamera: 'shot blocked',
      },
    },
    null,
    2,
  ),
);
