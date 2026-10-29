import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createOffice } from '../src/office.js';
import { createGraphics } from '../src/graphics.js';
import { MAP, ACTOR_UNIT, REFERENCE } from '../src/scale.js';
import { reconcileBase, advanceBase } from '../src/base.js';
import { OFFICE_LAYOUT } from '../src/layout.js';
import {
  BULLET_SPEED,
  FIRE_INTERVAL,
  AA_STATIONS,
  resolveLanding,
  stepWalker,
  GEAR_HEIGHT,
} from '../src/sortie.js';
import { createSoul, advanceArena, mergeOwnedArena } from '../src/purgatory-physics.js';
assert.equal(BULLET_SPEED, MAP.metres(REFERENCE.bullet));
assert.equal(FIRE_INTERVAL, 0.06);
const scene = new T.Scene(),
  office = createOffice(T, scene, { ...createGraphics(T, scene), textLabel: () => new T.Group() });
const previous = new T.Vector3(0, GEAR_HEIGHT + MAP.metres(0.2), 0),
  state = {
    position: new T.Vector3(0, GEAR_HEIGHT - MAP.metres(0.01), 0),
    vel: new T.Vector3(0, -MAP.metres(2), MAP.metres(18)),
    q: new T.Quaternion(),
    omega: new T.Vector3(),
  };
assert.equal(resolveLanding(T, state, previous, office.colliders, 1 / 120).landed, true);
assert.equal(state.vel.y, 0);
assert.ok(Math.abs(state.position.y - GEAR_HEIGHT) < 1e-9);
state.position.y = 0;
state.vel.y = -MAP.metres(8);
assert.equal(resolveLanding(T, state, previous, office.colliders, 1 / 120).hard, true);
state.position.y = 0;
state.vel.y = -MAP.metres(1);
state.q.setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI);
assert.equal(resolveLanding(T, state, previous, office.colliders, 1 / 120).hard, true);
const st = AA_STATIONS[0],
  base = OFFICE_LAYOUT.base,
  walker = {
    x: (st.x - base.originX) / ACTOR_UNIT,
    z: (base.originZ - st.z) / ACTOR_UNIT,
    y: base.deckY + MAP.metres(5),
    vy: 0,
    r: 0.32,
    parachute: true,
  };
for (let i = 0; i < 300; i++) stepWalker(walker, 1 / 60, office.colliders);
assert.ok(Math.abs(walker.y - base.deckY) < ACTOR_UNIT * 0.1);
assert.equal(walker.parachute, false);
// The NPC's locally completed service must survive every stale merge until ack.
const npc = createSoul({ id: 2, kind: 'enemy', entity: 'npc' }, 0, 1000),
  host = createSoul({ id: 1, kind: 'player', entity: 'host' }, 1, 1000);
host.x = 6;
host.z = 6;
let arena = { epoch: 'p', host: 'host', time: 1000, bodies: [host, npc], events: [], eventSeq: 0 };
for (let i = 0; i < 210; i++) {
  const stale = structuredClone(arena);
  advanceArena(arena, arena.time + 1000 / 60, 'host');
  if (i > 180) {
    const b = stale.bodies.find((b) => b.id === 2);
    b.gone = false;
    b.served = 0;
  }
  arena = mergeOwnedArena(stale, arena, 'host');
}
assert.equal(arena.bodies.find((b) => b.id === 2).gone, true);

console.log(
  'PASS: scale-aware soft/hard/inverted landing, deployed canopy touchdown, owned NPC service survives stale snapshots.',
);

const falling = { x: 0, z: 0, y: 2, vy: 0, r: 0.32, parachute: false };
stepWalker(falling, 0.5, []);
const firstDrop = 2 - falling.y,
  firstSpeed = falling.vy;
stepWalker(falling, 0.5, []);
assert.ok(2 - falling.y - firstDrop > firstDrop * 2.5, 'free fall must accelerate');
assert.ok(Math.abs(falling.vy) > Math.abs(firstSpeed) * 1.9);
const terminal = MAP.metres(54),
  gravity = MAP.metres(REFERENCE.gravity);
const analyticY = 2 - ((terminal * terminal) / gravity) * Math.log(Math.cosh(gravity / terminal));
assert.ok(Math.abs(falling.y - analyticY) < MAP.metres(0.003));
const lowFps = { x: 0, z: 0, y: 2, vy: 0, r: 0.32, parachute: true },
  highFps = { ...lowFps };
for (let i = 0; i < 30; i++) stepWalker(lowFps, 0.1, []);
for (let i = 0; i < 360; i++) stepWalker(highFps, 1 / 120, []);
assert.ok(Math.abs(lowFps.y - highFps.y) < 1e-9);
assert.ok(Math.abs(lowFps.vy + MAP.metres(REFERENCE.parachute)) < MAP.metres(0.001));
const runner = createSoul({ id: 1, entity: 'runner', kind: 'player' }, 0, 1000);
runner.x = 0;
runner.z = 0;
const running = reconcileBase(
  { time: 1000, bodies: [runner] },
  [{ id: 'runner', life: 'alive', mode: 'foot', bay: 0 }],
  1000,
);
for (let i = 0; i < 240; i++) {
  runner.input = { x: 1, z: 0 };
  runner.inputAt = running.time;
  advanceBase(running, running.time + 1000 / 60, 'runner');
}
assert.ok(
  Math.abs((runner.vx * ACTOR_UNIT) / MAP.ratio - REFERENCE.walk) < 0.4,
  'running speed in reference metres per second',
);
console.log(
  'PASS: 6m/s reference running, accelerating free fall, aerodynamic canopy terminal velocity and frame-rate invariance.',
);
