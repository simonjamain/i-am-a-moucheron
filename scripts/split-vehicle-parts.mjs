// Split wheels (and, for the tank, track belts) out of an articulated Meshy vehicle module
// so that they can turn and steer. The source meshes are single textured meshes whose
// pieces are welded islands (see import-meshy-vehicle.py); this script moves some islands
// of an existing `src/meshy-<vehicle>-data.js` into their own parts. No triangle, UV or
// texture changes: every island keeps its vertices, re-expressed in the part's local
// frame (pivot at the island's centre, on the 0.0005 grid of the position encoding).
//
//   node scripts/split-vehicle-parts.mjs flaktruck [--dry-run]
//
// A vehicle that already has its split parts is refused, so the script can be re-run
// on the generated module only after restoring the unsplit one (git checkout).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const GRID = 0.0005;

// Components are matched on their welded bounding boxes (model units).
const near = (value, target, tolerance) => Math.abs(value - target) <= tolerance;
const SPECS = {
  flaktruck: {
    file: 'src/meshy-flaktruck-data.js',
    // Six tractor wheels (three axles), named in the physics order: for each axle from the
    // front, left (-x) then right (+x). Then the four trailer wheels.
    groups: [
      {
        from: 'body',
        parent: 'body',
        prefix: 'wheel',
        // ~150 triangles, 0.3 wide, 0.84 in diameter, 0.55 < |x| < 0.87.
        match: (c) =>
          c.tris >= 140 &&
          c.tris <= 160 &&
          near(c.size[0], 0.31, 0.06) &&
          near(c.size[1], 0.84, 0.08) &&
          Math.abs(c.centre[0]) > 0.5,
        order: (a, b) => a.centre[2] - b.centre[2] || a.centre[0] - b.centre[0],
        expected: 6,
      },
      {
        from: 'trailer',
        parent: 'trailer',
        prefix: 'trailerWheel',
        match: (c) =>
          c.tris >= 148 &&
          c.tris <= 156 &&
          near(c.size[0], 0.29, 0.06) &&
          near(c.size[1], 0.7, 0.08) &&
          Math.abs(c.centre[0]) > 0.4,
        order: (a, b) => a.centre[2] - b.centre[2] || a.centre[0] - b.centre[0],
        expected: 4,
      },
    ],
  },
};

const decode = (text, Type) => {
  const bytes = Buffer.from(text, 'base64');
  return new Type(bytes.buffer, bytes.byteOffset, bytes.length / Type.BYTES_PER_ELEMENT);
};
const encode = (array) =>
  Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString('base64');

