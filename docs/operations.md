# Exploitation et vérifications

Référence des contrôles à lancer avant une livraison et de ce qu'ils prouvent.
Parcours de PR et fusion : [CONTRIBUTING](../CONTRIBUTING.md). Image Docker :
[Docker](docker.md). Mesures de performance : [performances](performance.md).

## Déploiement

Chaque commit sur `main` déclenche [docker.yml](../.github/workflows/docker.yml),
qui publie `ghcr.io/simonjamain/i-am-a-moucheron:latest` (et `sha-<commit>`). Un
environnement extérieur au dépôt récupère périodiquement `latest` et la déploie sur
le VPS. Il n'y a pas d'autre cible de publication ni d'environnement temporaire par
PR ; les agents ne provisionnent pas de serveur et gardent secrets et administration
du VPS hors des contributions.

Le serveur garde toutes les salles en RAM : un redémarrage (donc chaque déploiement)
efface les parties. HTTP sert les assets, `/healthz`, `/stats` et la négociation
WebRTC ; le gameplay passe par UDP, avec secours TCP WebSocket ; les anciennes routes
HTTP (`/api/join`…) renvoient 410. Réseau, variables et pare-feu :
[serveur UDP](udp-server.md). Le serveur assemble ses assets au démarrage :
le redémarrer après modification et recharger les navigateurs.

## Contrôles locaux

On modifie `src/`, `server/`, `scripts/` et `docs/`. L'assembleur
(`scripts/assemble.mjs`, lancé par `start`, `dev`, `test`, `build`) génère
`server/assets.js` (versionné) et `/ui-review.html` ; `npm run build` produit `dist/`
(ignoré), un runtime autonome (`npm ci --omit=dev && npm start`).

```sh
npm run format:check   # seule commande de format (local et CI)
npm run typecheck
npm test               # suite complète, inclut tsc
npm run check:docs     # liens Markdown locaux
npm run check:version  # VERSION indexé > HEAD
npm run build && node scripts/validate-artifact.mjs
docker build -t i-am-a-moucheron:local .   # voir docker.md
```

- `npm test` (`scripts/run-tests.mjs`) assemble puis exécute la liste ordonnée de
  `scripts/suite.mjs`, un processus par script, et résume les échecs à la fin.
  `npm test -- <fragment>` cible des scripts, `--bail` s'arrête au premier échec,
  `--list` affiche la liste. `test-suite-wiring.mjs` échoue si un `scripts/test-*.mjs`
  manque à la suite (seul `test-udp-capacity-50.mjs`, lourd, a sa commande
  `test:capacity`). `test-registries.mjs` contrôle les tables par espèce et véhicule.
- `check:version` compare `VERSION` indexé à `HEAD` : indexer l'augmentation
  (`npm run version:next`) avant. Le hook `.githooks/pre-commit` (activé par
  `npm run prepare:version`) ne lance que ce contrôle. En CI,
  `check:version --base origin/<cible>` exige un numéro supérieur à la branche cible.
- `validate-artifact.mjs` vérifie la syntaxe ESM du serveur de `dist/`, ses imports
  locaux et les assets UDP ; pas l'installation des dépendances natives.
- Données générées (`src/*-data.js` importées, `docs/ui-review.html`) : exclues par
  `.prettierignore`.
- `test-wave-preparation.mjs` utilise des graines fixes (`WAVE_SEEDS=2000` pour élargir).

## Contrôles GitHub Actions

| Workflow / job                                                          | Contenu                                                                                                                                              |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Docker build validation` / **Docker build**                            | construit l'image, la démarre, vérifie `/healthz` (`ok`, `storage=ram`, `transport=webrtc-udp`) et le 410 de `/api/join`                             |
| … / **Full game regression and formatting**                             | `check:version --base`, `npm test`, `format:check`, `check:docs`, build + `validate-artifact.mjs`                                                    |
| … / **Real Chromium over WebRTC UDP/TCP**                               | `npm run e2e` (Playwright installé à la volée)                                                                                                       |
| … / 50-player snapshot comparison, 50 native UDP peers, Physics contact | `benchmark-snapshot-50`, `benchmark-motion-sync-50`, `test-udp-capacity-50` (avec et sans `UDP_MUX_PORT`), `test-swept-broadphase`, `bench:swarm-50` |
| `Docs site` (`docs-site.yml`)                                           | construit le [site](site.md) en mode strict ; publie sur GitHub Pages depuis `main`                                                                  |
| `assets-check.yml` / `assets-publish.yml`                               | outil GLB du [pipeline d'assets](asset-pipeline.md)                                                                                                  |

Le job **Docker build** prouve que l'image démarre, pas les pairs UDP dans le
conteneur, WebGL ni le WAN.

## Scénarios navigateur réel

`npm run e2e` (Chromium, WebRTC UDP puis repli TCP : reprise de pilote, mouvements
partagés entre deux pages, chute vue par un second client, finitions ; ~3 min) ;
pendant l'itération, `e2e:resume`, `e2e:motion`, `e2e:tcp`. Ils sont hors `npm test`
car ils exigent Chromium. Les pages font 320×240 : en WebGL logiciel, deux pages
1280×720 se privaient de CPU sur deux cœurs jusqu'à la coupure d'un pilote muet
depuis 15 s. Les attentes tolèrent un runner lent (reprise jusqu'à 45 s, mouvement
distant sondé 30 s, nouvelles tentatives UDP comptées par `RTCPeerConnection`).

Restent manuels : `e2e:loading` (intermittent en CI : `canvas` absent en
`#loading.departing` au rechargement à chaud, course non tranchée) et `e2e:layouts`
(~135 s en local, dépasse l'attente de 90 s du runner).

## Ce que les contrôles ne prouvent pas

Le navigateur de contrôle des agents ne crée pas de contexte WebGL et ne confirme
pas une partie UDP sur son réseau. Le chargement du client, les panneaux et la
géométrie Three.js sans GPU sont testables ; les images comparatives de modèles sont
des projections CPU des triangles. Pointer Lock, confort du pilotage, tactile,
écoute, charge maximale et WAN restent à vérifier en jeu sur le VPS.

Selon le changement, essai manuel : entrer et signer chaque poste, deux joueurs sur
des sièges différents, achats, tirs, sortie, chute, purgatoires, lit personnel.
`/ui-review.html` montre les vrais composants HUD, banque et lit sur des données
jetables ; ce n'est pas une partie multijoueur.

Les scénarios de 50 joueurs (`test-ram-game.mjs`, `test-motion-capacity.mjs`,
`test:capacity` sur `127.0.0.1` avec pairs `node-datachannel`) mesurent le serveur,
pas des FPS WebGL ni le WAN. La limite configurée (128 connexions,
`maxConnections` dans `server/index.js`) n'est pas une capacité prouvée ; la cible
de jeu reste 5 à 10 joueurs.
