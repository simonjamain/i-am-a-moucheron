// Measures the aircraft models for the physics (src/plane-physics.ts): where the main
// wheels are, where the tail rests on the ground, and a box around each part of the
// airframe, all in model units (x to the right, y up, the nose towards -z). Writes
// src/aircraft-geometry.ts. The biplane fighter keeps its hand-fitted values (checked by
// the user in flight); the others are measured on the mesh islands.
//
//   node scripts/measure-aircraft.mjs [--dry-run]
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { components, decode } from './split-vehicle-parts.mjs';

export const MODELS = {
  bomber: ['meshy-biplane-bomber-data.ts', 'BIPLANE_BOMBER_DATA'],
  lightfighter: ['meshy-m1-data.ts', 'M1_DATA'],
  medbomber: ['meshy-b3-data.ts', 'B3_DATA'],
  interceptor: ['meshy-stuka-data.ts', 'MODEL_DATA'],
  spitfire: ['meshy-spitfire-data.ts', 'MODEL_DATA'],
};
// The medium bomber's fuselage island also holds the dorsal turret and the fin: one box around
// it all is far too bulky. Three volumes instead, nose / body / fin, fitted on the model.
const BOX_SPLITS = {
  medbomber: {
    part0: [
      { name: 'nose', half: [0.45, 0.525, 0.7], at: [0, 0.025, -4.0] },
      { name: 'body', half: [0.65, 0.75, 3.15], at: [0, 0.45, -0.15] },
      { name: 'fin', half: [0.15, 0.81, 0.8], at: [0, 1.61, 3.4] },
    ],
  },
};
const r3 = (v) => +v.toFixed(3);
// The biplane fighter, fitted by hand on its model (same values as the first flight tests).
const FIGHTER = {
  wheels: [
    { x: -0.775, y: -0.765, z: -1.546, r: 0.285 },
    { x: 0.775, y: -0.765, z: -1.546, r: 0.285 },
  ],
  ground: -1.05,
  tail: { y: -0.03, z: 2.0 },
  com: [0, 0.15, -0.9],
  boxes: [
    { name: 'fuselage', half: [0.4, 0.525, 1.285], at: [0, 0.185, -0.685] },
    { name: 'rearFuselage', half: [0.14, 0.235, 0.6], at: [0, 0.045, 0.6] },
    { name: 'fin', half: [0.05, 0.45, 0.3], at: [0, 0.5, 1.9] },
    { name: 'upperWing', half: [2.8, 0.09, 0.455], at: [0, 0.74, -0.655] },
    { name: 'lowerWing', half: [2.68, 0.11, 0.4], at: [0, -0.13, -0.88] },
    { name: 'tail', half: [0.92, 0.045, 0.31], at: [0, 0.215, 1.67] },
  ],
};

