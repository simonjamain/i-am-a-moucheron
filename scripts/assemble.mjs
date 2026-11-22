import { uiPreview } from './build-ui-preview.mjs';
import { writeBuildInfo } from './build-info.ts';
import { layoutSolids, LAYOUTS } from '../src/layouts.ts';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// VERSION et nouveautés récentes viennent de l'historique Git (docs/changelog.md).
const { version: gameVersion } = writeBuildInfo();

// Browser URLs stay `/<name>.js`; the source is `src/<name>.ts` when migrated
// (types erased in place, see docs/typescript.md) or `src/<name>.js` otherwise.
const moduleSource = (name) =>
  existsSync('src/' + name + '.ts') ? 'src/' + name + '.ts' : 'src/' + name + '.js';
const readAsset = async (file) => {
  const text = await readFile(file, 'utf8');
  return file.endsWith('.ts') ? stripTypeScriptTypes(text, { mode: 'strip' }) : text;
};

// Colliders of the default layout, kept as a fixture for tests. The Node server and
// the browser derive each room's colliders from the active layout.
const officeBounds = layoutSolids(LAYOUTS[0]);
await writeFile('docs/ui-review.html', uiPreview(await readFile('src/index.html', 'utf8')));
// One asset manifest drives the browser module serving of the Node server.
const files = {
  '/': 'src/index.html',
  '/ui-review.html': 'docs/ui-review.html',
  '/client.js': moduleSource('client'),
  '/boot.js': moduleSource('boot'),
  '/three.js': 'vendor/three.module.min.js',
  // Physics engine, loaded on demand (see docs/physics-engine.md).
  '/rapier.js': 'vendor/rapier.compat.mjs',
  ...Object.fromEntries(
    [
      'balance',
      'lab-ui',
      'debug-enemies',
      'debug-tools',
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
      'meshy-m1-data',
      'meshy-b3-data',
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
      'meshy-flying-castor-data',
      'flying-castor-model',
      'airdrop',
      'meshy-stuka-data',
      'meshy-spitfire-data',
      'meshy-tank-data',
      'meshy-flaktruck-data',
      'biplane-model',
      'm1-model',
      'b3-model',
      'meshy-h2-data',
      'h2-model',
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
      'meshy-gatling-data',
      'gatling-model',
      'ground-fortifications',
      'ground-model',
      'fortification-model',
      'howitzer-model',
      'howitzer-geometry',
      'howitzer-data',
      'model-preview',
      'ground-defense',
      'layouts',
      'office-props',
      'office-pack-catalog',
      'office-pack',
      'office-pack-data',
      'office-lights',
      'office-collision',
      'changelog',
      'changelog-history',
      'changelog-recent',
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
      'seat-posts',
      'post-highlight',
      'render-info',
      'service-zones',
      'station-model',
      'bed-model',
      'meshy-bed-data',
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
      'hull-gun',
      'purchase-ui',
      'vip-pass-ui',
      'upgrade-ui',
      'paper-form',
      'vehicle-care',
      'tank-reticle',
      'flight',
      'aircraft-fire',
      'logistics',
      'ground-ammo',
      'fixed-dca',
      'fixed-dca-model',
      'fixed-dca-dca-data',
      'fixed-dca-dcaRapid-data',
      'fixed-dca-dcaHeavy-data',
      'vehicle-livery',
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
      'roach-model',
      'roach-data',
      'rat-model',
      'rat-data',
      'flyer-batch',
      'beetle-model',
      'beetle-data',
      'bee-model',
      'bee-data',
      'mosquito-model',
      'mosquito-data',
      'spiderling-model',
      'spiderling-data',
      'insect-status',
      'blood-effects',
      'crash-effects',
      'missile-exhaust',
      'control-focus',
      'network',
      'udp-client',
      'ws-client',
      'udp-protocol',
      'snapshot-wire',
      'motion-wire',
      'server-clock',
      'heavy-sim',
      'swept-broadphase',
      'mouse-flight',
      'walk-arena',
      'purgatory-queue',
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
      'enemy-power',
      'fleet',
      'physics-world',
      'castor-physics',
      'tank-physics',
      'aircraft-geometry',
      'aircraft-wheels',
      'physics-debug',
      'plane-physics',
      'heli-physics',
      'render-interpolation',
      'pose-smoother',
      'tank-recoil',
      'camera-follow',
      'camera-clearance',
      'tank-gear',
      'tessellate',
      'track-suspension',
      'truck-physics',
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
      'rewards',
      'waves',
      'tracers',
      'ballistics',
      'equipment',
      'routes',
      'route-speed',
      'route-navigation',
      'layouts',
      // Folder modules (the audio library and its game adapter) keep their path.
      ...['audio', 'game-audio'].flatMap((dir) =>
        readdirSync('src/' + dir)
          .filter((file) => file.endsWith('.ts'))
          .map((file) => dir + '/' + file.slice(0, -3)),
      ),
    ].map((name) => ['/' + name + '.js', moduleSource(name)]),
  ),
};
const assets = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([url, path]) => [url, await readAsset(path)])),
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
      /(\bfrom\s*['"]|\bimport\s*\(?\s*['"])(\.?\.?\/[^'"?]+\.[jt]s)(['"])/g,
      (_, prefix, path, quote) => {
        const target = new URL(path, 'https://assets.local' + url).pathname.replace(/\.ts$/, '.js');
        if (!Object.hasOwn(assets, target)) throw Error('Unpackaged module: ' + target);
        return prefix + '/assets/' + version + target + quote;
      },
    );
}
assets['/'] = assets['/'].replaceAll('__GAME_VERSION__', String(gameVersion));
assets['/'] = assets['/'].replace('src="/boot.js"', 'src="/assets/' + version + '/boot.js"');
await writeFile(
  'server/assets.js',
  'export const BUILD_VERSION=' +
    JSON.stringify(version) +
    ';\n' +
    'export const GAME_VERSION=' +
    gameVersion +
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
