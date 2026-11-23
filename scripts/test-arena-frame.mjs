// One world for every place where people walk (src/arena-frame.ts): the office
// deck and Saint Pierre's cloud are two arenas placed in office metres, walked by
// the same walker and drawn at the same size.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {
  arenaWorld,
  worldArena,
  OFFICE_CEILING,
  PURGATORY_ALTITUDE,
  PURGATORY_FRAME,
} from '../src/arena-frame.ts';
import { OFFICE_FRAME, baseWorld, BASE_WALK_RADIUS } from '../src/base.ts';
import { LAYOUT_BOUNDS } from '../src/layouts.ts';
import { OFFICE_LAYOUT } from '../src/layout.ts';
import { ACTOR_UNIT, MAP, PERSON_HEIGHT, HUMANOID_UNITS, WALKER_RADIUS } from '../src/scale.ts';
import { createSoul, SOUL_RADIUS } from '../src/purgatory-queue.ts';
import { createPurgatoryScene } from '../src/purgatory-scene.ts';
import { stepWalker } from '../src/sortie.ts';

const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) < eps, `${label}: ${a} vs ${b}`);

// The cloud floats about 150 real metres above the office's former ceiling.
assert.equal(OFFICE_CEILING, LAYOUT_BOUNDS.ceiling, 'office ceiling');
near(PURGATORY_ALTITUDE / MAP.ratio, 150, 1e-9, 'altitude in metres');
near(PURGATORY_FRAME.originY, OFFICE_CEILING + PURGATORY_ALTITUDE, 1e-12, 'cloud floor');
near(PURGATORY_FRAME.unit, MAP.metres(PERSON_HEIGHT / HUMANOID_UNITS), 1e-15, 'arena unit');
assert.equal(PURGATORY_FRAME.mirrorZ, false);

// Frames turn arena points into world points and back.
for (const frame of [OFFICE_FRAME, PURGATORY_FRAME])
  for (const p of [
    { x: 0, z: 0 },
    { x: 3.5, z: -7.25 },
    { x: -12, z: 40 },
  ]) {
    const w = arenaWorld(frame, p);
    assert.equal(w.y, frame.originY, 'floor height by default');
    const back = worldArena(frame, w.x, w.z);
    near(back.x, p.x, 1e-9, 'x round trip');
    near(back.z, p.z, 1e-9, 'z round trip');
  }
// The office deck is unchanged: its origin follows the active plan, its z mirrored.
const b = OFFICE_LAYOUT.base;
assert.deepEqual(baseWorld({ x: 2, z: 3 }), {
  x: b.originX + 2 * ACTOR_UNIT,
  y: b.deckY,
  z: b.originZ - 3 * ACTOR_UNIT,
});

// Same person everywhere: the same walking radius in metres.
near((BASE_WALK_RADIUS * ACTOR_UNIT) / MAP.ratio, WALKER_RADIUS, 1e-12, 'office radius');
near((SOUL_RADIUS * PURGATORY_FRAME.unit) / MAP.ratio, WALKER_RADIUS, 1e-12, 'soul radius');

// The decor stands at the frame: Saint Pierre on the cloud, 1.85 m tall.
const scene = createPurgatoryScene(T, {
  box: (parent, w, h, d, color, x, y, z) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  },
  shaders: false,
});
scene.scene.updateMatrixWorld(true);
const saint = new T.Box3().setFromObject(scene.saint);
near(saint.min.y, PURGATORY_FRAME.originY, MAP.metres(0.1), 'Saint Pierre stands on the cloud');
near((saint.max.y - saint.min.y) / MAP.ratio, 1.85, 0.1, 'Saint Pierre in metres');
near(scene.hover, PURGATORY_FRAME.originY, 1e-12, 'no mist without shaders: insects at the floor');

// A soul walks with the office walker on the cloud's floor, and the counter
// stops it like any office furniture.
const soul = { ...createSoul({ id: 1, entity: 'p', kind: 'player' }, 0, 0), grounded: true };
assert.equal(soul.y, PURGATORY_FRAME.originY, 'a soul is created on the cloud');
Object.assign(soul, { x: 0, z: 0.5, vz: -2 });
for (let i = 0; i < 60; i++) {
  soul.z += soul.vz / 60;
  stepWalker(soul, 1 / 60, scene.colliders, null, PURGATORY_FRAME);
}
const counter = scene.colliders[0];
const front = worldArena(PURGATORY_FRAME, 0, counter.max.z).z;
assert.ok(soul.grounded, 'still standing on the cloud');
near(soul.z, front + SOUL_RADIUS, 1e-6, 'the counter stops the soul');
assert.ok(soul.vz >= 0, 'no speed into the counter');
console.log('Arena frames: one world, cloud 150 m above the office, same walker and radius.');
