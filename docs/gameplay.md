# Gameplay

Vue d’ensemble des règles et du parcours joueur. Chaque section renvoie à la
référence détaillée de son sujet ; les touches sont dans [commandes](controls.md).
Valeurs par défaut de la room : `src/balance.js` ; catalogue et prix : `src/equipment.ts`.

## Principe

Jeu coopératif à la troisième personne : les joueurs d’une room défendent la
poubelle d’un bureau contre des vagues d’insectes, à pied, en avion, en hélicoptère,
en char ou depuis des installations. La partie vit en mémoire du serveur Node et
disparaît à son redémarrage. Les mouvements sont simulés par chaque client et
relayés par WebRTC/UDP (repli WebSocket) ; signatures, achats et impacts passent
par un canal fiable. Voir [réseau et corps partagés](walking-network.md),
[serveur UDP](udp-server.md) et [confiance envers les clients](trust-model.md).

Le décor est en mètres réels ; personnages, véhicules et distances de référence
sont multipliés par le ratio de carte (3/1000 au bureau : un personnage de 1,80 m
mesure 5,4 mm). Durées et vitesses angulaires ne sont pas mises à l’échelle. Voir
[unités et flotte](scale-fleet-weapons.md).

## Accueil et noms

L’accueil montre le titre **I am a moucheron**, les champs pseudo et code de room,
un sélecteur de **personnage** (huit modèles de `src/character-appearances.ts`,
mémorisés dans le navigateur et visibles par tous) et « Rejoindre la base ». Le
numéro de version, en haut à gauche, ouvre les [Nouveautés](changelog.md). Le
lien d’invitation est l’adresse avec `?room=`. Le [plan du bureau](office-layouts.md)
est choisi à la création de la room. Le son démarre à la première interaction.

Noms affichés en jeu (`src/fleet.ts`, `src/equipment.ts`, `src/ground-fortifications.ts`) :
**Chasseur biplan**, **Bombardier biplan**, **Chasseur léger**, **Bombardier moyen**,
**Stuka**, **Spitfire**, **Hélicoptère d’attaque au sol**, **Castor volant**,
**Char moyen**, **Castor**, **Anti-air mobile**, **Flak léger**, **DCA haute
cadence**, **Flak lourd**, **Canon anti-matériel**, **Tourelle auto** (et sa
variante Gatling). Les sigles internes (M1, B3, H2, T3, D2, G1, S6) ne s’affichent
pas en jeu.

## Parcours du joueur

