import { uiPreview } from './build-ui-preview.mjs';
import * as T from '../vendor/three.module.min.js';
import { createOffice } from '../src/office.js';
import { createGraphics } from '../src/graphics.js';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const collisionScene = new T.Scene();
const officeBounds = createOffice(T, collisionScene, {
  ...createGraphics(T, collisionScene),
  textLabel: () => new T.Group(),
}).colliders;
await writeFile(
  'src/route-obstacles.js',
  '// Generated from office colliders.\nexport const ROUTE_OBSTACLES=' +
    JSON.stringify(
      officeBounds.map((b) => ({
        min: { x: b.min.x, y: b.min.y, z: b.min.z },
        max: { x: b.max.x, y: b.max.y, z: b.max.z },
      })),
    ) +
    ';\n',
);
await writeFile('docs/ui-review.html', uiPreview(await readFile('src/index.html', 'utf8')));
// One asset manifest drives both browser module serving and Worker packaging.
const files = {
  '/': 'src/index.html',
  '/ui-review.html': 'docs/ui-review.html',
  '/client.js': 'src/client.js',
  '/three.js': 'vendor/three.module.min.js',
  ...Object.fromEntries(
    [
      'swept-geometry',
      'helicopter',
      'mobile-flak',
      'live-hud',
      'salvos',
      'player-livery',
      'purchase-ui',
      'vehicle-care',
      'tank-reticle',
      'flight',
      'aircraft-fire',
      'logistics',
      'malice',
      'vehicle-livery',
      'input',
      'interaction-timing',
      'insect-hits',
      'insect-status',
      'crash-effects',
      'control-focus',
      'network',
      'udp-client',
      'udp-protocol',
      'mouse-flight',
      'purgatory-physics',
      'audio',
      'base',
      'layout',
      'renderer',
      'graphics',
      'office',
      'sortie',
      'field-physics',
      'personal-aim',
      'scale',
      'fleet',
      'tank',
      'tank-view',
      'armament',
      'ordnance',
      'bank',
      'beds',
      'bed-ui',
      'bank-ui',
      'hud',
      'equipment-controls',
      'combat',
      'contracts',
      'vacant-flight',
      'rewards',
      'waves',
      'tracers',
      'ballistics',
      'equipment',
      'routes',
      'route-speed',
      'route-navigation',
      'route-obstacles',
    ].map((name) => ['/' + name + '.js', 'src/' + name + '.js']),
  ),
};
const assets = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([url, path]) => [url, await readFile(path, 'utf8')]),
  ),
);
// Content-address the complete module graph. Entry HTML is revalidated; these
// URLs can be cached immutably and never resolve to another build's bytes.
const version = createHash('sha256')
  .update(JSON.stringify(assets))
  .update(await readFile(new URL(import.meta.url), 'utf8'))
  .digest('hex')
  .slice(0, 12);
for (const url of Object.keys(assets)) {
  if (url.endsWith('.js'))
    assets[url] = assets[url].replace(
      /(\bfrom\s*['"]|\bimport\s*['"])(\.?\.?\/[^'"?]+\.js)(['"])/g,
      (_, prefix, path, quote) => {
        const target = new URL(path, 'https://assets.local' + url).pathname;
        if (!Object.hasOwn(assets, target)) throw Error('Unpackaged module: ' + target);
        return prefix + '/assets/' + version + target + quote;
      },
    );
}
assets['/'] = assets['/'].replace('src="/client.js"', 'src="/assets/' + version + '/client.js"');
const inline = (source) => source.replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const arena = inline(assets['/purgatory-physics.js']);
const base = inline(assets['/base.js']);
const layout = inline(assets['/layout.js']);
const routes = inline(assets['/routes.js']);
const waves = inline(assets['/waves.js']);
const scale = inline(assets['/scale.js']);
const fleet = inline(assets['/fleet.js']);
const ballistics = inline(assets['/ballistics.js']);
const equipment = inline(assets['/equipment.js']);
const sortie = inline(assets['/sortie.js']);
const server = await readFile('src/server.js', 'utf8');
await writeFile(
  'worker/assets.js',
  'export const BUILD_VERSION=' +
    JSON.stringify(version) +
    ';\n' +
    'export const ASSETS=' +
    JSON.stringify(assets) +
    ';\n' +
    'export const OFFICE_SOLIDS=' +
    JSON.stringify(
      officeBounds.map((b) => ({
        min: { x: b.min.x, y: b.min.y, z: b.min.z },
        max: { x: b.max.x, y: b.max.y, z: b.max.z },
      })),
    ) +
    ';\n',
);
await writeFile(
  'worker/index.js',
  [
    'const BUILD_VERSION=' + JSON.stringify(version) + ';',
    'const ASSETS=' + JSON.stringify(assets) + ';',
    scale,
    layout,
    inline(assets['/route-obstacles.js']),
    inline(assets['/route-navigation.js']),
    routes,
    inline(assets['/route-speed.js']),
    waves,
    fleet,
    ballistics,
    equipment,
    inline(assets['/armament.js']),
    inline(assets['/logistics.js']),
    inline(assets['/malice.js']),
    'const OFFICE_SOLIDS=' +
      JSON.stringify(
        officeBounds.map((b) => ({
          min: { x: b.min.x, y: b.min.y, z: b.min.z },
          max: { x: b.max.x, y: b.max.y, z: b.max.z },
        })),
      ) +
      ';',
    'const ARENA_ENGINE=(()=>{' +
      arena +
      ';return {createSoul,advanceArena,deskOccupant,relayBodyReport};})();',
    'const BASE_ENGINE=(()=>{const {createSoul,advanceArena}=ARENA_ENGINE;' +
      base +
      ';return {aircraftBay,baseWorld,baseBody,baseAccess,reconcileBase,advanceBase,aircraftPose};})();',
    'const SORTIE_ENGINE=(()=>{' + sortie + ';return {AA_STATIONS,stationAccess};})();',
    server,
  ].join('\n'),
);
