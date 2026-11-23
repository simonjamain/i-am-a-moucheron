# WebGPU — migration vers le renderer WebGPU de Three.js

- Tâche / PR : note de préparation (aucun code de rendu modifié).
- Branche : `claude/webgpu-preparation`.
- Résultat attendu : le jeu s'affiche avec `WebGPURenderer` quand le navigateur l'offre,
  retombe sur le backend WebGL 2 du même renderer sinon, avec le même rendu « toon »
  (paliers de lumière, contours de 1,5 px), sans régression de performance mesurée.
- État réel : inventaire et plan ci-dessous ; rien n'est migré.
- Prochaine action : lancer l'étape 0 (montée de version de Three.js, voir plus bas).

## Pourquoi c'est un gros chantier

Le jeu est écrit contre `WebGLRenderer` et **le GLSL brut**, pas contre l'API
agnostique de Three.js. `WebGPURenderer` n'exécute ni `ShaderMaterial` ni
`onBeforeCompile` ni les chunks `ShaderChunk` : il faut réécrire en **nœuds TSL**
(Three Shading Language, `NodeMaterial`). C'est la partie coûteuse ; le reste
(`Mesh`, `InstancedMesh`, `SkinnedMesh`, lumières, textures GLB) se porte presque tel quel.

## Contraintes propres au dépôt

- **Pas de bundler** : le navigateur charge `vendor/three.module.min.js` (r170) sous
  `/three.js` (`scripts/assemble.mjs`). Le renderer WebGPU vit dans un build distinct
  (`three.webgpu` + `three.tsl`) qui réexporte aussi le cœur : charger les deux builds
  dupliquerait les classes. Il faut que `/three.js` pointe vers **un seul** build
  (le build WebGPU, qui contient tout) et mettre à jour `vendor/README.md`
  (version, empreinte SHA-256).
- **r170 est trop ancien** pour viser WebGPU sereinement (TSL et `WebGPURenderer`
  bougent à chaque révision ; la dernière est r187). Monter la version est un préalable,
  séparé, avec `@types/three` aligné (`docs/typescript.md`).
- **Pas de WebGPU dans le Chromium de la CI ni de cette session** (`navigator.gpu`
  absent en headless/SwiftShader). Ce que la CI peut tester : le backend WebGL 2 de
  `WebGPURenderer` (`forceWebGL`). Le chemin WebGPU natif ne se valide qu'à la main,
  sur une vraie machine (essai humain à consigner dans la PR).
- Le rendu logiciel de secours (`src/renderer.ts`, canvas 2D) reste tel quel.
- Rapier, réseau et serveur ne sont pas concernés.

## Inventaire du code à porter

| Sujet                                                                                       | Où                                                                                                         | Difficulté                                                                                  |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Éclairage par paliers : patch des `ShaderChunk` (`installToonLighting`)                     | `src/toon.ts`                                                                                              | Élevée : à refaire en nœud de lumière / `lightingModel` TSL                                 |
| Contours : passe plein écran GLSL sur profondeur logarithmique, brouillard intégré          | `src/toon.ts` (`OutlinePass`)                                                                              | Élevée : à refaire en `PostProcessing` + nœud `fn`; décoder la profondeur du nouveau tampon |
| `logarithmicDepthBuffer`                                                                    | `src/renderer.ts`                                                                                          | Moyenne : supporté, mais le décodage dans les contours en dépend                            |
| `ShaderMaterial` : rubans, fumée, nuages, sol du purgatoire, zones, sélecteur de personnage | `air-ribbons`, `engine-smoke`, `purgatory-clouds`, `purgatory-floor`, `service-zones`, `appearance-picker` | Moyenne chacun : un `NodeMaterial` par effet                                                |
| Contour de sélection (masque `SkinnedMesh` + passe)                                         | `src/post-highlight.ts`                                                                                    | Élevée : masque, scissor, squelette                                                         |
| `onBeforeCompile` : lots de créatures (instances, ombre)                                    | `src/creature-batch.ts`                                                                                    | Moyenne à élevée                                                                            |
| `WebGLRenderTarget`                                                                         | `office-lights`, `post-highlight`, `purgatory-clouds`, `purgatory-floor`, `toon`                           | Moyenne : `RenderTarget` agnostique, lecture asynchrone                                     |
| Ombres cuites des lampes                                                                    | `src/office-lights.ts`, `shadow-settings.ts`                                                               | Moyenne : les réglages d'ombre diffèrent                                                    |
| Dessin par-dessus la frame (viewport + scissor + `autoClear`)                               | `appearance-picker`, `fps-counter`, `post-highlight`                                                       | Moyenne : l'ordre de rendu et `autoClear` se comportent autrement                           |
| Diagnostic WebGL (`getContext`, `WEBGL_debug_renderer_info`)                                | `src/render-info.ts`                                                                                       | Faible : à remplacer par `GPUAdapterInfo`                                                   |
| `Points`, `Sprite`, `LineSegments`                                                          | `engine-smoke`, `missile-exhaust`, `debug-tools`, `physics-debug`                                          | Faible à moyenne                                                                            |
| Aperçus boutique (`preserveDrawingBuffer`)                                                  | `src/shop-thumbs.js`                                                                                       | Faible : capture asynchrone                                                                 |
| `InstancedMesh` (14 modules), `SkinnedMesh` (4)                                             | partout                                                                                                    | Faible : portage direct, à vérifier                                                         |
| Tests qui construisent des `WebGLRenderer` ou lisent des shaders                            | `test-toon`, `test-render-info`, `e2e-*`                                                                   | Moyenne                                                                                     |

