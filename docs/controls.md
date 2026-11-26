# Commandes et prise du pointeur

Le jeu se joue au clavier et à la souris, sur ordinateur : pas de mode tactile ni de
manette, aucune commande affichée à l’écran. La souris est toujours capturée par
Pointer Lock, quel que soit le pointeur principal du navigateur. Les règles de jeu
derrière chaque commande sont dans [gameplay](gameplay.md).

Sources : `src/client.js` (gestionnaires clavier et souris), `src/control-focus.ts`
(capture, `gameKey`, `flightInput`, `airplaneSteering`, `lookScale`,
`equipmentExitAction`), `src/equipment-controls.ts` (fusée de la DCA fixe, zoom
maintenu), `src/live-hud.ts` (aide contextuelle).

## Un verbe par entrée

Chaque entrée garde un seul sens ; le contexte change seulement ce sur quoi elle agit.

| Entrée              | Verbe                        | Exemples                                                                                                         |
| ------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| ZQSD / flèches      | Déplacer, diriger            | marcher, conduire, tangage et roulis                                                                             |
| Souris              | Regarder, viser              | caméra, tourelle, cap visé par l’instructeur de vol                                                              |
| Clic gauche         | Action principale            | arme principale ; à pied ou en âme, utiliser ce qui est entouré de bleu (poste, lit, vigile, porte-bloc) ; poser |
| Clic droit maintenu | Zoom                         | postes et véhicules ; pendant une pose, conserver l’achat (comme Échap)                                          |
| Espace              | Action secondaire            | sauter ou parachute à pied ; bombes (pilotes), coaxiale (canonnier du char), missile guidé (copilote du H2)      |
| Maj / Ctrl          | Plus / moins                 | gaz, montée / descente, fusée de la DCA fixe                                                                     |
| R                   | Changer, tourner             | obus HE ↔ AP du char ; tourner sucre, tourelle ou canon avant la pose                                            |
| A / E               | Lacet                        | gouverne de direction ; rotation du Castor volant en vue verticale                                               |
| F                   | Sortir                       | quitter tout siège ou poste ; sauter en vol                                                                      |
| C maintenu          | Regard libre                 | avion, pilote du H2, canonnier du char                                                                           |
| V                   | Changer de vue               | vue de dessus du Castor, vue verticale du Castor volant                                                          |
| Tab                 | Fenêtre de vague             | partout, quand le bandeau de vague est affiché                                                                   |
| 1–7                 | Changer de poste             | contrat ou échange signé                                                                                         |
| G / clic molette    | Roue de construction         | à pied, conducteur du Castor, occupants du Castor volant                                                         |
| Molette             | Régler                       | distance de caméra, gaz, fusée, hauteur des vues verticales                                                      |
| P / N               | Atelier / banquier           | P hors purgatoire et ciel ; N depuis tous les postes, sauf dans le ciel                                          |
| Échap               | Libérer le curseur et fermer | ferme le menu ouvert, annule la pose et l’outil de construction                                                  |

Les lettres utilisent `KeyboardEvent.key`, avec repli sur le code physique
(`gameKey`) : ZQSD désigne les lettres imprimées d’un clavier AZERTY.
Le relâchement retrouve la touche logique enregistrée à l’appui, même si un
modificateur a changé entre-temps. Les chiffres utilisent les touches physiques
`Digit1`–`Digit7`, sans Maj. Champs de saisie, formulaires, Alt et Méta suspendent
les raccourcis. Il n’existe pas de touche d’interaction : E n’est que le lacet.

## Par contexte

