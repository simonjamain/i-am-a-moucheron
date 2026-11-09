# Performances — mesures et limites

## Collisions des tirs

`InsectIndex` dans `src/insect-hits.js` sélectionne les candidats avec une grille
spatiale de 8 cm et un parcours des cellules traversées par le segment. Les mêmes
sphères conservatrices que le parcours exhaustif couvrent toutes leurs cellules.
Les intersections précises, tolérance du moucheron, exclusions et ordre des
impacts ex æquo sont conservés. L'index est invalidé après l'animation des ennemis
et construit au premier tir, une seule fois par image. Les suppressions entre
deux tirs sont filtrées. En dessous de 128 insectes, pour les rayons très longs,
les populations concentrées ou les modèles surdimensionnés, le parcours direct
reste disponible. Aucun ennemi ni projectile n'est supprimé par cette optimisation.

Reproduction : `npm run bench:collisions`. Le scénario CPU compare les mêmes
modèles et 256 segments de 2 cm, avec reconstruction de l'index incluse, après
échauffement ; 12 échantillons alternés par méthode. Population dispersée dans
2 m ou concentrée dans 12 cm. La médiane dépend de la machine et de sa charge.

Mesure locale du 31 octobre 2026, Node 24, avant / après (ms par lot) :

| Insectes | Dispersés, direct | Dispersés, index | Concentrés, direct | Concentrés, index/repli |
| -------- | ----------------- | ---------------- | ------------------ | ----------------------- |
| 100      | 1,39              | 1,33             | 5,39               | 5,01                    |
| 300      | 4,27              | 2,43             | 20,32              | 21,96                   |
| 900      | 12,33             | 4,26             | 72,35              | 71,54                   |

Le cas compact conserve le coût des intersections et ne promet aucun gain ;
le repli évite le tri d'une grande partie de la population. Les temps CPU ne
mesurent ni FPS, ni GPU, ni WAN. Les plafonds de population restent inchangés.

`test-insect-index.mjs` compare les impacts au parcours exhaustif avec les six
espèces, rotations/échelles, portées, exclusions, frontières de cellule,
suppressions, transformations parentes et modèles surdimensionnés.

