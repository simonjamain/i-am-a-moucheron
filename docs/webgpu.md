# Rendu WebGPU (Three.js r187)

Le jeu s'affiche avec `WebGPURenderer` de Three.js : **WebGPU** quand le navigateur
l'offre, sinon le **backend WebGL 2 du même renderer** (choisi automatiquement par
Three.js). Sans l'un ni l'autre, le rendu logiciel 2D de secours (`src/renderer.ts`)
reste. Il n'y a ni `WebGLRenderer` ni GLSL écrit à la main : tous les
effets sont des matériaux à nœuds (**TSL**, _Three Shading Language_), qui tournent sur
les deux backends.

## Ce qui est chargé

`vendor/` contient trois builds minifiés de Three.js, à côté de Rapier (voir
[vendor/README](../vendor/README.md)) : `three.webgpu.min.js` (servi sous `/three.js` par
`scripts/assemble.mjs`, avec le renderer, les matériaux à nœuds et `T.TSL`),
`three.core.min.js` et `three.tsl.min.js`. Les modules reçoivent toujours
l'espace de noms `T` ; `Three` (`src/types.ts`) est le type du build WebGPU. Les tests
Node importent le même fichier.

## Démarrage

`createRenderer` (`src/renderer.ts`) est asynchrone : `new WebGPURenderer({ canvas,
antialias, logarithmicDepthBuffer })` puis `await renderer.init()`. `client.js` l'attend
(module à `await` de tête) ; l'écran de chargement (`src/boot.ts`) crée son propre
renderer de la même façon. `isGpuRenderer` distingue le renderer GPU du rendu logiciel
(`renderer.isWebGPURenderer`).

## Ce qui change pour qui écrit un effet

- **Pas de `ShaderMaterial`, de `onBeforeCompile` ni de `ShaderChunk`** : un effet est un
  `NodeMaterial` (`fragmentNode`, `colorNode`, `positionNode`…) construit avec `T.TSL`
  (`tsl(T)` dans `src/gpu-passes.ts`). Les matériaux Three classiques (`MeshStandard`,
  `MeshBasic`, `Sprite`…) sont convertis automatiquement.
- **Les points n'ont pas de taille** : une fumée ou une étincelle de taille variable est
  un lot de quads face caméra (`SpriteNodeMaterial` instancié, `src/engine-smoke.ts`).
- **Un `InstancedBufferGeometry` fixe lui-même le nombre d'instances** (`instanceCount`) ;
  un `InstancedMesh` sur une `BufferGeometry` ordinaire suit `mesh.count`
  (`src/creature-batch.ts`).
- **`positionNode` remplace la position après l'instanciation** : une animation par
  texture de sommets lit donc elle-même la matrice de l'instance (attributs `vatM0-3`).
- **`toneMapped` n'existe plus par matériau** : le tone mapping est global au renderer.
- **Viewport et scissor comptent depuis le coin haut gauche** (`setViewport`,
  `setScissor`), l'origine des rectangles de `selectionRect` reste en bas à gauche.
- **Les lignes d'une cible de rendu vont de haut en bas** : `targetUv` (`gpu-passes.ts`)
  donne la coordonnée à utiliser pour lire une cible depuis un écran plein.
- **Un rendu vers le canvas passe par une cible intermédiaire** : le renderer y dessine
  en linéaire, puis applique le tone mapping et la conversion sRGB à chaque `render()`.
  Une passe dessinée **par-dessus** une image déjà tone-mappée (nuages du sol,
  tuile du sélecteur, compteur d'images, contour de sélection) s'enveloppe donc dans
  `withoutToneMapping` et applique elle-même `toneMapping` à ses propres couleurs
  quand elles sont en HDR.

## Où est quoi

| Sujet                                                                       | Fichier                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Couche de nuages du bureau (`scene.fogNode`)                                | `src/office-fog.ts`                                                 |
| Aides communes (passe plein écran, `targetUv`, tone mapping, ombres gelées) | `src/gpu-passes.ts`                                                 |
| Bruit, fBm, phase de Henyey-Greenstein                                      | `src/cloud-nodes.ts`                                                |
| Dôme du ciel, nuages du ciel                                                | `src/purgatory-clouds.ts` ([purgatoire](purgatory-scene.md))        |
| Contour de sélection d'un poste                                             | `src/post-highlight.ts`                                             |
| Lots de créatures animés par texture                                        | `src/creature-batch.ts`                                             |
| Rubans d'air, fumée des moteurs, zones de service                           | `src/air-ribbons.ts`, `src/engine-smoke.ts`, `src/service-zones.ts` |
| Sélecteur de personnage de l'accueil                                        | `src/appearance-picker.ts`                                          |
| Vignettes de la boutique                                                    | `src/shop-thumbs.js` (renderer à part)                              |
| Rapport « Rendu » du bouton Nouveautés                                      | `src/render-info.ts`                                                |

## Vérifier

- `npm test` : modèles d'éclairage enveloppés, graphes de nœuds construits, rapport de
  rendu, lots de créatures et fumée sans GPU.
- `npm run e2e` : scénarios Chromium (WebGL 2 de secours dans la CI, sans WebGPU).
- Chromium expose WebGPU, même sans carte graphique, avec ces options et une page servie
  depuis `localhost` (contexte sécurisé) :
  `--enable-unsafe-webgpu --enable-features=Vulkan --use-vulkan=swiftshader
--use-webgpu-adapter=swiftshader --use-angle=swiftshader --enable-unsafe-swiftshader`.

## Limites connues

- Performances non mesurées sur de vraies machines (les essais tournent sur SwiftShader,
  rendu logiciel).
- WebGPU compile les pipelines à la première utilisation : une saccade peut apparaître
  à la première apparition d'un effet.
- Le brouillard est mélangé en espace linéaire, dans un rendu direct sur le canvas.
- La tuile du sélecteur de personnage et le contour de sélection mélangent en linéaire
  et non en sRGB.