| Contexte                    | Commandes                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| À pied (bureau, purgatoire) | ZQSD + souris ; Espace au sol : saut ; Espace en chute : ouvrir / replier le parachute ; molette : distance de caméra ; clic : poste visé                                       |
| Avion, pilote               | souris : cap ; Z/S tangage, Q/D roulis, A/E lacet ; Maj/Ctrl ou molette : gaz ; clic : MG (sauf bombardiers) ; Espace maintenu : bombes                                         |
| Avion, mitrailleur          | souris : tourelle ; clic : MG                                                                                                                                                   |
| Hélicoptère, pilote         | souris : inclinaison ; Z/S tangage, Q/D roulis ; Maj monter, Ctrl descendre ; relâcher : retour au stationnaire ; clic maintenu : roquettes ; C : regard libre (sans roquettes) |
| Hélicoptère, copilote       | souris : viser ; clic : MG ; Espace : missile guidé, second appui : détonation ; MG et missile ensemble                                                                         |
| Castor volant, pilote       | comme le pilote d’hélicoptère ; V : vue verticale, pilotage au clavier seul, A/E pour tourner ; G : larguer                                                                     |
| Castor volant, passager     | souris : regarder ; V : vue verticale ; G puis clic : larguer                                                                                                                   |
| Char, pilote                | Z/S avancer / reculer, Q/D tourner ; souris : MG avant dans un cône de ±15° (`HULL_GUN_CONE`) ; clic : MG                                                                       |
| Char, canonnier             | souris : tourelle ; clic : canon ; Espace : coaxiale ; R : HE ↔ AP ; C maintenu : observer à la troisième personne, armes suspendues                                            |
| Char, tireur supérieur      | souris : tourelle ; clic : MG                                                                                                                                                   |
| Castor                      | Z/S, Q/D ; souris + clic : MG ; V : vue de dessus (viseur au sol, molette : hauteur) ; G : construire                                                                           |
| Anti-air mobile             | conducteur : Z/S, Q/D ; canonnier : souris, clic : obus, molette : fusée de proximité 0,5–20 m (`MOBILE_FUSE`)                                                                  |
| Flak léger                  | clic : obus ; Maj/Ctrl maintenus : fusée en continu ; [ ] ou molette : pas de 25 m (`FLAK.step`)                                                                                |
| DCA haute cadence           | clic : balles                                                                                                                                                                   |
| Flak lourd                  | clic : obus ; molette : proximité                                                                                                                                               |
| Canon anti-matériel         | souris : pointage ; clic : obus                                                                                                                                                 |
| Atelier, pose d’un achat    | clic gauche : poser ; clic droit ou Échap : conserver l’achat payé pour plus tard                                                                                               |
| Outil de construction       | clic : poser, ou fixer début puis fin (barricade, ruban) ; R : tourner de 45° ; G : changer d’outil ; Échap : quitter                                                           |
| Purgatoire                  | clic sur le porte-bloc du guichet, le vigile ou un appareil posé ; Espace : saut                                                                                                |
| Papiers                     | relâcher un trait d’encre valide : signature et tampon automatiques                                                                                                             |