Essai en jeu : une rafale dans et autour d'une nuée, puis un tir personnel sur
chaque espèce ; vérifier les impacts, les alliés, le mobilier et les fins de vague.
L'environnement temporaire est indisponible ; utiliser `npm ci && npm start`
et le réseau UDP décrit dans [l'exploitation](operations.md).

## Encodage des réponses UDP

`GameSession` conserve les réponses JSON immuables pour rejouer une commande.
`encodeReplyText()` découpe désormais ce texte directement, au lieu de le parser
puis de le resérialiser. `encodeReply()` garde son interface objet. Le format v1,
les identifiants, le découpage à 12 000 caractères et la limite de 4 Mio de
caractères sont conservés ; ce changement n'économise aucun octet réseau.
Le chemin texte est interne et attend du JSON déjà produit par `JSON.stringify`.
Les requêtes entrantes restent validées comme avant.

`node scripts/test-udp-reply-encoding.mjs` compare les paquets à un encodeur v1
figé, indépendant du code de production : erreurs, Unicode, frontières de blocs,
réassemblage inversé et dépassement de limite. Les tests de session et deux pairs
UDP couvrent le rejeu sans réexécuter une commande et l'immuabilité de la réponse.

`npm run bench:udp-replies` compare les mêmes réponses de vagues réelles (24, 288
et 300 ennemis), avec l'encodeur historique figé : 12 lots alternés de 100 envois
après échauffement. Le premier envoi inclut la sérialisation initiale commune ;
le rejeu utilise la chaîne déjà en cache. Exemple local Node 24, réponse de
91 766 caractères : premier envoi 1,19 → 0,50 ms ; rejeu 0,89 → 0,22 ms.
Ce sont des temps CPU d'encodage, pas la latence réseau ni le coût total serveur.

## Traceurs instanciés

Sur WebGL, `TracerPool` conserve les objets de calcul des tirs mais les retire de
la scène. `flush()` recopie les matrices exactes du halo/cœur dans deux lots par
calibre, une seule fois après les sous-étapes balistiques et avant le rendu. Les
halos utilisent leur couleur individuelle ; les cœurs conservent leur matériau.
Géométrie, longueur, largeur minimale projetée, mélange additif et profondeur
restent identiques. La balistique, les collisions et le plafond de 256 traceurs
ne changent pas. Les traceurs personnels restent sur leur chemin actuel.
Le renderer logiciel conserve les meshes ordinaires, car il ne gère pas les
instances. Les lots vides ont zéro instance ; les ressources sont libérées avec
le pool. Les lots sont exclus du culling global pour ne pas masquer un tir actif
à cause d'une ancienne enveloppe ; ils comportent au plus 256 traceurs, soit 512 instances halo/cœur.

`node scripts/benchmark-tracers.mjs` inventorie les vrais objets de scène et les
triangles, puis mesure la préparation CPU des matrices (échauffement + médiane
sur 100 passages). Pour 256 tirs et deux calibres, 512 objets de rendu deviennent
4 lots ; le nombre de triangles est conservé. C'est un inventaire CPU, pas une
mesure de draw calls réels ni une promesse de FPS. Le coût de copie des matrices
reste présent.

Le comparateur `scripts/review-tracers.html` sert la même scène statique, les mêmes
256 tirs et la même caméra avec et sans instances ; il rapporte draw calls,
triangles, temps CPU de soumission et différences des pixels lus au GPU. Le temps
CPU ne constitue pas une mesure GPU. Depuis la racine, `python -m http.server 8089`
puis ouvrir `http://localhost:8089/scripts/review-tracers.html` et comparer les deux
images. Cette page est un outil local, absent des assets de jeu. Elle ne remplace
pas l'essai en rafales, les impacts et le confort en vraie partie. Le navigateur
de contrôle de cette session ne joint pas le serveur local (connexion refusée) :
aucune parité de pixels ni mesure GPU n'a été observée ici.

Le tri des halos instanciés par rapport aux autres surfaces transparentes n'est
pas identique au tri objet par objet. Le comparateur inclut donc un obstacle
opaque, une surface alpha et les ailes de vrais insectes. Une différence de
composition doit être jugée visuellement ; la parité de matrices/couleurs ne
suffit pas. Cette contribution reste candidate tant que cette observation et
les mesures de rendu réel sont indisponibles.

## Montée en charge : collisions véhicule–ennemi (version 78)

Le serveur calcule les contacts entre les véhicules et les ennemis des vagues.
Dans le parcours précédent, il effectuait une distance euclidienne avant une
intersection précise pour chaque paire, même très éloignée. La fonction
`sweptSphereMayTouch()` rejette désormais les sphères sans chevauchement avec
la boîte englobante du segment parcouru par le véhicule, élargie du rayon de
la cible. **Tout vrai contact passe toujours le calcul exact**, et les dégâts,
les `contacts` et l'ordre des collisions sont conservés.

Ce correctif reprend les résultats géométriques de la contribution #32,
dont la branche était antérieure aux autres optimisations. Le benchmark CPU
déterministe (`npm run bench:swarm-50`) compare 50 segments véhicules contre
900 sphères, soit 45 000 paires, sans WebGL, réseau, gravité ni trafic des
clients. Le jeu de référence de #32 mesurait sur GitHub Actions 7,017 ms en
parcours direct contre 0,415 ms après rejet conservateur, sur un jeu dispersé
sans impacts. La version courante inclut **au moins un impact vérifié**.
Les résultats CI de la version courante font foi pour cette révision.

`scripts/test-swept-broadphase.mjs` vérifie 45 000 couples pseudoaléatoires
et des contacts aux limites contre `segmentSphere`. Ce test et le benchmark
sont contrôlés par GitHub Actions. Les mesures CPU ne valent pas garantie
de FPS avec 50 joueurs ; vérifier en partie des vagues denses, collisions
avec plusieurs avions, dégâts, latence et fluidité.

## Nuées procédurales à forte population

`src/waves.js` saute le voisinage de groupe pour les moucherons : positions
calculées directement depuis ID, route et temps, avec une complexité
essentiellement linéaire par trame moucheron. Les autres espèces conservent
la grille de voisinage existante. `src/midge-batch.js` réduit les meshes
WebGL **vivants** des moucherons à trois lots instanciés, sans rendre les
collisions dépendantes du rendu. `src/insect-hits.js` utilise le rayon
mathématique de la sphère pour les intersections et le même index spatial.
Le serveur ajoute un rejet AABB rapide avant les intersections segment–sphère
des armes lourdes. Aucun changement d'autorité des impacts.

`server/session.js` omet `roster` des réponses `sync` répétées
avec le même `wave`, `started` et `balanceRevision`. Les réponses
sur nouvelle vague ou nouvelle révision transmettent toujours le roster,
et `client.js` reconstitue le champ omis depuis l'état précédent.
Une nouvelle connexion reçoit le roster entier.

Les tests `test-dense-swarms`, `test-midge-batch` et
`test-roster-sync` sont des tests CPU/règles, pas des mesures GPU,
de débit UDP réel ou de fluidité à 10k sur appareil joueur. Tester
indépendamment 1 000, 5 000 et 10 000 ennemis visibles, tirs soutenus,
reconnexion, réseau perturbé et parties à plusieurs postes. Les effets
cosmétiques des ennemis blessés et la taille d'un snapshot initial très
dense peuvent rester limitants.

## Son des grandes nuées

`swarmAudioGroups()` regroupe les insectes vivants par cellule spatiale de
40 mètres (échelle du bureau), puis retient au plus **5 sources HRTF** selon
leur proximité et la densité de leur cellule. Le niveau du bourdonnement croît
de façon logarithmique et est plafonné ; les clés spatiales stables évitent
qu'une mort isolée ne coupe les sons des autres individus. Une préférence pour
les cellules déjà audibles réduit les changements brusques de sources.

Le regroupement et les positions/gains audio sont calculés côté client
**10 fois par seconde** (et après tout changement de scène), au lieu de trier
tous les insectes à chaque image. La complexité du regroupement est linéaire
en fonction du nombre d'insectes. Le cache des échantillons Web Audio,
l'atténuation spatiale, la limite des boucles et les sons de morts/chutes
individuels sont conservés. Aucun message réseau n'est ajouté.

`scripts/test-audio.mjs` inclut un test CPU à **10 000 individus**, vérifiant
le nombre de sources, les morts, la spatialisation gauche/droite, les exclusions,
le plafond de gain et le budget de voix. Ces tests ne valident pas la perception
sonore en navigateur, notamment lors du franchissement des frontières de cellules,
avec une nuée entourant la caméra ou plusieurs moteurs d'avions simultanés.

## Trafic UDP des grandes nuées — états différentiels (version 114)

Le roster immuable est désormais omis **avant** la copie `structuredClone`
dans `Game.snapshot()` pour toutes les commandes, et pas seulement pour
`sync`. Le serveur et le client mémorisent une base de synchronisation propre
à chaque connexion fiable. Le premier état et chaque changement de vague,
d'équilibrage ou de roster transmettent la liste complète, regroupée par
segments de nuée avec propriétés communes et colonnes de valeurs individuelles.
La reconstruction restitue les mêmes identifiants et trajectoires.

Entre ces changements, les confirmations ne contiennent plus la liste
des insectes. Les listes de morts et les dégâts n'envoient que les nouveaux
indices et les valeurs modifiées ; le réassemblage côté navigateur restitue
les champs historiques `kills` et `enemyDamage` avant traitement du snapshot.
Les apparitions ajoutées à un roster existant sont transmises comme un **ajout de nuée**
compact, si la vague et l'équilibrage sont inchangés. Une révision qui ne consiste pas
en ajout repart d'un roster entier. Les positions restent calculées localement.

Contrôles : `node scripts/test-roster-sync.mjs` et
`node scripts/test-snapshot-wire.mjs` (parité des objets, 10 000 insectes,
révisions et deltas). Les économies de volume ne garantissent ni l'absence de
déconnexions ni les FPS sur WAN. Mesurer les débits, la saturation du canal
fiable, les temps CPU, les délais de confirmations et les fermetures ICE/DTLS.

## Coût des `sync` en salle chargée (version 247)

`advance()` s'exécute à chaque commande, deux fois par `sync`. Sa partie
`vehicleContacts()` recalculait la position de toute la nuée (`swarmFrame()`)
à chaque appel : le coût serveur croissait comme joueurs × ennemis.
`Game.contactFrames()` réutilise désormais ces positions **au plus 50 ms**
(`CONTACT_FRAME_MS`), soit un calcul de nuée à 20 Hz au maximum par salle.
Le segment parcouru par chaque véhicule reste balayé exactement à chaque appel ;
seule la position des ennemis peut dater de moins de 50 ms. Le cache est
invalidé par un changement de roster, de révision, de vague, d'ennemis au sol
ou un recul de l'horloge. `benchmark-snapshot-50` neutralise `advance()` et
ne pouvait pas voir ce coût.

`npm run bench:room-sync` mesure la réponse `sync` complète (commande,
simulation, snapshot, encodage différentiel, JSON, découpage) pour N joueurs
et E ennemis, sans WebRTC, navigateur ni WAN. Trois séries alternées,
conteneur de développement, Node 22 (médiane ms par `sync`) :

| Joueurs / ennemis | Avant (v246) | Après (v247) |
| ----------------- | ------------ | ------------ |
| 30 / 900          | 6,7 – 9,7    | 1,3 – 1,5    |
| 50 / 900          | 5,0 – 7,8    | 1,9 – 2,0    |

À 50 joueurs envoyant 4 `sync`/s, le besoin passe d'environ 1 à 1,5 cœur à
environ 0,4 cœur. La taille d'un `sync` courant reste ~60 Ko à 50 joueurs
(`pilots`, `base`, `groundAgents`) : c'est la phase suivante du
[plan de montée en charge](tasks/scaling-plan.md). `test-contact-frames.mjs`
vérifie la parité avec un calcul direct, la fenêtre, les invalidations et un
contact balayé à partir de positions en cache.

## Réponses `sync` en patchs structurels (version 248)

Chaque réponse fiable ne transporte plus les champs inchangés du snapshot.
`encodeSnapshotForWire()` compare les champs (hors roster, morts et dégâts,
qui gardent leur encodage dédié) à ceux de la réponse précédente de la même
connexion et envoie un `$patch` : valeur remplacée, objet modifié avec clés
retirées, ou liste modifiée avec sa nouvelle longueur. Une liste de valeurs
simples (un vecteur `p`, `q`, `v`) est renvoyée entière dès qu'elle change.
La première réponse d'une connexion reste complète. Le canal `commands-v1`
étant fiable et ordonné, la base du client est toujours la réponse précédente ;
`ReplyAssembler` reconstruit le snapshot complet avant de le donner au jeu.
Une réponse rejouée (identifiant déjà appliqué) ne modifie jamais cette base.

`npm run bench:room-sync`, joueurs à pied qui bougent tous entre deux `sync`,
conteneur de développement, Node 22 :

| Joueurs / ennemis | `sync` courant v247 | v248   | CPU par `sync` v247 → v248 |
| ----------------- | ------------------- | ------ | -------------------------- |
| 10 / 900          | 16 Ko               | 2,3 Ko | 0,9 → 1,0 ms               |
| 30 / 900          | 38 Ko               | 5,8 Ko | 1,5 → 1,5 ms               |
| 50 / 900          | 60 Ko               | 9,5 Ko | 2,1 → 2,3 ms               |

À 50 joueurs et 4 `sync`/s, le débit descendant fiable passe d'environ
240 Ko/s à 38 Ko/s par joueur, et le débit sortant du serveur d'environ 12 Mo/s
à 1,9 Mo/s. Le reste est surtout la position des joueurs (`pilots`, `base`),
déjà portée par le canal de mouvement : elle sortira des réponses fiables dans
une phase suivante du [plan](tasks/scaling-plan.md).
`test-snapshot-patch.mjs` vérifie 5 000 cas aléatoires (clés retirées, listes
raccourcies, `undefined`, `NaN`, changements de type) et une vraie session dont
chaque réponse décodée égale la base enregistrée par le serveur.

## Snapshot partagé et positions distantes à 1 Hz (version 249)

**Snapshot partagé.** `Game.snapshot()` construisait et clonait la salle pour
chaque `sync` de chaque joueur. Avec `snapshotShareMs` (50 ms en production,
`SNAPSHOT_SHARE_MS` dans `server/index.js`), les `sync` d'une salle réutilisent
la partie « salle » construite au plus 50 ms plus tôt ; seuls le roster, les
dégâts reçus et l'heure (`now`, `sentAt`, toujours exacts) sont propres à
chaque réponse. Toute autre commande (achat, signature, tir, mort...) et tout
changement de clé de roster (vague, révision, équilibrage, époque) reconstruit
aussitôt la salle. Une modification issue d'un `sync` d'un autre joueur ou du
tick peut donc apparaître jusqu'à 50 ms plus tard. Le partage est désactivé par
défaut dans `Game`, pour les tests de domaine exacts.

**Positions distantes à 1 Hz.** Dans les réponses fiables, la position des
autres joueurs (`pilots[].state` : `p`, `q`, `v`, `omega`, visée, rotor,
remorque, `ground` ; leur `seen` ; l'état de leur véhicule ; leur corps dans
`base`) n'est rafraîchie qu'une fois par seconde (`MOTION_REFRESH_MS`).
Elle reste transmise à 20 Hz sur le canal de mouvement et ne sert, dans le
snapshot, que de secours quand ce canal se tait plus de 750 ms. Les champs de
jeu (PV, tir, mode, vie, sièges...), les données du joueur lui-même et toute
discontinuité (nouvelle vie, siège, mode ou véhicule) ne sont jamais retenus.

`npm run bench:room-sync` utilise désormais une horloge simulée : 4 `sync`/s
par joueur, régulièrement espacés, joueurs en mouvement toutes les 250 ms.
Trois séries, médiane ms par `sync` et taille d'un `sync` courant :

| Joueurs / ennemis | v248 (même banc) | v249         |
| ----------------- | ---------------- | ------------ |
| 10 / 900          | 2,9 – 4,3 ms     | 3,0 – 3,7 ms |
| 30 / 900          | 2,1 – 3,0 ms     | 1,8 – 2,1 ms |
| 50 / 900          | 2,5 – 3,1 ms     | 1,7 – 2,0 ms |
| 50 / 900, taille  | 14 – 15 Ko       | 8 – 10 Ko    |

Le gain croît avec le nombre de joueurs : à 10 joueurs, peu de `sync` tombent
dans la même fenêtre. Le reste du volume est surtout `groundAgents` (position
et direction des insectes au sol, simulées par le serveur) ; voir le
[plan](tasks/scaling-plan.md). `test-shared-snapshot.mjs` vérifie la fenêtre,
l'heure exacte, la reconstruction après commande et nouvelle vague, le partage
désactivé par défaut, la rétention des positions, les champs immédiats et les
discontinuités.

## Vue réseau des insectes au sol (version 251)

Les insectes au sol sont simulés par le serveur (`advanceGroundUnit`). Le
snapshot transmettait l'objet de simulation entier : appâts goûtés, repas,
rubans traversés, cible d'attaque, et positions à 17 chiffres. Le navigateur
n'en lit que la position, la direction et l'arrivée (`swarmFrame`,
`GroundMotionTrack`). `groundAgentsView()` n'envoie plus que `p` (arrondi à
1e-6 unité de carte, environ 0,05 % de la longueur d'une fourmi), `dir`
(1e-4) et `arrived` quand il est vrai. La simulation du serveur, ses contacts
et ses dégâts gardent l'état complet et non arrondi.

`npm run bench:room-sync`, même banc à horloge simulée, trois séries :

| Joueurs / ennemis | `sync` courant v250 | v251       |
| ----------------- | ------------------- | ---------- |
| 30 / 900          | 7,2 Ko              | 3,7–4,1 Ko |
| 50 / 900          | 8,1–9,9 Ko          | 4,6–5,3 Ko |

CPU par `sync` inchangé (1,5–2,1 ms dans les deux cas). `test-ground-view.mjs`
vérifie les champs envoyés, la précision et l'état complet du serveur.

## Mouvements relayés en lots binaires partagés (version 252)

Le relais des mouvements était devenu le premier poste réseau : un message JSON
de 630 à 820 octets par joueur et par destinataire, soit, à 50 joueurs (10 Hz
relayés à partir de 40), environ 49 messages et 34 Ko par destinataire et par
relais, et environ 17 Mo/s émis par le serveur. Désormais, chaque mouvement
accepté est encodé une fois en binaire, et la salle reçoit toutes les 50 ms les
mêmes lots, découpés sous 1 100 octets ([détails](udp-server.md#transport-et-fiabilité)).

Mesures :

| Scénario                                    | Avant (v251)       | Après (v252)          |
| ------------------------------------------- | ------------------ | --------------------- |
| État à pied / en vol / âme                  | 903 / 674 / 475 o  | 245 / 189 / 121 o     |
| 49 joueurs vers un destinataire, un relais  | 42 Ko, 49 messages | 12 Ko, 13 messages    |
| `test:capacity`, paquets reçus par 50 pairs | ~3 500             | 400                   |
| Encodages par mouvement accepté             | 1 par destinataire | 1 pour toute la salle |

Les deux premières lignes viennent de `test-motion-wire.mjs` (états
représentatifs, JSON sans le champ `v`), la troisième de `npm run test:capacity`
(mêmes mouvements envoyés, boucle locale). Ce sont des volumes, pas des mesures
WAN ni de fluidité. Précision : flottants 32 bits pour positions, vitesses et
angles (environ 1e-6 relatif), quaternion à 4,6e-5 près ; identifiants,
horodatages, entiers et chaînes exacts. `npm run e2e:motion` a vérifié dans deux
Chromium réels la réception (lots de 225 octets au plus à deux joueurs) et le
décodage par le module du jeu.

## Horloge serveur lissée pour les ennemis (version 255)

Les positions des nuées et des insectes au sol sont calculées par chaque
navigateur à partir de l'heure du serveur. `enemies()` la recalait sur chaque
réponse (`sentAt + temps écoulé depuis la réception`) : la variation du temps de
trajet d'une réponse à l'autre faisait **sauter toute la nuée**, en avant ou en
arrière, 4 à 10 fois par seconde. `ServerClock` (`src/server-clock.js`) garde,
sur 6 s, l'échantillon au trajet le plus court et s'en rapproche d'au plus 5 %
du temps écoulé : l'heure ne recule jamais et ne saute jamais, sauf pour se
resynchroniser au-delà de 500 ms d'écart (première réponse, onglet endormi).

`test-server-clock.mjs` simule des réponses toutes les 250 ms, un trajet de 20 à
120 ms (5 % à 300 ms) et un affichage à 60 images/s, sur 17 s mesurées :

| Horloge des ennemis | Retours en arrière | Sauts > 4 ms/image | Pire écart | Retard    |
| ------------------- | ------------------ | ------------------ | ---------- | --------- |
| Recalage (v252)     | 25                 | 66                 | 266 ms     | 20–300 ms |
| Lissée (v255)       | 0                  | 0                  | 0,8 ms     | 20–31 ms  |

Ce sont des mesures de simulation ; le ressenti doit être confirmé en partie.

## Interpolation des joueurs distants à l'heure de capture (version 256)

Les autres joueurs étaient datés à l'**arrivée** de leurs mouvements, avec un
délai d'affichage fixe de 100 ms. Les variations du trajet déformaient donc
l'espacement des échantillons (le mouvement affiché accélérait puis freinait),
et un paquet en retard ou perdu faisait passer en extrapolation, puis recaler
brutalement. Le défaut était le plus visible pour un mitrailleur, dont la vue
est portée par l'appareil d'un autre joueur.

Chaque navigateur joint désormais à son mouvement l'heure de capture, sur sa
propre horloge (`at`) ; le serveur la relaie dans les lots binaires (version 2
du format). `MotionTrack` place chaque échantillon à cette heure, ramenée sur
l'horloge locale avec le trajet le plus rapide observé (`ServerClock`, fenêtre
de 10 s). Le délai d'affichage s'adapte : intervalle habituel entre échantillons
plus le retard d'arrivée au 95e centile, plus 15 ms, borné entre 60 et 350 ms,
et ajusté d'au plus 5 % du temps écoulé. Sans heure de capture (instantané de
secours), le comportement précédent s'applique.

`test-motion-smoothing.mjs` : appareil en cercle à 5 unités/s, trajet de 20 à
120 ms (5 % à 300 ms), 5 % de pertes, affichage à 60 images/s ; un saut est une
image dont le pas s'écarte de plus de 50 % du pas réel.

| Joueur distant | Sauts | Pire écart de pas | Images extrapolées | Délai d'affichage |
| -------------- | ----- | ----------------- | ------------------ | ----------------- |
| 20 Hz, arrivée | 320   | 0,424             | 40                 | 100 ms            |
| 20 Hz, capture | 0     | 0,004             | 13                 | 145–159 ms        |
| 10 Hz, arrivée | 119   | 0,406             | 210                | 100 ms            |
| 10 Hz, capture | 0     | 0,004             | 34                 | 202–210 ms        |

Contrepartie : les autres joueurs sont affichés environ 50 à 100 ms plus dans le
passé, de façon régulière.

> e2e:motion
> node scripts/assemble.mjs && node scripts/e2e-browser-motion.mjs

Browser motion: 26 binary batches received by Alpha (max 234 B), Bravo decoded, no page error. a vérifié dans deux Chromium
réels que l'heure de capture arrive dans les lots. Le ressenti, en particulier
pilote et mitrailleur d'un même bombardier, reste à confirmer en partie.