Le rendu étant **asynchrone** (`await renderer.init()`, lectures de pixels asynchrones),
le démarrage (`src/boot.ts`, écran de chargement) et chaque lecture synchrone devront
attendre l'initialisation.

## Plan par étapes (une PR chacune, le jeu reste jouable à chaque fusion)

0. **Montée de version de Three.js** (r170 vers la dernière) avec le renderer WebGL
   actuel : corriger les ruptures, `@types/three`, `vendor/README.md`, rendu inchangé.
   Mesures de référence (voir « Mesures »).
1. **Banc d'essai de rendu** : scénarios Chromium qui capturent des images de référence
   (bureau, purgatoire, personnage, contours, brouillard) pour comparer les moteurs.
2. **Couche d'abstraction minimale** : un point unique de création du renderer
   (`createRenderer`), un drapeau `?renderer=webgl|webgpu` (et préférence mémorisée),
   `await init()` au démarrage. Aucun changement visuel : WebGL reste le défaut.
3. **Matériaux simples d'abord** : porter les `ShaderMaterial` isolés un par un
   (fumée, rubans, nuages, sol, zones) vers des `NodeMaterial`, en gardant le chemin WebGL
   tant que les deux moteurs coexistent (ou en basculant tout d'un coup, voir décision 2).
4. **Éclairage par paliers** en TSL, comparé aux images de référence.
5. **Contours et brouillard** en post-traitement TSL (la pièce la plus risquée).
6. **Contour de sélection**, lots de créatures, ombres des lampes, aperçus.
7. **Bascule par défaut** vers WebGPU avec repli WebGL 2 automatique, suppression du
   code GLSL mort et mise à jour de `docs/toon-rendering.md`, `docs/performance.md`,
   `docs/code-structure.md`, `docs/typescript.md`.

## Mesures (à produire avant et après, mêmes scénarios)

Temps de frame et nombre d'appels de dessin dans le bureau chargé (nombreux insectes,
combat), au purgatoire, et au démarrage (compilation des pipelines : WebGPU compile à la
première utilisation, d'où un risque de saccade à l'apparition d'un effet). Protocole dans
`docs/performance.md` ; machine et navigateur consignés.

## Décisions à prendre avec le propriétaire

1. **Version cible de Three.js** : dernière version stable (r187 au moment d'écrire) ou
   une révision figée plus ancienne ?
2. **Cohabitation** : conserver deux chemins de rendu le temps de la migration
   (double écriture des matériaux, plus sûr mais plus long) ou basculer d'un bloc
   (plus court, sans filet) ?
3. **Repli** : WebGPU natif puis WebGL 2 par le même renderer, puis rendu logiciel ?
   Ou abandonner le chemin WebGL 2 une fois la migration terminée ?
4. **Apparence** : tolérance sur les écarts visuels (contours, paliers) par rapport au
   rendu actuel, validé en partie.

## Risques

- Le build WebGPU de Three.js est plus gros : poids de `/three.js` à mesurer
  (`docs/performance.md`) et effet sur le chargement initial.
- Navigateurs sans WebGPU (Firefox stable selon plateforme, Safari ancien) : le repli
  WebGL 2 doit rester testé tant qu'il existe.
- Les contours dépendent de la profondeur logarithmique : sa disponibilité et son
  encodage en WebGPU sont à confirmer par un prototype avant l'étape 5.
- Aucune validation WebGPU native possible en CI : essais humains obligatoires.

## Blocages / hypothèses

- Fait : le Chromium de cette session n'expose pas `navigator.gpu` ; le chemin WebGPU
  natif n'a donc pas été essayé ici.
- Hypothèse : `WebGPURenderer` sait imposer le backend WebGL 2 (`forceWebGL`) et
  `logarithmicDepthBuffer` ; à vérifier dans la version cible avant l'étape 2.