Sur tous les postes : clic droit maintenu pour zoomer, F pour sortir, 1–7 pour
changer de poste quand l’engin en a plusieurs. Au pilote d’avion, une commande
manuelle remplace l’instructeur souris sur son seul axe (`airplaneSteering`) ;
les autres axes restent assistés et l’assistance reprend au relâchement. Les
commandes du H2 sont détaillées dans [commandes du H2](support-vehicles.md#h2--pilotage).

Flak léger : Maj maintenu allonge la fusée, Ctrl la raccourcit, de 100 à 1 200 m
de référence (30 cm à 3,60 m du bureau) en environ 3 s ; relâcher arrête aussitôt
et les deux touches ensemble s’annulent (`advanceFuse`, `FUSE_RATE`).

Lunette du canonnier du char : graduations `TANK_MARKS` de 15 cm à 9 m du bureau,
calculées par `ballisticMarks` (`src/tank-reticle.ts`) avec la même intégration
que le serveur pour l’obus choisi ; C les masque.

## Souris, zoom et caméras

Les boutons souris passent par `mousedown` / `mouseup`, qui signalent chaque
bouton séparément : clic gauche et clic droit se combinent et se relâchent
indépendamment. Le zoom maintenu (`HoldZoom`) passe le champ de vision de 62° à
28° ; la sensibilité suit le champ de vision (`lookScale`) pour qu’un cran de
souris déplace l’image du même nombre de pixels, zoomé ou non.

À pied, la caméra pivote à `SHOULDER_HEIGHT` au-dessus des pieds, regard limité à
±1,52 rad ; la molette règle la distance (`GROUND_VIEW_DISTANCE`, au plus près par
défaut ; `src/personal-aim.ts`). Les caméras de poursuite (à pied, véhicules,
passagers du Castor volant) ne finissent jamais derrière un solide : un rayon du
point suivi vers l’œil voulu ramène l’œil avant le premier obstacle, puis il
s’éloigne en douceur quand la voie est libre (`src/camera-clearance.ts`). Les vues
de tireur et les vues verticales ne sont pas concernées.

## Prise du pointeur

La capture est demandée après l’arrivée en jeu, à la fermeture d’un panneau ou par
un clic sur le canevas (ce clic ne tire pas). Le navigateur exige un geste de
l’utilisateur et peut refuser une demande arrivée après une signature asynchrone :
le clic sur le canevas sert alors de reprise. Aucune reprise automatique après
Échap ou une perte de focus.

Échap, un menu ou un formulaire libèrent le pointeur et effacent les commandes
maintenues ; la physique continue avec gouvernes neutres et gaz courants. Une
demande de capture encore en attente est annulée si des papiers s’ouvrent. Fermer
des papiers avec Échap ne recapture pas ; une fermeture explicite ou la signature
finale d’un dossier recapture, les signatures intermédiaires laissent le curseur
libre. `ControlFocus` (`src/control-focus.ts`) porte ce cycle.

## Aide contextuelle

`controlHintItems()` (`src/live-hud.ts`) est la source unique de l’aide affichée en
bas à gauche (`#commandHelp`). `client.js` lui transmet véhicule et siège, poste
fixe occupé, état à pied, en chute, en observation ou dans le ciel, disponibilité
de la construction, roue ouverte et outil actif. Chaque contexte ne liste que les
entrées réellement routées ; postes fixes et véhicules terrestres n’affichent ni
parachute ni saut.

## Réglages personnels des avions

Le bouton **Pilotage**, à côté de **Debug**, ouvre les réglages propres au joueur
(`src/flight-tuning-ui.ts`) : sensibilité de la souris, réactivité en tangage,
roulis et lacet de l’instructeur, inclinaison automatique en virage, freinage de
rotation, **rattrapage final du viseur** (1,4 × par défaut ; 1 × le désactive) et
inversion verticale de la souris en avion. **Enregistrer et appliquer** les applique
et les garde dans le `localStorage` (`moucheron-flight-tuning:v1`,
`src/flight-tuning.ts`), par profil de navigateur ; un échec de stockage est
signalé et les valeurs restent actives pour la session. **Valeurs par défaut**
prépare la réinitialisation, à confirmer par l’enregistrement.

Ces réglages ne touchent ni les commandes clavier, ni le H2, les véhicules
terrestres, les tourelles, les autres joueurs ou les règles de la room. Le panneau
libère le pointeur ; Échap le ferme sans recapture, le bouton fermer recapture. La
partie continue pendant son ouverture. L’instructeur est dans `src/mouse-flight.ts`.

## Vérifier

`npm test -- controls` (`test-controls.mjs` : AZERTY, gaz, priorités manuelles,
sortie F, un verbe par entrée, `lookScale`), `test-pointer-capture`,
`test-control-hints` (chaque rôle et siège de `VEHICLES`), `test-fuse-continuous`,
`test-camera-clearance`, `test-flight-tuning`, `test-flight`, `test-mouse-flight`,
`test-heli-controls`. Le confort réel (Pointer Lock, sensations) se juge en partie
WebGL.