// Welded connected components of a part (by vertex position, so UV seams do not split an
// island), as lists of triangle indices with their bounding box.
function components(part) {
  const positions = decode(part.positions, Int16Array),
    indices = decode(part.indices, Uint16Array);
  const key = new Map(),
    weld = new Int32Array(positions.length / 3);
  for (let i = 0; i < weld.length; i++) {
    const k = positions[3 * i] + ',' + positions[3 * i + 1] + ',' + positions[3 * i + 2];
    if (!key.has(k)) key.set(k, key.size);
    weld[i] = key.get(k);
  }
  const parent = Array.from({ length: key.size }, (_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const triangles = indices.length / 3;
  for (let t = 0; t < triangles; t++) {
    const a = find(weld[indices[3 * t]]);
    parent[find(weld[indices[3 * t + 1]])] = a;
    parent[find(weld[indices[3 * t + 2]])] = find(a);
  }
  const byRoot = new Map();
  for (let t = 0; t < triangles; t++) {
    const root = find(weld[indices[3 * t]]);
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root).push(t);
  }
  return [...byRoot.values()].map((list) => {
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (const t of list)
      for (let k = 0; k < 3; k++)
        for (let a = 0; a < 3; a++) {
          const v = positions[3 * indices[3 * t + k] + a] * GRID;
          min[a] = Math.min(min[a], v);
          max[a] = Math.max(max[a], v);
        }
    return {
      list,
      tris: list.length,
      min,
      max,
      centre: min.map((v, a) => (v + max[a]) / 2),
      size: max.map((v, a) => v - min[a]),
    };
  });
}

// Move the triangles `list` of `part` into a new part pivoting at `pivot` (world model
// units, on the grid); returns [remaining part, new part].
function extract(part, lists, pivot, name) {
  const positions = decode(part.positions, Int16Array),
    uv = decode(part.uv, Uint16Array),
    indices = decode(part.indices, Uint16Array);
  const taken = new Set(lists);
  const keep = [],
    move = [];
  for (let t = 0; t < indices.length / 3; t++) (taken.has(t) ? move : keep).push(t);
  const rebuild = (triangles, offset) => {
    const map = new Map(),
      outPositions = [],
      outUv = [],
      outIndices = [];
    for (const t of triangles)
      for (let k = 0; k < 3; k++) {
        const v = indices[3 * t + k];
        if (!map.has(v)) {
          map.set(v, map.size);
          for (let a = 0; a < 3; a++) outPositions.push(positions[3 * v + a] - offset[a]);
          outUv.push(uv[2 * v], uv[2 * v + 1]);
        }
        outIndices.push(map.get(v));
      }
    if (map.size > 65535) throw Error('part too large for 16-bit indices');
    return {
      positions: encode(Int16Array.from(outPositions)),
      uv: encode(Uint16Array.from(outUv)),
      indices: encode(Uint16Array.from(outIndices)),
    };
  };
  const grid = pivot.map((v) => Math.round(v / GRID));
  return [
    { ...part, ...rebuild(keep, [0, 0, 0]) },
    { part: name, pivot: grid.map((v) => +(v * GRID).toFixed(4)), ...rebuild(move, grid) },
  ];
}

export function split(data, spec) {
  const result = structuredClone(data);
  const names = new Set(result.parts.map((p) => p.part));
  for (const group of spec.groups) {
    const found = [];
    const source = () => result.parts.find((p) => p.part === group.from);
    const wanted = components(source()).filter(group.match).sort(group.order);
    if (wanted.length !== group.expected)
      throw Error(`${group.prefix}: expected ${group.expected} islands, matched ${wanted.length}`);
    wanted.forEach((component, i) => {
      const name = group.prefix + i;
      if (names.has(name)) throw Error(name + ' already exists: restore the unsplit module first');
      names.add(name);
      const sourceIndex = result.parts.findIndex((p) => p.part === group.from);
      // Component triangle lists refer to the part as it is now; split one island at a
      // time, recomputing (islands are few and the parts small).
      const fresh = components(source()).find(
        (c) =>
          c.tris === component.tris &&
          component.centre.every((v, a) => Math.abs(v - c.centre[a]) < 1e-9),
      );
      const [rest, piece] = extract(source(), fresh.list, component.centre, name);
      result.parts[sourceIndex] = rest;
      result.parts.push(piece);
      const parentNode =
        group.parent === 'body'
          ? { pivot: [0, 0, 0] }
          : result.rig.find((node) => node.name === group.parent);
      result.rig.push({
        name,
        parent: group.parent,
        pivot: piece.pivot,
        position: piece.pivot.map((v, a) => +(v - parentNode.pivot[a]).toFixed(4)),
        quaternion: [0, 0, 0, 1],
      });
      found.push(piece.pivot);
    });
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [vehicle, flag] = process.argv.slice(2);
  const spec = SPECS[vehicle];
  if (!spec) throw Error('usage: split-vehicle-parts.mjs ' + Object.keys(SPECS).join('|'));
  const url = pathToFileURL(path.resolve(spec.file)).href;
  const { MODEL_DATA } = await import(url);
  const result = split(MODEL_DATA, spec);
  const source = readFileSync(spec.file, 'utf8').split('\n');
  const header = source.filter(
    (line) => line.startsWith('//') && !line.includes('prettier-ignore'),
  );
  const note = `// Wheels split from the source islands by scripts/split-vehicle-parts.mjs (no triangle, UV or texture change).`;
  const text =
    [...header.filter((line) => !line.includes('split-vehicle-parts')), note].join('\n') +
    '\n// prettier-ignore\nexport const MODEL_DATA = ' +
    JSON.stringify(result) +
    ';\n';
  console.log(
    vehicle +
      ': ' +
      result.parts.length +
      ' parts (' +
      MODEL_DATA.parts.length +
      ' before), ' +
      result.parts.reduce((n, p) => n + decode(p.indices, Uint16Array).length / 3, 0) +
      ' triangles',
  );
  if (flag !== '--dry-run') writeFileSync(spec.file, text);
}
