// The biplane's two main wheels were part of the hull mesh: they could not follow the
// gear springs. This splits each wheel (a 270-triangle island at the end of a strut) into
// its own part, pivoting on the hub, so that the game can lift it with the spring's
// compression (and spin it). No triangle, UV or texture change.
//
//   node scripts/rig-biplane-wheels.mjs [--dry-run]
//
// Refuses a module whose wheels are already split.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { decode, split } from './split-vehicle-parts.mjs';

export const WHEEL_SPEC = {
  groups: [
    {
      from: 'body',
      parent: 'body',
      prefix: 'wheel',
      names: ['wheelL', 'wheelR'],
      expected: 2,
      // A wheel: a big round island (more than 250 triangles) low and far forward.
      match: (c) => c.tris > 250 && c.tris < 300 && c.centre[1] < -0.6 && c.centre[2] < -1,
      order: (a, b) => a.centre[0] - b.centre[0],
    },
  ],
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = 'src/meshy-biplane-data.ts';
  const { BIPLANE_DATA } = await import(pathToFileURL(file).href);
  const result = split(BIPLANE_DATA, WHEEL_SPEC);
  const header = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('//') && !line.includes('prettier-ignore'))
    .filter((line) => !line.includes('rig-biplane-wheels'));
  const note =
    '// Main wheels split from the hull by scripts/rig-biplane-wheels.mjs (no triangle, UV or texture change).';
  const text =
    [...header, note].join('\n') +
    '\n// prettier-ignore\nexport const BIPLANE_DATA = ' +
    JSON.stringify(result) +
    ';\n';
  const tris = (d) => d.parts.reduce((n, p) => n + decode(p.indices, Uint16Array).length / 3, 0);
  console.log(
    'parts',
    BIPLANE_DATA.parts.length,
    '→',
    result.parts.length,
    'triangles',
    tris(BIPLANE_DATA),
    '→',
    tris(result),
  );
  console.log(JSON.stringify(result.rig.filter((n) => n.name.startsWith('wheel'))));
  if (process.argv[2] !== '--dry-run') writeFileSync(file, text);
}
