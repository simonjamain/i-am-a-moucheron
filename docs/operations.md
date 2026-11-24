# Exploitation et vérifications

## Déploiement

Chaque commit sur `main` déclenche [docker.yml](../.github/workflows/docker.yml), qui publie
`ghcr.io/simonjamain/i-am-a-moucheron:latest` et un tag `sha-<commit>`. Un environnement
extérieur au dépôt récupère périodiquement `latest` et la déploie sur le VPS. Il n'y a pas
d'autre cible de publication ; les contributions ne provisionnent pas de serveur et
n'affirment pas une installation sur le VPS sans accès et résultat vérifiés.

Le serveur Node garde les salles en RAM : un redémarrage, donc chaque déploiement, efface
les parties. HTTP sert les assets, `/healthz` et la négociation WebRTC ; le gameplay passe
en UDP, avec un secours TCP WebSocket ; les anciennes routes HTTP (`/api/join`…) renvoient 410. HTTPS, IP annoncée, pare-feu et plage UDP : [serveur UDP](udp-server.md). Image
locale : [Docker](docker.md).

## Lancer en local

```sh
npm ci
npm start           # assemble puis lance le serveur (http://localhost:3000)
```

Node 22.18+. L'assembleur (`scripts/assemble.mjs`) produit `server/assets.js` (assets
servis, URL fondées sur le contenu), `VERSION`, `src/changelog-recent.ts` et l'aperçu
`/ui-review.html` des vrais composants HUD, banque et lit sur données de démonstration.
Le serveur garde ses assets assemblés : le redémarrer après modification, puis recharger
les navigateurs.

## Suite de tests

`npm test` lance `scripts/run-tests.mjs` : il assemble, puis exécute chaque script de la
liste `SUITE` de `scripts/suite.mjs` dans son propre processus, en parallèle (un par CPU),
et résume les échecs et les cinq scripts les plus lents.

| Option                   | Effet                                                  |
| ------------------------ | ------------------------------------------------------ |
| `npm test -- <fragment>` | seulement les scripts dont le nom contient le fragment |
| `--bail`                 | ne démarre plus de script après le premier échec       |
| `--list`                 | affiche la liste                                       |
| `--jobs=1`               | exécution séquentielle                                 |
| `npm run test:udp`       | raccourci filtré sur le protocole (RAM, UDP, mux, TCP) |

La suite inclut `tsc` (`test-typescript.mjs`), la cohérence des tables par espèce et par
véhicule (`test-registries.mjs`), la mise en forme (`test-format.mjs`, soit
`npm run format:check`) et les liens Markdown locaux (`test-docs-links.mjs`, soit
`npm run check:docs`). Les scripts sont indépendants : serveur sur le port 0 ou plage UDP
fixe propre à chacun, fichiers temporaires en `mkdtemp` ; un nouveau test qui ouvre un
port fixe en choisit un libre. `test-suite-wiring.mjs` échoue si un `scripts/test-*.mjs`
manque à la suite (seul `test-udp-capacity-50.mjs`, lourd, a sa commande
`npm run test:capacity`) ou si un `scripts/e2e-*.mjs` n'est ni dans `E2E` ni dans
`E2E_MANUAL`. Les tests aléatoires utilisent des graines fixes
(`WAVE_SEEDS=2000 npm test -- wave-preparation` pour élargir).

Données générées exclues de Prettier : voir `.prettierignore`.

## Scénarios navigateur

`npm run e2e` (`run-tests.mjs --e2e`) exécute un à un les scénarios Chromium de la liste
`E2E` de `scripts/suite.mjs` (reprise de pilote, mouvements partagés, repli TCP, chute vue
par un second client, écran de chargement, nuages WebGL, marche au purgatoire, contraste
HUD/lit/traçantes) ; `npm run e2e -- <fragment>` filtre. Ils exigent Playwright et Chromium,
installés à la volée par la CI, pas par le projet. `e2e-layouts` (`npm run e2e:layouts`,
plus de deux minutes) reste manuel : il expire sur le runner CI.

