// Re-rig the medium tank's main gun the way a real one is built: the elevation pivot (the
// trunnion) sits at the front of the turret, at the base of the barrel, and only the barrel tube
// slides back when it fires; the mantlet (the block around it) stays on the pivot.
//
//   node scripts/rig-tank-gun.mjs [--dry-run]
//
// Works on the generated `src/meshy-tank-data.js` (already split by split-vehicle-parts.mjs): no
// triangle, UV or texture changes, islands only change node and frame. Refuses a module that
// already has a `cannonBarrel`: restore it from git to redo.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { components, decode, encode, extract } from './split-vehicle-parts.mjs';

const GRID = 0.0005;
// Forward shift of the pivot along the gun's axis, from the old pivot at the turret centre
// (model units): to the front face of the turret, where the mantlet begins.
export const PIVOT_SHIFT = -0.9;

export function rigGun(data) {
  const result = structuredClone(data);
  if (result.rig.some((node) => node.name === 'cannonBarrel'))
    throw Error('cannonBarrel already exists: restore the module first');
  const gunIndex = result.parts.findIndex((p) => p.part === 'cannonGun');
  const gun = result.parts[gunIndex];
  // The tube is the longest island (a thin cylinder 1.4 long): everything else is mantlet and coax.
  const tube = components(gun).sort((a, b) => b.size[2] - a.size[2])[0];
  if (!(tube.size[2] > 1.3 && tube.size[0] < 0.2)) throw Error('barrel tube not found');
  const [rest, barrel] = extract(gun, tube.list, [0, 0, PIVOT_SHIFT], 'cannonBarrel');
  // The mantlet keeps its triangles, re-expressed relative to the new pivot.
  const positions = decode(rest.positions, Int16Array).slice();
  for (let i = 2; i < positions.length; i += 3) positions[i] -= Math.round(PIVOT_SHIFT / GRID);
  rest.positions = encode(positions);
  result.parts.splice(gunIndex, 1, rest, barrel);

  const node = result.rig.find((n) => n.name === 'cannonGun');
  const at = (v) => +(v + PIVOT_SHIFT).toFixed(4);
  node.pivot = [node.pivot[0], node.pivot[1], at(node.pivot[2])];
  node.position = [node.position[0], node.position[1], at(node.position[2])];
  result.rig.splice(result.rig.indexOf(node) + 1, 0, {
    name: 'cannonBarrel',
    parent: 'cannonGun',
    pivot: [...node.pivot],
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
  });
  for (const anchor of result.anchors) {
    if (anchor.name === 'muzzle') anchor.node = 'cannonBarrel';
    if (['muzzle', 'coax'].includes(anchor.name))
      anchor.at = [anchor.at[0], anchor.at[1], +(anchor.at[2] - PIVOT_SHIFT).toFixed(4)];
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = 'src/meshy-tank-data.js';
  const { MODEL_DATA } = await import(pathToFileURL(file).href.replace('file:///', 'file:///'));
  const result = rigGun(MODEL_DATA);
  const source = readFileSync(file, 'utf8').split('\n');
  const header = source.filter(
    (line) => line.startsWith('//') && !line.includes('prettier-ignore'),
  );
  const note =
    '// Main gun re-rigged by scripts/rig-tank-gun.mjs: pivot at the turret front, barrel tube on its own node.';
  const text =
    [...header, note].join('\n') +
    '\n// prettier-ignore\nexport const MODEL_DATA = ' +
    JSON.stringify(result) +
    ';\n';
  const gun = result.rig.find((n) => n.name === 'cannonGun');
  const muzzle = result.anchors.find((a) => a.name === 'muzzle');
  console.log(
    'cannonGun pivot',
    gun.pivot,
    'gunLength',
    -muzzle.at[2],
    '(update VEHICLE_ANCHORS.tank)',
  );
  if (process.argv[2] !== '--dry-run') writeFileSync(file, text);
}
