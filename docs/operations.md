# Développement, publication et vérifications

## Image Docker

Le [guide Docker](docker.md) décrit l’archive AMD64, son import avec `docker load`,
Compose, Portainer et l’override Traefik. Ce paquet s’installe sur la VM ;
il ne modifie pas l’hébergement public Sites existant.

## Serveur Node en RAM / UDP

`npm ci && npm start` lance le nouveau runtime, sans D1 ni SQLite.
HTTP sert uniquement les fichiers, la santé et la négociation WebRTC.
Les routes HTTP de gameplay renvoient 410. UDP est obligatoire.
Déploiement VM, ports, HTTPS, variables et vérifications : [guide UDP](udp-server.md).
Les commandes `npm run build` et les procédures Sites ci-dessous concernent
uniquement la version Worker historique : elles ne déploient pas le serveur Node.

## Sources et identité

Le Site est « i am a moucheron » (ancien repère technique : Flight Lab).
Son identifiant immuable est déclaré dans `.openai/hosting.json` :
`appgprj_6ae1e591360481919010bdf89f8da3f0`.
Le Site est public ; conserver cette audience sauf demande explicite.

URL confirmée le 29 octobre 2026 :
https://moucheron-flight-lab.jamain-simon.chatgpt.site/
Retrouver l’URL et la version actuelles avec Sites `get_site` avant une livraison ;
l’URL peut évoluer. La version jouable vérifiée lors de cette consolidation est
022, commit `d843bda820918d6e7cd4b2f33d0ba2254ea3b18e`.
Ce repère daté n’est pas un compteur à maintenir après chaque modification.

Une session disposant du skill Sites peut rouvrir le dépôt lié à cet identifiant
avec son flux d’accès aux sources. Le chemin `/workspace/sites/moucheron-flight`
est celui de cette session, pas une garantie pour un nouveau chat. Les fichiers
joints au projet ChatGPT et les fichiers du dépôt sont deux ensembles distincts.

## Assemblage et stockage

`src/` contient les modules éditables. `scripts/assemble.mjs` embarque le graphe
d’assets et la logique serveur dans `worker/index.js`. `scripts/build.sh` produit
le Worker déployable sous `dist/`. Le navigateur reçoit des modules à adresses
basées sur leur contenu, pour éviter les mélanges de versions en cache.

D1 conserve salles, joueurs, documents, véhicules, sièges, événements et achats.
Le développement utilise l’adaptateur SQLite de `scripts/local-db.mjs`. Les
migrations se trouvent dans `drizzle/` ; ajouter une migration et mettre à jour
le chemin local d’application et le journal lors d’un changement de schéma.

Les sons et modèles sont construits dans `audio.js`, `graphics.js`, `office.js`,
`combat.js` et `sortie.js`. Un ajout de fichier servi doit entrer dans le manifeste
de `scripts/assemble.mjs` ; déposer un fichier dans le dépôt ne le rend pas servi.

## Vérification et publication

Les commandes sont dans `package.json` ; le README donne le parcours courant.
Les tests assemblent le Worker et exercent les routes HTTP, SQLite, modules de
physique, contrôles, réseau, scènes, achats et signatures. Relancer les vérifications
pertinentes après une modification et noter ce qui a réellement été exécuté.

Pour publier, lire le skill Sites disponible dans la session : ouvrir le dépôt
existant, préparer les sources, vérifier, pousser le commit exact, enregistrer une
version puis la déployer avec l’audience existante. Vérifier le résultat terminal
du déploiement et son URL retournée. Les chemins des helpers dépendent de la
version installée du plugin ; les reprendre depuis le skill actuel.
Une consolidation purement documentaire peut être poussée au dépôt sans
redéployer le jeu ; préciser alors que la version jouable reste inchangée.

## Parcours de contrôle manuel

Selon la zone modifiée : rejoindre une salle à deux, marcher, signer au relâchement,
entrer dans chaque type de siège, sortir avec F, piloter avec A/E, ouvrir/replier
le parachute en vol, acheter et placer un équipement, lancer une vague, mourir et
revenir via Saint Pierre. Vérifier les indications de transport réellement obtenues.
Tester les interactions touchées plutôt que répéter mécaniquement tout le parcours.

Lors de la livraison 022, la suite automatique, le formatage, le build et la
validation d’archive ont réussi. Le navigateur local a vérifié achats, signature
automatique, entrée/sortie DCA, émission d’un tir et bascule du parachute.
Le navigateur cloud était limité au rendu logiciel et refusait Pointer Lock.
La qualité visuelle WebGL, l’écoute subjective, la fluidité WAN et la charge
maximale n’ont donc pas été mesurées par ces contrôles.

## Limites connues

Le prototype vise de petits groupes, nominalement 5–10 joueurs. Le maillage RTC
est borné à 12 membres et dispose d’un repli HTTP. STUN aide à la découverte ;
aucun TURN n’est provisionné. Une connexion WebRTC n’est annoncée UDP que lorsque
les statistiques le confirment. Voir `src/network.js` et la
[recherche initiale](../NETWORK-RESEARCH.md).

Les positions et impacts sont déclarés par les clients dans un modèle coopératif.
Les signatures, sièges et transactions ont des contrôles serveur, sans faire du
jeu un système anti-triche compétitif. Les PNJ terrestres suivent des couloirs
conçus à l’avance, sans évitement général des installations ajoutées. Les grands
nombres de projectiles et d’insectes restent à profiler sur de vrais appareils.

La livraison du backlog du 29 octobre ajoute la migration `0009_player_worlds.sql`.
Les vérifications et limites de cette livraison sont consignées dans
[BACKLOG.md](../BACKLOG.md), avec sa référence de publication.

Le lot identification/contrats/logistique ajoute
`0011_logistics_contracts.sql`. Les tests de réserves/dossiers et les contrôles
navigateur ainsi que les limites HTTP/WebGL sont détaillés dans
[logistique et contrats](logistics-contracts.md). Aucun reset global des salles
n’est requis ; recharger les clients pour appliquer ensemble les nouvelles règles.

Le lot véhicules/banque, interfaces validées et intégrées, cible uniquement Node. Ne pas
publier son client sur le Worker historique, dépourvu des routes d’armes lourdes
et de banque. La maquette `/ui-review.html` est servie par le runtime local.
Le paquet Docker `2026.10.29-udp.2` inclut désormais les interfaces. Voir [véhicules et banque](vehicles-bank.md).
