# Controls and pointer ownership

Keyboard letters use `KeyboardEvent.key`, with a physical-code fallback, so ZQSD
means the printed AZERTY letters. Key-up remembers the original physical-to-logical
mapping, including modifier changes while a key is held.

| Input                      | Flight action                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| Z / Up, S / Down           | Airplane pitch down / up while held; H2 pitch remains.                                   |
| Q / Left, D / Right        | Airplane roll left / right while held; ground movement remains.                          |
| A / E                      | Airplane rudder left / right while held.                                                 |
| Shift / Control            | Increase / decrease throttle.                                                            |
| C held + mouse             | Free camera look; mouse aim is unchanged.                                                |
| Left click                 | Machine guns; Space holds bomb release when equipped.                                    |
| Escape                     | Release cursor and neutralize control input/fire. Physics and current throttle continue. |
| Canvas click after release | Request capture and resume, without firing on that click.                                |

## Other contexts

| Context                | Input                          | Action                                   |
| ---------------------- | ------------------------------ | ---------------------------------------- |
| On foot                | ZQSD / arrows + mouse          | Third-person movement and camera         |
| On foot near equipment | E                              | Open the equipment dossier               |
| Any equipment seat     | F                              | Exit (grounded aircraft must be stopped) |
| Airborne character     | Space                          | Open / retract parachute                 |
| Alive                  | P                              | Open / close purchase menu               |
| Placement preview      | E (Enter alias) / Escape       | Confirm / cancel                         |
| DCA                    | [ / ], Shift / Ctrl held       | Step / continuous airburst distance      |
| On foot / purgatories  | Click / grounded Space         | Pistol / continuous cleaning jet         |
| Multi-seat vehicle     | Physical Digit1–Digit7 / panel | Contractual change or exchange           |
| Purgatory              | E                              | Open paperwork when physically eligible  |
| Paperwork              | Release valid ink stroke       | Submit and stamp automatically           |
| General                | H                              | Help                                     |

E only selects equipment on foot; in an airplane pilot seat A/E control the
rudder, not equipment interaction. Manual input overrides the mouse instructor
on its axis only (including gamepad); the remaining axes stay assisted, and
mouse assistance resumes on release. F is the exit key for aircraft pilots,
gunners and DCA occupants. Forms and text inputs
suspend gameplay shortcuts. Touch UI supplies contextual actions.

Captured mouse movement directly orbits the ground character camera. Touch drag
and gamepad controls remain available. Pointer lock is requested after joining,
when closing a panel, or by a canvas click. Browsers require user activation and
may reject a request after an asynchronous join/signature; a canvas click is the
recovery path. There is no automatic reacquisition after Escape or blur.

Forms/help release pointer ownership and clear held inputs. A late native lock
request is cancelled if paperwork opens before it completes. Closing paperwork
with Escape does not request capture. An explicit close or final signature may
resume capture; intermediate signatures retain the free cursor.

`control-focus.js` owns this lifecycle and the testable keyboard mapping. Flight
physics continues with neutral control surfaces while UI owns the pointer.
`test-controls.mjs` covers AZERTY mapping, throttle separation, airplane manual
overrides and client integration, suspended inputs, capture/release, and the
pending-capture/form race.

## Pistolet et postes

À pied, clic gauche, bouton tactile « Tir · pistolet » ou A/Croix :
un tir par appui, sans rechargement. Espace en chute conserve la commande de
parachute. Le pistolet est interdit dans les équipements, à tous les postes.
E / Y-Triangle ouvre le dossier au guichet ou près d’un équipement.
Touches physiques Digit1–Digit7 ou panneau « Postes » : même contrat pour changer de siège ou proposer un
échange. Espace au sol maintient un jet ; en chute, il garde le parachute. Le destinataire signe pour accepter ou utilise « Refuser l’échange ».
Les commandes de mêlée et de KO sont retirées.

Les formulaires proposent « Déchirer ce document ». Un document obligatoire est
remplacé, sans annuler les signatures précédentes ; une annexe refusée est écartée.
Certains contrats signés inversent les axes du poste ou le pilotage et la variation
des gaz jusqu’au départ. Voir [logistique et contrats](logistics-contracts.md).

