# Exploitation, livraison et vérifications

## Déployer les sources courantes

La livraison habituelle est un **ZIP des sources**, sans `node_modules`, données
de partie, image Docker ni métadonnées Git. Extraire puis utiliser Node 22.13+ :

```sh
npm ci
npm start
```

Le serveur Node garde toutes les salles en RAM ; un redémarrage efface les parties.
HTTP sert les assets, `/healthz` et la négociation WebRTC. Le gameplay utilise UDP
uniquement ; les anciennes routes HTTP renvoient 410. HTTPS, IP annoncée, pare-feu
et plage UDP sont détaillés dans [serveur UDP](udp-server.md). L’utilisateur
installe sur sa VM ; les agents ne provisionnent pas de serveur externe.
Le [Dockerfile](../Dockerfile) reste une option de construction personnelle.
Les archives Docker `.1` et `.2` sont historiques, antérieures aux retours terrain.

## Sources et Site historique

Le Site historique `appgprj_6ae1e591360481919010bdf89f8da3f0` est indépendant.
Son identité et sa configuration ne font plus partie du paquet courant.
Le dépôt GitHub est la référence ; le build et sa validation ciblent Node sur VPS.
Une intervention sur le Site historique utilise son ancien dépôt via Sites,
sans réintroduire ses instructions ou son manifeste dans le runtime Node.

Le Site public Worker/D1 reste distinct du runtime Node/UDP. Les nouvelles
commandes d’armes lourdes, banque, lits, impacts de chute, bons prépayés et nettoyage ciblent Node. **Ne pas
publier leur client sur le Worker**, qui ne possède pas ces opérations. Les
sources sont poussées au dépôt, puis livrées en ZIP. Une installation sur VM
n’est pas revendiquée sans accès et résultat vérifiés. La publication historique
et les tests D1 restent disponibles pour compatibilité avec les versions précédentes.

## Assemblage et contrôles

Modifier `src/`, `server/`, `scripts/` et les documents de référence. L’assembleur
produit `worker/assets.js` pour Node, le Worker historique et l’aperçu des vrais
composants `/ui-review.html` sur données de démonstration. Les modules navigateur
ont des URL fondées sur leur contenu. Les migrations `drizzle/` déjà publiées
restent immuables ; Node ne les charge pas.

```sh
npm run format:check
npm test
npm run check:docs
npm run build
node scripts/validate-artifact.mjs
```

Le build produit `dist/` avec serveur, modules partagés, assets et manifestes npm.
Dans ce répertoire : `npm ci --omit=dev && npm start`. Le validateur vérifie
la syntaxe ESM du serveur, les imports locaux du runtime et les assets UDP.
Il ne prouve ni l’installation des dépendances natives ni un déploiement WAN.
La suite complète inclut les tests de règles Node, physique, signatures, assets,
interface et les deux clients natifs UDP. Les tests Worker utilisent SQLite pour
la compatibilité historique ; cette dépendance n’est pas dans le serveur Node.
`AGENTS.md` exige une revue des documents concernés par la modification en plus
du contrôle mécanique des liens. Un audit global fait l’objet d’une tâche dédiée. La [revue du 29 octobre 2026](archive/reference-audit-2026-10-29.md)
reste une trace historique, pas une seconde référence métier.

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
La capacité configurée (100 joueurs) ne prouve pas des performances à cette charge ;
la cible de jeu reste un petit groupe de 5–10 joueurs.

## Référence métier du lot courant

[Retours terrain](field-update.md) : causes d’embarquement, mesure avant/après de E,
visée, chute, lits, résurrection, lunette et prêts. Les résultats mesurés avec un
retard de réponse injecté ne sont pas des mesures de latence réseau réelle.
Le ZIP final contient tous les fichiers nécessaires à `npm ci && npm start`,
les tests, le backlog et les références à jour.

Dernier lot : [lisibilité et nettoyage](clean-flight.md), incluant le Spitfire.
Recharger tous les navigateurs après installation du nouveau ZIP ; le serveur
Node conserve ses assets assemblés au démarrage et doit être redémarré après modification.

Lot courant : [retours multijoueurs](multiplayer-return.md). Les mesures CPU
comparatives sont reproductibles avec `node scripts/review-return-performance.mjs`
dans un clone Git contenant le commit de référence. Le ZIP permet de jouer sans
Git ; les benchmarks historiques demandent leur référence Git.

## Lot véhicules d’appui

[Hélicoptère et DCA mobile](support-vehicles.md) : code livré en ZIP, contrôles
locaux et deux pairs UDP vérifiés. HEL-06/DCM-03 restent en cours pour les essais
humains WebGL/WAN. Le navigateur de contrôle charge le client mais refuse UDP ;
les quatre HUD sont également consultables dans l’aperçu sans réseau.
`test-support-vehicles.mjs` fait partie de `npm test`. Le dépôt GitHub évolue indépendamment du Site historique ; le client Node
ne doit pas être publié sur le Worker historique.

Le [lot confort de jeu, version 37](comfort.md) précise réparation, zoom, jauges,
radar à pied, remise à zéro, fourmis et projectiles du pistolet courants.

Les [nuées densifiées](dense-swarms.md) multiplient les moucherons par cinq
et utilisent une grille spatiale pour le voisinage.

La [correction des commandes H2](helicopter-controls.md) couvre Z/O/Haut, S/Bas,
stationnaire, poussée locale et axe des roquettes.

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

Le [guide de contribution](../CONTRIBUTING.md) décrit les branches parallèles,
la revue, les essais et la décision de fusion. Les environnements temporaires
GitHub Actions ne sont pas encore configurés ; leur fonctionnement cible et
leurs contraintes UDP y sont consignés. Aucun déploiement VPS automatique
n’est revendiqué par la seule présence de ces instructions.

Le [lot de retours du 30 octobre, version 48](returns-30-october.md) décrit les correctifs
physiques, sons/HUD, livraisons sous parachute et parcours du purgatoire.

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
