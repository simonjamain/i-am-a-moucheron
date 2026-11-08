// Issue #107: ground pheromone trails are readable ribbons with direction
// chevrons, built from the same predicted path the insects walk (#97).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../vendor/three.module.min.js';
import {
  PheromoneTrails,
  TRAIL,
  chevronStations,
  polylineLengths,
  ribbonGeometry,
  sampleAt,
} from '../src/pheromone-trail.js';
import { predictedGroundPaths } from '../src/wave-ground-paths.js';

const path = [
  [0, 0.003, 0],
  [1, 0.003, 0],
  [1, 0.003, 1],
];
assert.deepEqual(polylineLengths(path), [0, 1, 2]);
const mid = sampleAt(path, [0, 1, 2], 1.5);
assert.ok(Math.abs(mid.x - 1) < 1e-12 && Math.abs(mid.z - 0.5) < 1e-12);
assert.deepEqual([mid.dx, mid.dz], [0, 1], 'heading toward the end');

// Ribbon: two vertices per point at ± width/2 across the path, all on the floor.
const ribbon = ribbonGeometry(path, 0.04, 0.0035);
assert.equal(ribbon.positions.length, path.length * 2 * 3);
assert.equal(ribbon.indices.length, (path.length - 1) * 6);
for (let i = 1; i < ribbon.positions.length; i += 3) assert.equal(ribbon.positions[i], 0.0035);
const [ax, , az, bx, , bz] = ribbon.positions;
assert.ok(Math.abs(Math.hypot(ax - bx, az - bz) - 0.04) < 1e-12, 'exact width');
assert.ok(Math.abs(ax - bx) < 1e-12, 'perpendicular to the first leg');

// Chevrons drift toward the bin over time, evenly spaced, bounded.
const early = chevronStations(2, 0),
  later = chevronStations(2, 0.5);
assert.ok(later[0] > early[0], 'stations move along the path');
assert.ok(early.every((d, i) => !i || Math.abs(d - early[i - 1] - TRAIL.spacing) < 1e-9));
assert.ok(chevronStations(1000, 0).length <= TRAIL.maxChevrons);
assert.deepEqual(chevronStations(0, 1), []);

// Real paths of the three ground portals, rendered and animated.
const scene = new T.Scene();
const trails = new PheromoneTrails(T, scene);
const groups = [0, 1, 2].map((portalIndex) => ({ ground: true, type: 'ant', portalIndex }));
const paths = predictedGroundPaths({ groups, walls: [] }).map((p) => p.points);
trails.set(paths);
assert.equal(trails.paths.length, 3);
assert.equal(scene.children.length, 9, 'underlay, ribbon and chevrons per path');
const ribbonMesh = trails.paths[0].objects[1];
assert.ok(ribbonMesh.material.transparent && ribbonMesh.material.opacity < 1, 'semi-transparent');
assert.equal(ribbonMesh.material.side, T.DoubleSide, 'visible from above');
assert.ok(ribbonMesh.material.alphaMap, 'soft edges');
trails.animate(1.25);
const { chevrons, points, lengths } = trails.paths[0];
assert.ok(chevrons.count > 5);
const m = new T.Matrix4(),
  p = new T.Vector3(),
  q = new T.Quaternion();
chevrons.getMatrixAt(0, m);
m.decompose(p, q, new T.Vector3());
const first = sampleAt(points, lengths, chevronStations(trails.paths[0].total, 1.25)[0]);
assert.ok(Math.hypot(p.x - first.x, p.z - first.z) < 1e-6, 'chevron on the walked path');
const tip = new T.Vector3(1, 0, 0).applyQuaternion(q);
assert.ok(tip.x * first.dx + tip.z * first.dz > 0.99, 'chevron points toward the bin');
// Per-frame cost stays small.
const started = performance.now();
for (let i = 0; i < 300; i++) trails.animate(i / 60);
const perFrame = (performance.now() - started) / 300;
assert.ok(perFrame < 2, 'animate budget ' + perFrame.toFixed(3) + ' ms');
trails.set([]);
assert.equal(scene.children.length, 0, 'clearing removes every mesh');
trails.set(paths, true);
assert.equal(trails.paths[0].objects[1].material.color.getHexString(), TRAIL.draft.slice(1));

// The forecast scene draws these ribbons from the predicted paths and animates them.
const forecast = readFileSync('src/wave-forecast-scene.js', 'utf8');
assert.match(forecast, /this\.trails\.set\(/);
assert.match(forecast, /this\.trails\.animate\(now \/ 1000\)/);
assert.doesNotMatch(forecast, /new T\.Line\(/, 'no more 1-pixel lines');
console.log(
  'Pheromone trails: soft ribbons + underlay, chevrons toward the bin, bounded, ' +
    perFrame.toFixed(3) +
    ' ms/frame.',
);