Ils ouvrent des pages de 320×240 et attendent par sondage plutôt qu'au chronomètre : le
WebGL logiciel dessine sur le CPU et deux grandes pages se privaient mutuellement au point
de dépasser les 15 s après lesquelles le serveur coupe un pilote muet. Garder ces deux
règles pour un nouveau scénario. Ils prouvent la poignée de main WebRTC et les flux en
loopback, pas le rendu GPU, le WAN ni le confort.

## Contrôles avant une PR

```sh
npm test                               # suite complète
npm run build && node scripts/validate-artifact.mjs
npm run e2e                            # si Chromium/Playwright est disponible
node scripts/build-info.ts && docker build -t i-am-a-moucheron:local .
```

`npm run build` produit dans `dist/` un runtime Node autonome (`npm ci --omit=dev &&
npm start`) ; le validateur vérifie la syntaxe ESM du serveur, les imports locaux et les
assets, pas l'installation des dépendances natives. Le build Docker est exigé même pour
une contribution documentaire ([Docker](docker.md)).

| Étape        | Commande                 | Prouve                                                      | Ne prouve pas           |
| ------------ | ------------------------ | ----------------------------------------------------------- | ----------------------- |
| Itération    | `npm test -- <fragment>` | règles, physique, protocole du système touché               | le reste de la suite    |
| Avant PR     | commandes ci-dessus      | domaine Node, pairs UDP natifs en loopback, types, artefact | WebGL, navigateur, WAN  |
| CI de PR     | workflows ci-dessous     | idem, image qui démarre, Chromium réel en loopback          | rendu GPU, confort, WAN |
| Après fusion | essai humain sur le VPS  | partie réelle                                               | —                       |

## Intégration continue

| Workflow / job                                                                                              | Rôle                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Docker build validation` › `Docker build`                                                                  | construit l'image, la démarre, vérifie `/healthz` (`ok`, `storage=ram`, `transport=webrtc-udp`) et le 410 de `/api/join` |
| › `Full game regression and formatting`                                                                     | `npm test`, `npm run build`, `validate-artifact.mjs`                                                                     |
| › `Real Chromium over WebRTC UDP/TCP`                                                                       | `npm run e2e`                                                                                                            |
| › `50-player snapshot comparison`, `50 native UDP peers`, `Physics contact regression and 50x900 benchmark` | mesures de capacité ([performances](performance.md)), pas des tests de règles                                            |
| `Docs site`                                                                                                 | site de documentation en mode strict ; publication depuis `main` ([site](site.md))                                       |
| `Meshy asset tooling validation`                                                                            | outil GLB ([pipeline d'assets](asset-pipeline.md))                                                                       |
| `Conflict alert`                                                                                            | à chaque push sur `main`, label `conflit` et commentaire sur les PR devenues conflictuelles                              |
| `Build and publish Docker image`                                                                            | publication GHCR sur `main` ([déploiement](#déploiement))                                                                |

Les contrôles requis pour fusionner sont configurés dans la protection de `main`, hors du
dépôt ([Docker](docker.md#contrôle-de-contribution-et-protection-de-main)).

## Limites de validation

Selon le changement, l'essai en jeu couvre : entrer et signer chaque poste, deux joueurs
sur des sièges différents, achats, tirs, sortie, chute, purgatoire, lit personnel et
repli au départ. Distinguer les contrôles de domaine des interactions humaines réellement
exécutées.

Un navigateur de contrôle sans GPU ne crée pas de contexte WebGL matériel et ne confirme
pas une partie UDP sur son réseau ; le chargement du client, les panneaux et la géométrie
Three.js restent testables, et les images comparatives des modèles sont des projections
CPU. Pointer Lock, confort du pilotage, tactile, écoute, charge maximale et WAN se
vérifient sur le VPS. La capacité configurée (128 connexions, `maxConnections` de
`server/index.js`) ne prouve pas les performances à cette charge ; la cible de jeu reste
un groupe de 5 à 10 joueurs ([performances](performance.md)).
