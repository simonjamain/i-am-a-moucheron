// The medium tank's wheel hubs (the hexagonal cap on the outer face of each road wheel, idler and
// sprocket) were left in the hull when the wheels were split out (split-vehicle-parts.mjs): they
// stayed in place while the wheels rode the terrain. This moves each hub island into its wheel's
// part, re-expressed in the wheel's frame. No triangle, UV or texture change.
//
//   node scripts/rig-tank-hubs.mjs [--dry-run]
//
// Refuses a module whose wheels already carry their hub (the body no longer holds 12 hub islands).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { components, decode, encode, extract } from './split-vehicle-parts.mjs';

const WHEEL = /^(roadWheel|idler|sprocket)\d+$/;

export function rigHubs(data) {
  const result = structuredClone(data);
  const wheels = result.parts.filter((p) => WHEEL.test(p.part));
  if (wheels.length !== 12) throw Error('expected 12 wheel parts, found ' + wheels.length);
  for (const wheel of wheels) {
    const index = result.parts.findIndex((p) => p.part === 'body');
    // The hub is the 22-triangle island on the wheel's axle, just outside it.
    const hubs = components(result.parts[index]).filter(
      (c) =>
        c.tris === 22 &&
        Math.abs(c.centre[1] - wheel.pivot[1]) < 0.05 &&
        Math.abs(c.centre[2] - wheel.pivot[2]) < 0.06 &&
        Math.abs(c.centre[0] - wheel.pivot[0]) < 0.2,
    );
    if (hubs.length !== 1)
      throw Error(`${wheel.part}: expected one hub island, found ${hubs.length} (already done?)`);
    const [rest, piece] = extract(result.parts[index], hubs[0].list, wheel.pivot, 'hub');
    result.parts[index] = rest;
    // Append the hub's vertices and triangles to the wheel part (same frame, same encodings).
    const positions = decode(wheel.positions, Int16Array),
      uv = decode(wheel.uv, Uint16Array),
      indices = decode(wheel.indices, Uint16Array);
    const hubPositions = decode(piece.positions, Int16Array),
      hubUv = decode(piece.uv, Uint16Array),
      hubIndices = decode(piece.indices, Uint16Array);
    const offset = positions.length / 3;
    if (offset + hubPositions.length / 3 > 65535) throw Error('part too large for 16-bit indices');
    const join = (a, b, Type) => {
      const out = new Type(a.length + b.length);
      out.set(a);
      out.set(b, a.length);
      return out;
    };
    wheel.positions = encode(join(positions, hubPositions, Int16Array));
    wheel.uv = encode(join(uv, hubUv, Uint16Array));
    wheel.indices = encode(
      join(
        indices,
        Uint16Array.from(hubIndices, (i) => i + offset),
        Uint16Array,
      ),
    );
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = 'src/meshy-tank-data.ts';
  const { MODEL_DATA } = await import(pathToFileURL(file).href);
  const result = rigHubs(MODEL_DATA);
  const header = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('//') && !line.includes('prettier-ignore'));
  const note =
    '// Wheel hubs moved into their wheels by scripts/rig-tank-hubs.mjs (no triangle, UV or texture change).';
  const text =
    [...header, note].join('\n') +
    '\n// prettier-ignore\nexport const MODEL_DATA = ' +
    JSON.stringify(result) +
    ';\n';
  const tris = (d) => d.parts.reduce((n, p) => n + decode(p.indices, Uint16Array).length / 3, 0);
  console.log('triangles', tris(MODEL_DATA), '→', tris(result));
  if (process.argv[2] !== '--dry-run') writeFileSync(file, text);
}