export function measure(data) {
  const ground = data.bounds[0][1];
  const maxZ = data.bounds[1][2];
  const islands = [];
  for (const part of data.parts) {
    if (part.part !== 'body' && part.part !== 'wing') continue;
    const positions = decode(part.positions, Int16Array),
      indices = decode(part.indices, Uint16Array);
    for (const c of components(part)) {
      // Lowest vertex of the rear half: where the tail would rest.
      let low = null;
      for (const t of c.list)
        for (let k = 0; k < 3; k++) {
          const v = indices[3 * t + k],
            y = positions[3 * v + 1] * 0.0005,
            z = positions[3 * v + 2] * 0.0005;
          if (z > 0.55 * maxZ && (!low || y < low.y)) low = { y, z };
        }
      islands.push({ ...c, low });
    }
  }
  // Main wheels: their own parts once split (rig-aircraft-wheels.mjs), else the two big
  // islands at the ground, mirrored about the centre line.
  const split = ['wheelL', 'wheelR'].map((name) => data.parts.find((p) => p.part === name));
  let wheels, wheelSpecs;
  if (split.every(Boolean)) {
    wheels = [];
    wheelSpecs = split.map((part) => {
      const positions = decode(part.positions, Int16Array);
      const min = [Infinity, Infinity, Infinity],
        max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < positions.length; i += 3)
        for (let a = 0; a < 3; a++) {
          const v = positions[i + a] * 0.0005 + part.pivot[a];
          min[a] = Math.min(min[a], v);
          max[a] = Math.max(max[a], v);
        }
      return {
        x: r3(part.pivot[0]),
        y: r3(part.pivot[1]),
        z: r3(part.pivot[2]),
        r: r3((max[1] - min[1] + max[2] - min[2]) / 4),
      };
    });
  } else {
    wheels = islands
      .filter((c) => c.min[1] <= ground + 0.02 && c.tris >= 50 && Math.abs(c.centre[0]) > 0.3)
      .sort((a, b) => a.centre[0] - b.centre[0]);
    if (wheels.length !== 2 || wheels[0].centre[0] > 0 || wheels[1].centre[0] < 0)
      throw Error('expected two wheel islands, found ' + wheels.length);
    wheelSpecs = wheels.map((w) => ({
      x: r3(w.centre[0]),
      y: r3(w.centre[1]),
      z: r3(w.centre[2]),
      r: r3((w.size[1] + w.size[2]) / 4),
    }));
  }
  const rear = islands
    .filter((c) => !wheels.includes(c) && c.low)
    .sort((a, b) => a.low.y - b.low.y)[0].low;
  const wheelZ = (wheelSpecs[0].z + wheelSpecs[1].z) / 2;
  const boxes = islands
    .filter(
      (c) =>
        !wheels.includes(c) &&
        c.min[1] > ground + 0.12 && // legs and hub caps at the ground belong to the gear
        Math.max(...c.size) > 0.3 &&
        c.tris >= 12,
    )
    .map((c, i) => ({
      name: 'part' + i,
      half: c.size.map((v) => Math.max(0.03, v / 2)),
      at: [...c.centre],
    }))
    // On its three wheels the aircraft rests on the line from the wheel bottoms to the tail
    // tip: a box must stay above it (with a margin) or it would carry the weight instead of
    // the gear. Its lowest edge is raised to the line at its rearmost end.
    .map((b) => {
      const line = (z) => ground + ((rear.y - ground) * (z - wheelZ)) / (rear.z - wheelZ);
      const need = line(b.at[2] + b.half[2]) + 0.08,
        bottom = b.at[1] - b.half[1],
        top = b.at[1] + b.half[1];
      if (bottom >= need) return b;
      if (top - need < 0.06) return null;
      return {
        ...b,
        at: [b.at[0], (top + need) / 2, b.at[2]],
        half: [b.half[0], (top - need) / 2, b.half[2]],
      };
    })
    .filter(Boolean)
    .map((b) => ({ name: b.name, half: b.half.map(r3), at: b.at.map(r3) }));
  return {
    wheels: wheelSpecs,
    ground: r3(ground),
    tail: { y: r3(rear.y), z: r3(rear.z) },
    // Behind the wheels: a fifth of the weight on the tail, as on a tail-dragger.
    com: [0, 0.15, r3(wheelZ + 0.2 * (rear.z - wheelZ))],
    boxes,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = { fighter: FIGHTER };
  for (const [type, [file, name]] of Object.entries(MODELS)) {
    const module = await import(pathToFileURL('src/' + file).href);
    out[type] = measure(module[name]);
    const parts = BOX_SPLITS[type];
    if (parts) out[type].boxes = out[type].boxes.flatMap((b) => parts[b.name] ?? [b]);
    console.log(type, JSON.stringify({ ...out[type], boxes: out[type].boxes.length }));
  }
  const text =
    '// Generated by scripts/measure-aircraft.mjs: model units (x right, y up, nose at -z).\n' +
    '// The fighter is fitted by hand; the others are measured on the mesh islands.\n' +
    'export interface AircraftBox {\n  name: string;\n  half: readonly number[];\n  at: readonly number[];\n}\n' +
    'export interface AircraftGeometry {\n  /** Main wheels: hub centre and radius. */\n  wheels: readonly { x: number; y: number; z: number; r: number }[];\n  /** Height of the wheel bottoms (the ground when the springs are extended). */\n  ground: number;\n  /** Where the tail rests on the ground. */\n  tail: { y: number; z: number };\n  com: readonly number[];\n  boxes: readonly AircraftBox[];\n}\n' +
    'export const AIRCRAFT_GEOMETRY: Readonly<Record<string, AircraftGeometry>> = ' +
    JSON.stringify(out, null, 2) +
    ';\n';
  if (process.argv[2] !== '--dry-run') writeFileSync('src/aircraft-geometry.ts', text);
}