## Nouveau lot Node : zoom et armes lourdes

Clic droit maintenu : zoom dans un poste avec pointeur capturé ; relâcher restaure
la vue. DCA : Shift maintenu augmente la fusée en continu, Ctrl maintenu la réduit
(de 30 cm à 3,60 m du bureau en environ 3 s), relâcher arrête aussitôt et les deux
touches ensemble s'annulent ; distance réelle affichée en direct.
`advanceFuse()` (`src/equipment-controls.js`) porte ce réglage, couvert par
`scripts/test-fuse-continuous.mjs`. Molette et [ ] gardent des pas de 25 m. Tank : Z/S ou flèches pour avancer/reculer, Q/D pour tourner ; Shift choisit
HE, Ctrl AP. Au tireur principal, clic gauche tire le canon et Espace la coaxiale. Les graduations
de la lunette vont de 15 cm à 9 m du bureau (l'autre bout de la pièce), échantillonnées sur la trajectoire réelle de l'obus choisi (HE/AP,
même intégration que le serveur) ; obus HE 13 s et AP 8 s de vol maximal. Aux pilotes,
clic gauche tire la MG et Espace maintenu largue les bombes disponibles toutes les
0,5 s. B est supprimé. Les autres mitrailleurs et DCA gardent clic/Espace pour tirer. E signe depuis
le cercle du poste approché ; la liste des postes n’est plus nécessaire à pied.
Les mutations à bord restent dans le menu des postes. Voir [référence du lot](vehicles-bank.md).

Le banquier s’ouvre avec **N** ou le bouton Banquier, depuis tous les postes et
mondes. Signer dans son cadre puis relâcher dépose le contrat ; remboursement
anticipé également signé. Échap ferme. La souris est libérée et les commandes
neutralisées pendant la consultation ; la partie continue. Les rails contextuels
s’ouvrent au réglage/événement et au survol/focus.

## Retours terrain

Au sol près d’un lit : E ouvre le contrat personnel ; E au lit actif propose la
résiliation signée. Après purgatoire, retour au lit valide ou au départ.
Au canon du tank : vue de lunette, **C maintenu** pour observer à la troisième
personne sans déplacer le canon ; les tirs sont suspendus jusqu’au relâchement.
Espace permet plusieurs cycles d’ouverture/fermeture du parachute ; une ouverture
tardive ne supprime pas la vitesse instantanément. Les dégâts dépendent de la
vitesse verticale à l’impact. Voir [retours terrain](field-update.md).

Le [lot lisibilité et nettoyage](clean-flight.md) détaille les bons signés, la pose par E,
les touches physiques, le jet et les nouvelles commandes du Spitfire.

## Aide contextuelle

`controlHintItems()` dans `src/live-hud.js` est la source unique de l’aide affichée
en bas à gauche (`#commandHelp`). `client.js` lui transmet le véhicule et le siège,
le type de poste fixe occupé (DCA, bunker LEGO, canon antichar), l’état à pied,
en chute ou au purgatoire, la disponibilité de la construction, la roue ouverte
et l’outil actif (avec son point d’ancrage). L’aide change donc à l’entrée, à la
sortie et au changement de poste. À pied : molette pour le zoom caméra, **G** ou
clic molette pour la roue de construction. Au Castor : conduite Z/S Q/D, clic
pour la mitrailleuse, **G**/clic molette, **V** vue tactique (prioritaire sur le
raccourci du conseil de vague pour le conducteur), **F** pour sortir. Les postes
fixes et véhicules terrestres n’affichent ni parachute ni « sauter ».
`scripts/test-control-hints.mjs` vérifie chaque rôle et chaque siège de `VEHICLES`.

## HUD et observation courants

Les informations de coque et munitions sont près du viseur ; l’aide de contexte
reste en bas à gauche, sans panneaux temporaires. Après mort, toute commande de
jeu est neutralisée ; cliquer « Accéder au purgatoire » pour créer son âme et
reprendre les contrôles. Même attente avant le super purgatoire. Le regard à
pied va presque à ±87°, sans retournement. Tous les véhicules achetés passent
par signature puis pose E ; annulation/reprise identique aux installations.
Voir [retours multijoueurs](multiplayer-return.md).

## Hélicoptère et DCA mobile

Hélicoptère, pilote : souris pour incliner, Maj/Ctrl pour monter/descendre, Z/S et Haut/Bas pour piquer/cabrer, Q/D et Gauche/Droite pour le roulis,
relâchement pour revenir progressivement au stationnaire. C maintenu pour le
regard libre (sans roquettes), clic maintenu pour les roquettes dans l’axe du H2.
Copilote : souris pour viser, Maj choisit la MG, Ctrl les missiles. Clic : tirer ;
second appui distinct : détoner le missile. Aucun changement d’arme pendant son vol.
Camion : conduite Z/S et Q/D au conducteur ; souris et clic au tireur, molette
pour la proximité (1,5 mm à 6 cm du bureau). 1/2 : mutations signées.
Les réserves, butées et unités sont détaillées dans [véhicules d’appui](support-vehicles.md).

Le [lot confort de jeu, version 37](comfort.md) précise réparation, zoom, jauges,
radar à pied, remise à zéro, fourmis et projectiles du pistolet courants.

Le [mapping pilote H2 actuel](issues-15-16-17.md#16--séparation-puissance-et-tangage-du-pilote-h2) retire les anciens alias O/W sans changer les armes du copilote.

## Réglages personnels des avions

Depuis une room, ouvrir **Pilotage** à côté de **Debug**. Tous les joueurs
peuvent configurer leurs propres avions, indépendamment des règles de la room.
Le bouton **Enregistrer et appliquer** applique immédiatement les préférences,
sauvegardées dans le `localStorage` du navigateur (`moucheron-flight-tuning:v1`).
Elles persistent entre rooms et rechargements sur le même profil navigateur,
sans compte ni synchronisation serveur. L’échec du stockage est signalé ; les
valeurs restent alors actives pour la session. **Valeurs par défaut** prépare la
réinitialisation, à confirmer avec le bouton d’enregistrement.

Les curseurs multiplient la sensibilité souris, les réponses de tangage,
roulis et lacet de l'instructeur, l'inclinaison automatique en virage et le
freinage de rotation. **Rattrapage final du viseur**, à **1,4 × par défaut**,
renforce progressivement les commandes quand l'écart au point visé se réduit,
sans téléporter l'avion ni toucher à sa physique. Régler à **1 ×** retrouve
le comportement de l'instructeur avant cette amélioration.
L’option d’inversion verticale ne touche que la visée souris en avion.

Ces réglages ne modifient **ni les commandes manuelles clavier/manette**,
ni le pilotage H2, les véhicules terrestres, les tourelles, les autres joueurs,
l’autorité du serveur ou l’équilibrage de la room. Le menu relâche le pointeur
et neutralise les commandes maintenues ; **Échap** le ferme sans recapture
automatique, tandis que le bouton fermer peut reprendre la capture. La partie
continue pendant l'ouverture du panneau.

Sources : `flight-tuning.js` (plages et stockage), `flight-tuning-ui.js`
(panneau), `mouse-flight.js` (instructeur) et
`test-flight-tuning.mjs` (régression). La sensation du pilotage reste à
valider dans une vraie partie WebGL/UDP.

## Conseil de vague

Ouvrez le bandeau **Vague** en haut de l’écran, ou appuyez sur **V** (sauf au
volant du Castor, où V bascule la vue tactique). La frise
regroupe les arrivées simultanées dans une même colonne. Les repères **S** (sol)
et **A** (air) et les silhouettes reprennent ceux des entrées dans le bureau.
Le trajet terrestre confirmé apparaît comme une piste de phéromones orange
semi-transparente bordée de sombre, parcourue de chevrons blancs qui glissent vers
la poubelle : c'est le chemin réellement marché tant que la carte ne change pas.
Pendant la pose d’une barricade ou d’un bunker, la piste claire à chevrons orange
montre le détour proposé avant le clic de validation. Les trajets aériens gardent
leurs nuages colorés par aération (`src/pheromone-trail.js`, version 239).

Choisissez une des trois cartes. Vous pouvez changer de voix tant que le vote
est ouvert. Une fois le plan débloqué, activez son niveau dans **Améliorations de l’équipe** :
le prix affiché est payé une fois par la caisse commune et le bonus s’applique à
tous les objets compatibles, présents et futurs ([progression](progression.md)).
**Replier** ou **Échap** permet de repartir construire. Les plans restent
accessibles pendant le combat. **Lancer la vague maintenant** est une action
séparée, disponible après le vote.

## Défenses terrestres

Après déblocage des cartes correspondantes, le conducteur du Castor peut poser un « Bunker LEGO » (10 $) et un « Canon lourd » (14 $). Descendez, approchez du poste et utilisez la commande d’interaction pour signer le dossier et occuper le siège ; utilisez la visée et le tir habituels, puis la même commande pour sortir. Les munitions se rechargent de manière payante à proximité d’une station ou du Castor.

Après déblocage de la carte correspondante, le conducteur du Castor peut choisir « Tourelle auto » dans la roue de construction et la poser d’un clic (9 $). La tourelle consomme ses 180 balles ; le service de recharge est payant et local.

Bouton « Défense » à pied ou au poste conducteur du Castor au sol, puis choix d’un outil : aperçu au point visé par la caméra
indépendamment de la marche, E ou clic gauche pour valider, R pour orienter le sucre ou le ventilateur, Échap
pour quitter. Prix, conditions et navigation : [gameplay](gameplay.md#défenses-terrestres).

Maintenir **G** ou le **clic molette** : orienter vers un secteur puis relâcher pour choisir, à pied ou au volant du Castor au sol. Les autres postes de véhicule ne peuvent pas construire. Clic gauche : fixer un début sans orientation, viser la fin (en marchant si nécessaire), puis cliquer à nouveau pour poser le mur ou le ruban. Le sucre, la réparation et la suppression demandent un seul clic.

Sur le [bombardier B3](b3-model.md), **4** demande le poste ventral avec signature ; **1 / 2 / 3** restent pilote, dorsal et queue.

G1 Castor : Z/S avancer/reculer, Q/D tourner, souris et clic gauche pour tirer avec la mitrailleuse légère, **V** bascule la caméra tactique surélevée. Le soutien à 50 cm est automatique et payant. Pendant la conduite, **G** ou le clic molette ouvre la roue de construction. Clic gauche démarre/arrête la dépose des murs LEGO et rubans : les briques apparaissent une à une derrière le camion (hauteur fixe de trois rangs), chaque section de 20 cm est validée par le serveur et l’arrêt conserve la section commencée. Facturation au prorata de la longueur réelle : 1 $ pour 20 cm, au centime près ; les autres pièges se posent au point visé. Échap interrompt la construction.

DCA fixe : le nombre d'obus restants (sur 120) est affiché près de l'état du
poste. Un clic gauche ou Espace déclenche un tir tant qu'il reste des munitions.
Rechargement automatique auprès d'une station ou d'un Castor à portée, depuis
la caisse commune ; aucun achat de munitions à distance.

Le pistolet possède **120 balles** par incarnation. Les munitions restantes sont
affichées à pied ; tirer à vide n'inflige pas de dégâts. Le rechargement automatique
payant nécessite de rejoindre une station ou le Castor. Au purgatoire, la réserve
reste finie et la sortie par les formulaires demeure disponible.

## Aperçu de pose

Les constructions montrent leur vrai modèle transparent avant confirmation, avec
un état rouge si la pose est refusée. Les véhicules font face au personnage ;
leur orientation est conservée par le serveur. La surface porteuse est vérifiée
avec l’emprise tournée du véhicule. Les constructions à pied et depuis le Castor
emploient les mêmes modèles que les objets posés.
