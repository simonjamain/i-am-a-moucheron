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
  '/boot.js': 'src/boot.js',
  '/three.js': 'vendor/three.module.min.js',
  ...Object.fromEntries(
    [
      'balance',
      'lab-ui',
      'ground-defense-ui',
      'ground-motion',
      'ground-placement',
      'placement-aim',
      'brick-wall',
      'brick-rules',
      'meshy-brick-data',
      'meshy-texture',
      'meshy-biplane-data',
      'meshy-biplane-bomber-data',
      'meshy-rig',
      'vehicle-anchors',
      'castor-model',
      'character-model',
      'character-appearances',
      'appearance-picker',
      'character-data',
      'character-frontier-data',
      'character-sky-pilot-data',
      'character-toby-data',
      'character-sunny-data',
      'character-aviator-data',
      'character-signaler-data',
      'character-operator-data',
      'meshy-castor-data',
      'meshy-stuka-data',
      'meshy-spitfire-data',
      'meshy-tank-data',
      'meshy-flaktruck-data',
      'biplane-model',
      'meshy-h2-data',
      'h2-model',
      'air-current',
      'air-trails',
      'wave-council-ui',
      'wave-forecast-scene',
      'wave-ground-paths',
      'wave-ground-worker',
      'ground-defense-state',
      'ground-sentry',
      'sentry-model',
      'meshy-t01-socle-data',
      'meshy-t01-tete-data',
      'meshy-t01-canon-data',
      'meshy-t01-capteur-data',
      'ground-fortifications',
      'ground-model',
      'fortification-model',
      'howitzer-model',
      'howitzer-geometry',
      'howitzer-data',
      'model-preview',
      'ground-defense',
      'route-obstacles',
      'changelog',
      'flight-tuning',
      'flight-tuning-ui',
      'swept-geometry',
      'helicopter',
      'mobile-flak',
      'live-hud',
      'pheromone-trail',
      'units',
      'castor-wheels',
      'castor-top-view',
      'service-zones',
      'station-model',
      'oriented-collider',
      'meshy-refuel-data',
      'meshy-radar-data',
      'reload-hud',
      'office-fog',
      'engine-smoke',
      'toon',
      'shop-catalog',
      'shop-thumbs',
      'reserve-feedback',
      'delivery',
      'salvos',
      'muzzle',
      'purchase-ui',
      'vehicle-care',
      'tank-reticle',
      'flight',
      'aircraft-fire',
      'logistics',
      'ground-ammo',
      'vehicle-livery',
      'seat-icons',
      'input',
      'interaction-timing',
      'insect-hits',
      'midge-batch',
      'midge-model',
      'midge-data',
      'rigged-creature',
      'creature-batch',
      'walker-gait',
      'walker-batch',
      'ant-model',
      'ant-data',
      'spider-model',
      'spider-data',
      'spiderling-batch',
      'insect-status',
      'blood-effects',
      'crash-effects',
      'missile-exhaust',
      'control-focus',
      'network',
      'udp-client',
      'udp-protocol',
      'snapshot-wire',
      'motion-wire',
      'server-clock',
      'heavy-sim',
      'swept-broadphase',
      'mouse-flight',
      'purgatory-physics',
      'audio',
      'base',
      'layout',
      'renderer',
      'shadow-settings',
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
      /(\bfrom\s*['"]|\bimport\s*\(?\s*['"])(\.?\.?\/[^'"?]+\.js)(['"])/g,
      (_, prefix, path, quote) => {
        const target = new URL(path, 'https://assets.local' + url).pathname;
        if (!Object.hasOwn(assets, target)) throw Error('Unpackaged module: ' + target);
        return prefix + '/assets/' + version + target + quote;
      },
    );
}
assets['/'] = assets['/'].replaceAll(
  '__GAME_VERSION__',
  (await readFile('VERSION', 'utf8')).trim(),
);
assets['/'] = assets['/'].replace('src="/boot.js"', 'src="/assets/' + version + '/boot.js"');
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
const sortie = inline(assets['/ground-fortifications.js']) + '\n' + inline(assets['/sortie.js']);
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
    inline(assets['/brick-rules.js']),
    inline(assets['/ground-defense.js']),
    routes,
    inline(assets['/air-current.js']),
    inline(assets['/route-speed.js']),
    waves,
    fleet,
    ballistics,
    inline(assets['/oriented-collider.js']),
    equipment,
    inline(assets['/armament.js']),
    inline(assets['/logistics.js']),
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
