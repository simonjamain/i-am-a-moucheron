# Exploitation, livraison et vérifications

## Déploiement

Le dépôt GitHub est la référence. Chaque commit sur `main` déclenche le workflow
[docker.yml](../.github/workflows/docker.yml), qui publie l’image
`ghcr.io/simonjamain/i-am-a-moucheron:latest` (et un tag `sha-<commit>`). Un
environnement extérieur au dépôt récupère périodiquement la dernière image `latest`
et la déploie sur le VPS. Il n’y a ni ZIP de livraison ni autre cible de publication ;
les agents ne provisionnent pas de serveur et gardent secrets et administration du
VPS hors des contributions. Une installation sur le VPS n’est pas revendiquée sans
accès et résultat vérifiés.

Pour jouer ou tester en local avec Node 22.18+ :

```sh
npm ci
npm start
```

Le serveur Node garde toutes les salles en RAM ; un redémarrage (et donc chaque
déploiement) efface les parties. HTTP sert les assets, `/healthz` et la négociation
WebRTC. Le gameplay utilise UDP, avec un secours TCP WebSocket ; les anciennes routes
HTTP renvoient 410. HTTPS, IP annoncée, pare-feu et plage UDP sont détaillés dans
[serveur UDP](udp-server.md). Construire l’image soi-même : [guide Docker](docker.md).

## Assemblage et contrôles

Modifier `src/`, `server/`, `scripts/` et les documents de référence. L’assembleur
produit `server/assets.js` pour Node et l’aperçu des vrais
composants `/ui-review.html` sur données de démonstration. Les modules navigateur
ont des URL fondées sur leur contenu.

```sh
npm test            # inclut tsc, format:check et les liens Markdown
npm run build
node scripts/validate-artifact.mjs
npm run e2e         # si Chromium/Playwright est disponible
```

`VERSION`, `server/assets.js` et `src/changelog-recent.ts` sont générés (Git les ignore ; voir
[version et nouveautés](changelog.md)) : `npm test` et l'assembleur les produisent.
À chaque push sur `main`, le workflow `Conflict alert` signale aux PR devenues
conflictuelles (label `conflit` et commentaire) qu'elles doivent intégrer `main`.
Le workflow `Docker build validation` contient aussi le job `Full game regression and formatting` :
`npm test` (qui inclut `format:check` et `check:docs`), le build et `validate-artifact.mjs` ; `docker build` local reste exigé avant livraison
([Docker](docker.md)).
Le workflow `Docs site` construit le [site de documentation](site.md) en mode strict à
chaque PR et le publie sur GitHub Pages depuis `main`.

