# Exploitation et vérifications

## Déploiement

Chaque commit sur `main` déclenche [docker.yml](../.github/workflows/docker.yml), qui
publie `ghcr.io/simonjamain/i-am-a-moucheron:latest` (et un tag `sha-<commit>`). Un
environnement extérieur au dépôt récupère périodiquement `latest` et la déploie sur le
VPS. Il n'y a pas d'autre cible de publication ; les agents ne provisionnent pas de
serveur et ne revendiquent pas une installation sur le VPS sans accès ni résultat vérifié.

Le serveur garde toutes les salles en RAM : un redémarrage, donc chaque déploiement,
efface les parties. Il conserve les assets assemblés à son démarrage : le redémarrer
après modification et recharger les navigateurs. HTTP sert les assets, `/healthz` et
la négociation WebRTC ; le gameplay passe par UDP, avec repli TCP WebSocket ; les
anciennes routes HTTP de jeu renvoient 410. Réseau, variables et pare-feu :
[serveur UDP](udp-server.md). Image locale : [Docker](docker.md).

## Contrôles locaux

```sh
npm run format:check   # seule commande de format, identique en CI
npm run typecheck
npm test
npm run check:docs
npm run build && node scripts/validate-artifact.mjs
docker build …         # voir docker.md, avant toute livraison
```

`npm test` (`scripts/run-tests.mjs`) assemble, puis exécute chaque script de
`scripts/suite.mjs` dans son propre processus, en parallèle (un par CPU), et résume les
échecs et les cinq scripts les plus lents. Options : `npm test -- <fragment>` (scripts
dont le nom contient le fragment), `--bail`, `--list`, `--jobs=1` (séquentiel). La
suite entière dure environ 40 s sur 4 CPU ; elle inclut `tsc` (`test-typescript.mjs`)
et la cohérence des tables par espèce et véhicule (`test-registries.mjs`).
`npm run test:udp` filtre la suite sur le protocole (domaine RAM, pairs UDP natifs,
port partagé, repli TCP).

Invariants de la suite :

- `test-suite-wiring.mjs` échoue si un `scripts/test-*.mjs` manque à `suite.mjs`
  (seule exception : `test-udp-capacity-50.mjs`, lancé par `npm run test:capacity`).
- Les scripts sont indépendants : serveurs sur le port 0 ou sur des plages UDP fixes
  distinctes (un nouveau test choisit une plage libre), fichiers temporaires en `mkdtemp`.
- Pas de test aléatoire : les tirages utilisent des graines fixes
  (`WAVE_SEEDS=2000 node scripts/test-wave-preparation.mjs` pour élargir).
- `test-run-tests.mjs` vérifie que le lanceur reste rouge sur une assertion, une
  promesse rejetée ou un processus tué.

Le build produit `dist/` (serveur, modules partagés, assets, manifestes npm ; y lancer
`npm ci --omit=dev && npm start`). Le validateur vérifie la syntaxe ESM du serveur, les
imports locaux et les assets ; il ne prouve ni les dépendances natives ni un
déploiement WAN.

## Navigateur réel

`npm run e2e` (Chromium Playwright, environ 3 min) : reprise de pilote, mouvements
partagés entre deux pages, chute vue par un second client, en WebRTC UDP puis en repli
TCP. Pendant l'itération, lancer le script ciblé (`e2e:resume`, `e2e:motion`, `e2e:tcp`).
Playwright n'est pas une dépendance du projet : la CI l'installe à la volée.

- Pages de 320×240 : le WebGL logiciel dessine sur le CPU, et deux pages 1280×720 sur
  deux cœurs s'affamaient (le serveur coupe un pilote muet depuis 15 s).
- Attentes tolérantes à un runner lent : reprise jusqu'à 45 s, mouvement distant attendu
  par sondage (30 s), absence de nouvelle tentative UDP vérifiée en comptant les
  `RTCPeerConnection`, non au chronomètre.
- Restent manuels : `npm run e2e:loading` (intermittent sur le runner : `canvas` absent
  en `#loading.departing` au rechargement à chaud) et `npm run e2e:layouts` (135 s en
  local, dépasse l'attente de 90 s du runner).

## CI GitHub

| Workflow (fichier)                                  | Jobs                                                                                                                                                     | Déclencheur     |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Docker build validation (`docker-build.yml`)        | `Docker build`, `Full game regression and formatting`, `Real Chromium over WebRTC UDP/TCP`, benchmarks et capacité (voir [performances](performance.md)) | PR, merge group |
| Docs site (`docs-site.yml`)                         | `Docs site` : site strict, publié sur Pages depuis `main` ([site](site.md))                                                                              | PR, `main`      |
| Meshy asset tooling validation (`assets-check.yml`) | outil d'optimisation GLB ([pipeline](asset-pipeline.md))                                                                                                 | PR, merge group |
| Build and publish Docker image (`docker.yml`)       | image `latest` sur GHCR                                                                                                                                  | `main`          |
| Publish Meshy asset tools (`assets-publish.yml`)    | image de l'outil d'assets                                                                                                                                | `main`, manuel  |
| Conflict alert (`conflict-alert.yml`)               | label `conflit` et commentaire sur les PR devenues conflictuelles                                                                                        | `main`          |

`Full game regression and formatting` lance `npm test`, `format:check`, `check:docs`, le
build et le validateur. `Docker build` construit l'image, la démarre et vérifie `/healthz`
(`ok`, `storage=ram`, `transport=webrtc-udp`) et le 410 de `/api/join`.

## Ce que prouve chaque niveau

| Niveau       | Prouve                                                           | Ne prouve pas           |
| ------------ | ---------------------------------------------------------------- | ----------------------- |
| Itération    | règles, physique, protocole du système touché                    | le reste de la suite    |
| Avant PR     | domaine Node, deux pairs UDP natifs en loopback, types, artefact | WebGL, navigateur, WAN  |
| CI de PR     | idem, plus image qui démarre, Chromium réel en loopback, site    | rendu GPU, confort, WAN |
| Après fusion | essai humain sur le VPS : partie réelle                          | —                       |

Le navigateur de contrôle d'un agent ne crée pas de contexte WebGL et ne joue pas en
UDP sur son réseau : chargement du client, panneaux et géométrie Three.js sans GPU
sont testables ; les images comparatives des modèles sont des projections CPU des
triangles. Pointer Lock, confort de pilotage, tactile, son, charge réelle et WAN se
vérifient sur le VPS. Selon le changement : entrer et signer chaque poste, deux joueurs
sur des sièges différents, achats, tirs, sortie, chute, purgatoires, lit personnel.

L'aperçu `/ui-review.html` (vrais composants HUD, banque et lit sur données jetables ;
publié sur le site comme [écrans intégrés](https://simonjamain.github.io/i-am-a-moucheron/ecrans/))
est généré par l'assembleur ; ce n'est pas une partie multijoueur.

La capacité configurée (128 connexions, `maxConnections` de `server/index.js`) ne
prouve pas les performances à cette charge ; la cible de jeu reste 5–10 joueurs.
Mesures de charge et benchmarks : [performances](performance.md).