1. **Arrivée à pied** près de la corbeille, sans arme, au bureau comme au
   purgatoire : marcher, sauter, ouvrir le parachute en chute
   ([corps partagés](walking-network.md), [chute](walking-network.md#saut-chute-et-parachute)).
2. **Monter dans un engin** : viser le poste (cockpit, trappe, tourelle) ou
   l’installation (DCA fixe, canon, lit), entouré de bleu signal s’il est libre,
   puis cliquer pour ouvrir son dossier de deux documents à signer
   ([viser le poste](ui-guidelines.md), [contrats](logistics-contracts.md)). La
   signature part au relâchement d’un trait valide ; le serveur attribue le siège.
   On peut monter dans un véhicule en mouvement s’il reste à portée.
3. **Changer de poste** à bord : touches 1–7 ou panneau des postes, par contrat
   (place libre) ou échange signé par les deux occupants. Quitter le cockpit ne
   crée aucun pilote automatique : un client continue la physique avec commandes
   neutres et derniers gaz.
4. **Sortir** (F) : à l’arrêt au sol, le joueur apparaît à la portière, contre la
   coque à hauteur de son siège (`doorOffset`, `EXIT_LIFT` dans `src/fleet.ts`,
   même fonction au client et au serveur). Si une personne ne peut pas y tenir debout
   (un écran, une lampe ou une boîte à la portière, ou le bord du bureau), il apparaît
   sur l’emplacement libre le plus proche, cherché autour de l’engin en partant de la
   portière, hors de la coque (`exitSpot`, `src/exit-spot.ts`, avec les requêtes du
   décor : surface plane dessous, place pour le corps dessus ; test sur le vrai bureau
   dans `test-exit-spot.mjs`). En mouvement ou en vol, à la position de l’engin avec sa
   vitesse, en chute libre.
5. **Acheter et poser** depuis l’atelier (P) ; emprunter au banquier (N).
6. **Mourir** : passage au purgatoire, file de Saint Pierre, trois papiers, puis
   retour au départ ou au lit choisi.

## Vagues

Avant chaque vague, le serveur annonce entrées, horaires et puissance des groupes.
Délai initial 60 s, pause entre vagues 180 s (`initialDelay`, `pause`). La fenêtre
**Vague** (bandeau ou Tab) montre la frise des arrivées (repères **S** sol et **A**
air), la piste de phéromones du trajet terrestre et les nuages colorés des couloirs
aériens (`src/pheromone-trail.ts`) ; **Lancer la vague maintenant** est ouvert à
tous pendant la préparation. Il n’y a ni vote ni plan à débloquer.

Le budget d’une vague, en **puissance**, vaut `32 × 1,5^(n−1) × N^0,9` pour `N`
joueurs (`directorBudget`, `server/wave-preparation.js`), sans plafond : toute
espèce dont la puissance tient dans le budget peut être appelée. La poubelle a
20 PV ; chaque arrivée ennemie augmente l’infestation et la partie est perdue à 20.
Voir [progression](progression.md), [puissance des ennemis](progression.md#unité-commune),
[bestiaire](enemy-bestiary.md) et [visibilité](enemy-bestiary.md#lisibilité-et-retours-visuels).

Les volants partent de quatre aérations par deux couloirs à altitudes différentes,
sous le plafond de nuages du bureau (`src/routes.ts`). Les terrestres sortent de
trous et marchent vers la poubelle (voir [navigation terrestre](#navigation-terrestre)).

## Engins

Le chasseur biplan, le bombardier biplan (pilote et mitrailleur dorsal) et le char
moyen sont gratuits : chaque type garde un exemplaire de réserve prêt et un
successeur apparaît dès que la réserve est utilisée ou détruite. Les autres engins
s’achètent et leur destruction est définitive. Sièges exclusifs.

| Engin                        | Prix | Particularités                                         |
| ---------------------------- | ---: | ------------------------------------------------------ |
| Chasseur / bombardier biplan |  5 $ | exemplaires supplémentaires ; 30 bombes au bombardier  |
| Char moyen                   |  5 $ | pilote/MG avant, canon HE/AP + coaxiale, MG supérieure |
| Chasseur léger               | 15 $ | monoplace, deux MG de nez                              |
| Bombardier moyen             | 15 $ | pilote et trois mitrailleurs, 50 bombes                |
| Castor                       | 15 $ | camion monoplace, MG, soutien 50 cm, construction      |
| Anti-air mobile              | 15 $ | conducteur et canon à fusée de proximité               |
| Stuka                        | 25 $ | 6 bombes, sirène de piqué                              |
| Castor volant                | 35 $ | pilote et trois passagers, largages, soutien 50 cm     |
| Hélicoptère d’attaque au sol | 50 $ | pilote (roquettes) et copilote (MG, missile guidé)     |
| Spitfire                     | 75 $ | six MG, 1 000 balles, vitesse +75 %, rotation +45 %    |

Les avions ont cinq minutes de carburant à plein gaz (`FUEL_SECONDS`) et des
munitions limitées ; ils roulent, décollent dès `LIFTOFF_SPEED` (`src/flight.ts`)
et se posent si vitesse, descente et attitude le permettent. Détails :
[pilotage et véhicules](scale-fleet-weapons.md), [hélicoptère et DCA mobile](support-vehicles.md),
[commandes du H2](support-vehicles.md#h2--pilotage), [biplans](models.md),
[physique au sol](physics-engine.md), [physique de l’avion](plane-physics.md).

## Achats et pose

L’atelier (P) range ses cartes en trois colonnes, Aéronefs, Véhicules au sol et
Installations, du moins cher au plus cher (`src/shop-catalog.ts`, colonne
« Autres » pour un article non classé). Chaque carte affiche une vignette rendue
depuis le vrai modèle (`src/shop-thumbs.js`), le nom et le prix. Un clic ouvre le
bon de commande ; signé, il est payé par la caisse commune puis ouvre l’aperçu de
pose. Lit 15 $, radar 10 $, station 20 $, Flak léger 5 $ (plafonné à 40 $) coûtent
2 $ de plus par exemplaire posé ou payé (`shopPrice`) ; DCA haute cadence 50 $,
Flak lourd 30 $. Règles des bons, remboursements et pose : [économie](economy.md).

L’aperçu montre le vrai modèle transparent, rouge si la pose est refusée ; seul le
navigateur juge support, hauteur libre, proximité et chevauchements, le serveur
fait confiance au joueur ([confiance](trust-model.md)). Une visée
hors de portée place l’aperçu à 97 % de la portée sur la première surface sous la
caméra (`reachClampedPlacement`, `src/placement-aim.ts` ;
`PLACEMENT_PREVIEW_FRACTION`) : un clic pose ce que l’aperçu montre. Les véhicules font face au personnage. Un
achat commandé depuis un appareil descend dans un colis sous parachute à 1/3 m/s
(`DELIVERY_SPEED`) ([colis parachutés](logistics-contracts.md)).

## Service, radar et stations

Les stations de ravitaillement, le Castor et le Castor volant servent tout ce qui
est dans leur sphère de 50 cm (`SERVICE_RADIUS`), même en mouvement ou en vol :
PV (10 % par seconde), carburant, munitions, DCA fixes, tourelles, canons et murs
LEGO. Le
service est payé au prorata par la caisse commune et partagé équitablement
quand l’argent manque (`src/paid-service.ts`). La station « Ravitaillement Alpha »
est offerte au départ ; son service reste payant.
Sans radar, la carte ne montre aucun ennemi ; chaque radar révèle un cylindre de
2 m de rayon. Voir [logistique](logistics-contracts.md).

## Combat

Les projectiles subissent gravité et traînée ; le tir allié blesse. Les joueurs
ont 100 PV, restaurés à chaque retour. Un insecte touché projette une gerbe de
gouttes rouges (`src/blood-effects.ts`, 240 particules au plus), tué il tombe et
s’estompe. Un avion endommagé fume dès 15 % de dégâts (`src/engine-smoke.ts`) sans
perdre en pilotage. Une coque qui percute un insecte perd 5 % des PV restants de
celui-ci, une fois par contact (`src/vehicle-care.ts`). Voir
[combat et mondes](combat-worlds.md), [armement](scale-fleet-weapons.md),
[projectiles](projectiles.md) et [collisions](collisions.md).

## Argent et banque

Aucune prime de vague : un insecte abattu au bureau ne rapporte rien ; son âme,
acceptée par Saint Pierre ou tuée au purgatoire, rapporte une fois sa puissance en
dollars communs (`releaseSoul`, `server/game.js`), avec une sonnerie chez tous les
joueurs. Tuer un joueur ne rapporte jamais. Le banquier (N, ou bouton) propose sur
un prospectus trois prêts partagés, à taux fixe par vague, prélevés à chaque fin de
vague, sans remboursement anticipé ([banque](bank.md)). La remise à zéro
efface monnaie, prêts, installations, véhicules et vagues ; aucune progression ne
survit à une partie.

## Mort et purgatoire

Mourir lance un passage automatique : le fantôme monte, fondu au noir, puis l’âme
apparaît dans le ciel de Saint Pierre ([ciel du purgatoire](purgatory-sky.md)). Le
service au guichet suit la file physique des âmes, joueurs et insectes ; un
**coupe-file** payé au vigile (numéro de la vague en dollars) ouvre la file VIP
([file du purgatoire](purgatory-queue.md), [décor](purgatory-scene.md)). Les trois
papiers signés renvoient au départ, ou au lit dont on a signé le contrat personnel
en le visant ; un lit absent ou impraticable renvoie au départ. Dans le ciel, ni
banque, ni atelier, ni construction.

## Défenses terrestres

À pied au sol du bureau ou au volant du Castor, maintenir **G** (ou le clic molette)
ouvre la roue de construction (`src/ground-defense-ui.js`) : barricade, sucre,
ruban, réparer, enlever, tourelle auto, canon anti-matériel. L’aperçu suit le point
visé par la caméra ; une paroi ou un point hors de portée refuse la pose.

| Construction        | Prix                    | Règle                                                                       |
| ------------------- | ----------------------- | --------------------------------------------------------------------------- |
| Barricade (LEGO)    | 0,25 $ / 48 mm, prorata | deux rangées de briques, sections réparables (`src/brick-rules.ts`)         |
| Ruban               | 1 $ / 20 cm             | colle les terrestres                                                        |
| Sucre               | 3 $                     | détourne les terrestres entrés dans son rayon ; R l’oriente                 |
| Tourelle auto       | 5 $                     | 180 balles, tir serveur ; améliorable en [Gatling](gatling-turret.md)       |
| Canon anti-matériel | 14 $                    | poste signé, 50 obus, élévation −5° à +40° (`src/ground-fortifications.ts`) |
| Réparer / enlever   | 1 $ / gratuit           | sur la construction visée                                                   |

Barricade et ruban se posent en deux clics (début, puis fin) ; au Castor, un clic
démarre la dépose continue derrière le camion et un second l’arrête, la section
commencée étant facturée au prorata. Le serveur revalide position, caisse et
occupation avant paiement (`src/ground-defense-state.ts`). Les murs LEGO
endommagés sont réparés dans les zones de service (10 % des PV par seconde, 1 $
par 100 PV). Les défenses sont partagées par room. Une construction posée sur un
meuble garde sa hauteur et tire depuis là, mais ne gêne pas les insectes au sol.
Tourelles et canons se rechargent seulement aux zones de service, contre paiement.

### Navigation terrestre

Le serveur simule chaque insecte terrestre. Une grille de 5 cm (`GROUND_CELL`,
`buildGroundFlow` dans `src/ground-defense.ts`) bloque mobilier au sol et
barricades ; elle est reconstruite à chaque changement de `navigationRevision`.
L’insecte vise le point le plus lointain encore visible en ligne droite sur la
descente du champ ; `smoothRoute` enchaîne les mêmes points pour la piste de la
fenêtre de vague, et la route nominale (`enemyRoute`, `src/routes.ts`) en déduit
la durée du trajet. Un brouillon de barricade montre le détour ; sans chemin,
l’aperçu affiche « Passage fermé » et cafards, araignées et rats attaquent la
barricade la plus proche.

`src/ground-crowd.js` sépare les individus par sous-pas de 50 ms au plus : espace
personnel souple proportionnel à la taille, ralentissement derrière un voisin,
contournement, sans pousser à travers mobilier ou défenses ; la vitesse reste
celle du [bestiaire](enemy-bestiary.md). Sucre et ruban gardent leurs pauses.

## Castor et Castor volant

**Castor** : camion à six roues sur [physique Rapier](physics-engine.md), MG légère,
soutien 50 cm. **V** bascule la vue de dessus (`src/castor-top-view.ts`) : nord en
haut, viseur au sol à la souris pour construire et tirer, molette pour la hauteur.
Les roues suivent la vitesse du sol de leur côté (`src/castor-wheels.ts`). Modèle :
[flotte Meshy](models.md#castor-volant), briques : [pipeline d’assets](asset-pipeline.md).

**Castor volant** : hélicoptère logistique à rotors en tandem, sans arme, 200 PV,
pilotage de l’hélicoptère d’attaque ([physique](heli-physics.md)). Tous les occupants
ouvrent la roue et **larguent** sucre, ruban (10 cm, `AIRDROP_TAPE`), tourelle ou
canon, à la verticale de l’appareil et selon son cap (`AIRDROP_KINDS`,
`src/airdrop.ts`) ; l’objet tombe à 1/3 m/s et se construit sur la première surface
rencontrée, prix remboursé si la place a été prise. **V** donne à chaque occupant la
vue verticale du point de largage.

## Mode debug

Le bouton **Debug : OFF / ON** est commun à la room : argent illimité, aucun dégât
de chute, défaite impossible, hitbox et volumes de collision visibles, ennemis à
poser depuis l’atelier pendant une vague. Le désactiver remet la partie à zéro.
Voir [mode debug](laboratory.md).

## Présentation

Modèles Three.js procéduraux et [modèles Meshy](asset-pipeline.md) embarqués ; sons
synthétisés et spatialisés ([audio](audio.md)). HUD : une barre en haut (vague,
ennemis, infestation, argent, atelier, banquier, connexion, Pilotage, Debug), les
informations de poste près du viseur et l’aide contextuelle en bas à gauche
([règles d’interface](ui-guidelines.md), [aide contextuelle](controls.md#aide-contextuelle)).

## Vérifier

`npm test -- <fragment>` pour : `test-shop-catalog`, `test-ground-paths`,
`test-ground-crowd`, `test-ground-spread`, `test-castor-wheels`, `test-castor-trail`,
`test-takeoff`, `test-boarding`, `test-seat-posts`, `test-clean-flight`,
`test-multiplayer-return`, `test-comfort`, `test-field-backlog`, `test-udp-native`.
Le ressenti (pilotage, lisibilité, confort de pose) demande une vraie partie WebGL/UDP.