`npm test` lance `scripts/run-tests.mjs`, qui assemble puis exécute la liste de
`scripts/suite.mjs`, chaque script dans son propre processus, **en parallèle** (un par
CPU ; `--jobs=1` pour l'ordre séquentiel), et résume tous les échecs et les cinq scripts
les plus lents. La sortie de chaque script s'affiche d'un bloc à sa fin. Les scripts
sont indépendants : serveurs sur le port 0 ou sur des plages UDP fixes distinctes,
fichiers temporaires en `mkdtemp` ; un nouveau test qui ouvre un port fixe en choisit un
libre. `npm test -- <fragment>` cible les scripts dont le nom contient le fragment,
`--bail` ne démarre plus de script après le premier échec, `--list` affiche la liste.
`test-run-tests.mjs` vérifie que le lanceur parallèle garde rouges un échec d'assertion,
une promesse rejetée et un processus tué. Mesuré le 22 novembre 2026 (v416, conteneur à
4 CPU, suite de 182 scripts) : environ 36 s en parallèle, borné par le CPU total ; 79 s
avec `--jobs=1` (100 s avant que les six graines de `test-ground-spread.mjs` ne soient
réparties sur des workers : ce script passe seul de 24 s à 8 s).
Avant une livraison, lancer la suite entière ; elle inclut `tsc` (`test-typescript.mjs`),
la cohérence des tables par espèce et par véhicule (`test-registries.mjs`), la mise en
forme (`test-format.mjs`, soit `npm run format:check`, environ 9 s) et les liens Markdown
locaux (`test-docs-links.mjs`, soit `npm run check:docs`) : un oubli échoue dans la boucle
locale plutôt qu'après un aller-retour de CI.
`test-suite-wiring.mjs` échoue si un `scripts/test-*.mjs` n'est pas dans
`scripts/suite.mjs` (seul `test-udp-capacity-50.mjs`, lourd, a sa commande
`test:capacity`) : un test orphelin ne protège rien. Il exige de même que chaque
`scripts/e2e-*.mjs` figure dans la liste `E2E` de `scripts/suite.mjs` (donc dans
`npm run e2e` et la CI) ou dans `E2E_MANUAL` avec sa commande et sa raison. `npm run test:udp` est un raccourci
de `npm test` filtré sur le protocole (domaine RAM, pairs natifs UDP, port partagé, repli TCP).

| Étape        | Commande                                                                                                                 | Ce qu'elle prouve                                                                     | Ce qu'elle ne prouve pas |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------ |
| Itération    | `npm test -- <fragment>`                                                                                                 | règles, physique, protocole du système touché                                         | le reste de la suite     |
| Avant PR     | suite entière (tsc, format, liens inclus), `build` + `validate-artifact`, `npm run e2e` si possible, `docker build`      | domaine Node, deux pairs UDP natifs en loopback, types, artefact                      | WebGL, navigateur, WAN   |
| CI de PR     | `Full game regression and formatting`, `Docker build`, `Real Chromium over WebRTC UDP/TCP`, `Docs site`, outils d'assets | idem, plus image qui démarre, Chromium réel en loopback (WebGL logiciel), site strict | rendu GPU, confort, WAN  |
| Après fusion | essai humain sur le VPS                                                                                                  | partie réelle                                                                         | —                        |

Les jobs CI de benchmark et de capacité (`50-player snapshot comparison`,
`Physics contact regression and 50x900 benchmark`, `50 native UDP peers`) mesurent des
performances ; ils ne remplacent pas les tests de règles.
`npm run format:check` est la seule commande de format, en local et
en CI (job `Full game regression and formatting`) ; les données générées
(`src/*data.ts` importées, `docs/ui-review.html`) sont dans `.prettierignore`.
Le job `Docker build` démarre l'image construite et vérifie `/healthz`
(`ok`, `storage=ram`, `transport=webrtc-udp`) et le 410 de `/api/join` : il prouve
que l'image démarre, pas les pairs UDP dans le conteneur, WebGL ni le WAN.

Scénarios navigateur réel : `npm run e2e` (`run-tests.mjs --e2e`, un scénario à la fois,
résumé de tous les échecs ; `npm run e2e -- loading` filtre comme `npm test`). Liste `E2E` de
`scripts/suite.mjs` : reprise de pilote, mouvements partagés entre deux pages, repli TCP, chute
vue par un second client, écran de chargement (`e2e-loading`), nuages WebGL du bureau
(`e2e-office-clouds`) et contraste HUD/lit/traçantes (`e2e-contrast-bed`). Mesuré le
23 novembre 2026 (conteneur à 4 CPU) : 7 scénarios en 130 s. Hors `npm test` car ils exigent
Chromium ; le job CI `Real Chromium over WebRTC UDP/TCP` les exécute à chaque PR
(Playwright installé à la volée, pas une dépendance du projet). `e2e-loading` échantillonne
le départ de l'écran de chargement dans la page (toutes les 30 ms) au lieu de lire le fondu
après des délais fixes : sur un CPU chargé, Playwright voyait le départ jusqu'à 400 ms en
retard et lisait un écran déjà retiré (10 passages sur 10 après correction, dont 4 sur un seul
CPU). Seul `e2e-layouts` (sélecteur de plans, `npm run e2e:layouts`, 133 s en local) reste
manuel : il expire sur le runner CI (90 s d'attente de page). Lancer le script ciblé
(`npm run e2e -- resume`, `-- motion`, `-- tcp`…) pendant l'itération. Ils prouvent la poignée de main
WebRTC et les flux en loopback, pas WebGL (rendu supprimé ou logiciel), le WAN ni le confort.
Ils ouvrent des pages de 320×240 : le WebGL logiciel dessine chaque pixel sur le CPU, et
sur deux cœurs deux pages 1280×720 se privaient mutuellement (le serveur coupe un pilote
muet depuis 15 s ; échec reproduit avec `taskset -c 0,1`, disparu avec la petite page).
Leurs attentes tolèrent aussi un runner lent : la reprise attend jusqu'à 45 s, le mouvement de
l'autre pilote est attendu par sondage (30 s) et l'absence de nouvelle tentative UDP se
vérifie en comptant les `RTCPeerConnection` de la page, non au chronomètre.
`test-wave-preparation.mjs` utilise des graines fixes (`WAVE_SEEDS=2000` pour élargir) : plus
de test aléatoire intermittent.

Le build produit `dist/` avec serveur, modules partagés, assets et manifestes npm.
Dans ce répertoire : `npm ci --omit=dev && npm start`. Le validateur vérifie
la syntaxe ESM du serveur, les imports locaux du runtime et les assets UDP.
Il ne prouve ni l’installation des dépendances natives ni un déploiement WAN.
La suite complète inclut les tests de règles Node, physique, signatures, assets,
interface et les deux clients natifs UDP.
`AGENTS.md` exige une revue des documents concernés par la modification en plus
du contrôle mécanique des liens ; un audit global fait l’objet d’une tâche dédiée.

Le test ciblé `node scripts/test-laboratory.mjs` couvre l’interrupteur debug (activation, désactivation), l’isolation des rooms, les autorisations, le déblocage, le refus des anciens outils de test et le retour à une partie normale.

## Vérification navigateur et limites

Selon le changement : entrer/signer chaque poste, deux joueurs sur des sièges
différents, achats, tirs, sortie, chute, purgatoires, lit personnel et repli au
départ. Distinguer les contrôles de domaine des interactions humaines réellement
exécutées. L’aperçu utilise les vrais composants HUD, banque et lit avec des
contrats et une caisse jetables ; il n’est pas une partie multijoueur.

Le navigateur de contrôle ne crée pas de contexte WebGL et ne confirme pas une
partie UDP sur son réseau. Le chargement du client et les panneaux sont testables,
ainsi que la géométrie Three.js sans GPU. Les images comparatives des modèles
sont des projections CPU des triangles. Pointer Lock, confort du pilotage,
tactile physique, écoute, charge maximale et WAN restent à vérifier sur la VM.
La capacité configurée (128 connexions simultanées, `maxConnections` de `server/index.js`) ne prouve pas des performances à cette charge ;
la cible de jeu reste un petit groupe de 5–10 joueurs.

Recharger tous les navigateurs après un déploiement ; le serveur Node conserve ses
assets assemblés au démarrage et doit être redémarré après modification. Les
comparaisons CPU de rendu se reproduisent avec `node scripts/review-return-performance.mjs`
dans un clone Git contenant le commit de référence. Références métier :
[retours terrain](field-update.md), [lisibilité et nettoyage](clean-flight.md),
[retours multijoueurs](multiplayer-return.md), [véhicules d’appui](support-vehicles.md)
(validation WebGL/WAN de HEL-06/DCM-03 non faite ; le navigateur de contrôle refuse UDP).

## Tir automatique avec latence simulée

`node scripts/test-aircraft-fire.mjs` reproduit un tir continu à 100 balles/s
avec 200 ms de réponse et 5 % de confirmations perdues après traitement
serveur, puis des scénarios à 500 et 1 000 balles/s. Il vérifie qu'aucun tir
local n'est refusé, que les rapports restent idempotents et que la cadence
reste stable à 20, 30, 60 et 120 FPS. Cette simulation n'est pas une mesure
WAN ni une validation WebGL ; une partie sur le VPS reste nécessaire.

## Performance et capacité

Les snapshots serveur évitent désormais les recherches répétées dans les achats,
les dossiers et les corps du purgatoire : une seule traversée par collection,
avec index temporaire pour l'association des corps. Le calcul des arrivées
est partagé entre les champs `arrived` et `leaked`.
La suite `test-ram-game.mjs` inclut un scénario de 50 participants.
Il ne s'agit pas d'une preuve de capacité réelle à 50 clients : pour la valider,
mesurer CPU, mémoire, durée de snapshot, débit UDP, perte de paquets et FPS client
dans une salle de 50 navigateurs réellement connectés.

## Traitement des mouvements dans une grande salle

`Game.sync()` recevait à 20 Hz un message de mouvement par joueur. Même sans
rapport d'appareil abandonné, il recalculait à chaque fois le pilote hôte via
`live().map().sort()`. Désormais, l'élection n'a lieu **que si une liste non
vide d'appareils abandonnés est transmise** ; elle utilise une recherche linéaire
du premier ID actif. Les mouvements, la mise à jour de l'état et les validations
du serveur ne sont pas supprimés ni ralentis.

`node scripts/benchmark-motion-sync-50.mjs` compare la durée CPU de `sync()`
à 50 joueurs avec les sources de la version 72 ; la CI exécute ce scénario.
L'effet réel sur 50 navigateurs UDP et les frais de distribution réseau restent
à mesurer séparément.

## Diffusion des mouvements à 50 joueurs

Pour éviter environ 49 000 diffusions par seconde (50 émetteurs × 20 Hz ×
49 destinataires), le serveur relaie un mouvement sur deux à partir de 40
pilotes dans la salle, tout en validant et appliquant chaque message reçu.
Dans le scénario théorique de 50 joueurs envoyant tous à 20 Hz, le total
des relays passe de **49 000 à 24 500 messages/s**. Ce sont des volumes
calculés, non des observations WAN ni une garantie de débit ou de FPS.
L'interpolation distante passe à 10 Hz dans ces grandes salles ; la latence
et la visée doivent être vérifiées en jeu. Le test
`scripts/test-motion-capacity.mjs` vérifie les deux cadences et la prise en
compte de tous les mouvements.

## Validation native de 50 connexions UDP

`npm run test:capacity` démarre un serveur local et établit 50 connexions
WebRTC/UDP natives distinctes en petits lots, toutes dans une même room.
Le test vérifie la présence des 50 pilotes, les deux canaux UDP ouverts,
puis émet plusieurs mouvements par pilote en mesurant le relais et la
mémoire du processus. Le test est également exécuté en CI.

Les chiffres de ce test local sont des mesures sur `127.0.0.1`, avec pairs
`node-datachannel`, **pas** des FPS WebGL, du trafic WAN ni des garanties de
fluidité avec 50 navigateurs réels. La validation finale doit rester
effectuée dans un navigateur sur le VPS, avec la latence et la charge GPU
réelles.

## Contributions GitHub

Branches parallèles, revue, essais et fusion : [CONTRIBUTING](../CONTRIBUTING.md).
Les environnements temporaires par PR ne sont pas encore configurés.

## Mesure reproductible des snapshots (50 joueurs)

Après `npm ci`, exécuter `node scripts/benchmark-snapshot-50.mjs` depuis un
clone Git complet. Le script compare l'implémentation avant l'optimisation
(commit `2f02d128997b8ffadfc9f4ba43afd1b6ebfe3442`) à l'implémentation
courante sur un même état de salle : 50 pilotes, des commandes en attente et
une file de PNJ. Il neutralise `advance()` pour isoler **la construction des
snapshots** et vérifie que leurs contenus restent identiques. Il affiche
les médianes CPU et un ratio, sans prétendre mesurer le réseau, la physique,
le rendu WebGL ou 50 utilisateurs réels.

La CI des PR exécute ce benchmark et le test de domaine de 50 participants
en plus de la construction Docker. Pour une validation de capacité, instrumenter
une partie UDP avec 50 clients indépendants et relever FPS, délai des commandes,
débit, CPU et mémoire.

### Position d’Alpha dans le comparatif historique

Depuis la version 291, `benchmark-snapshot-50.mjs` vérifie explicitement le
changement de coordonnées de la station Alpha depuis son commit de référence.
Les autres champs de la station doivent rester identiques ; le reste du snapshot
conserve sa comparaison complète. Ce contrôle ne retire pas la station du paquet
et ne change ni les mesures CPU ni le nombre de joueurs du scénario.
