// The aircraft's two main wheels were part of the hull mesh: they could not follow the
// gear springs (the biplane fighter is done by rig-biplane-wheels.mjs). This splits each
// wheel, with the small hub islands inside it, into its own part pivoting on the hub, so
// that the game can lift it with the spring's compression and spin it. No triangle, UV
// or texture change.
//
//   node scripts/rig-aircraft-wheels.mjs [--dry-run]
//
// Skips a module whose wheels are already split.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { components, decode, extract } from './split-vehicle-parts.mjs';
import { MODELS } from './measure-aircraft.mjs';

export function splitWheels(data) {
  if (data.parts.some((p) => p.part === 'wheelL')) return null;
  const result = structuredClone(data);
  const ground = data.bounds[0][1];
  const index = result.parts.findIndex((p) => p.part === 'body');
  const islands = components(result.parts[index]);
  const wheels = islands
    .filter((c) => c.min[1] <= ground + 0.02 && c.tris >= 50 && Math.abs(c.centre[0]) > 0.3)
    .sort((a, b) => a.centre[0] - b.centre[0]);
  if (wheels.length !== 2) throw Error('expected two wheel islands, found ' + wheels.length);
  // Hub caps: small islands whose centre is inside the wheel's box.
  const hubs = (w) =>
    islands.filter(
      (c) =>
        c !== w &&
        c.tris < 60 &&
        c.centre.every((v, a) => v >= w.min[a] - 0.02 && v <= w.max[a] + 0.02) &&
        !wheels.includes(c),
    );
  ['wheelL', 'wheelR'].forEach((name, i) => {
    const w = wheels[i];
    // Recompute: the previous extraction renumbered the triangles of the body.
    const current = components(result.parts[index]);
    const match = (c) =>
      c.tris === w.tris && c.centre.every((v, a) => Math.abs(v - w.centre[a]) < 1e-9);
    const wheel = current.find(match);
    const extra = hubs(w).flatMap((h) =>
      current.filter(
        (c) => c.tris === h.tris && c.centre.every((v, a) => Math.abs(v - h.centre[a]) < 1e-9),
      ),
    );
    const list = [wheel, ...extra].flatMap((c) => c.list);
    const [rest, piece] = extract(result.parts[index], list, w.centre, name);
    result.parts[index] = rest;
    result.parts.push(piece);
    result.rig.push({
      name,
      parent: 'body',
      pivot: piece.pivot,
      position: piece.pivot,
      quaternion: [0, 0, 0, 1],
    });
  });
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tris = (d) => d.parts.reduce((n, p) => n + decode(p.indices, Uint16Array).length / 3, 0);
  for (const [type, [file, name]] of Object.entries(MODELS)) {
    const path = 'src/' + file;
    const module = await import(pathToFileURL(path).href);
    const result = splitWheels(module[name]);
    if (!result) {
      console.log(type + ': already split');
      continue;
    }
    const source = readFileSync(path, 'utf8');
    const header = source
      .slice(0, source.indexOf('export const ' + name))
      .split('\n')
      .filter(
        (l) =>
          l.startsWith('//') &&
          !l.includes('prettier-ignore') &&
          !l.includes('rig-aircraft-wheels'),
      );
    const note =
      '// Main wheels split from the hull by scripts/rig-aircraft-wheels.mjs (no triangle, UV or texture change).';
    const text =
      [...header, note].join('\n') +
      '\n// prettier-ignore\nexport const ' +
      name +
      ' = ' +
      JSON.stringify(result) +
      ';\n';
    console.log(
      type + ': parts',
      module[name].parts.length,
      '→',
      result.parts.length,
      'triangles',
      tris(module[name]),
      '→',
      tris(result),
    );
    if (process.argv[2] !== '--dry-run') writeFileSync(path, text);
  }
}
