# Controls and pointer ownership

Keyboard letters use `KeyboardEvent.key`, with a physical-code fallback, so ZQSD
means the printed AZERTY letters. Key-up remembers the original physical-to-logical
mapping, including modifier changes while a key is held.

| Input                      | Flight action                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| Z / Up, S / Down           | Force pitch, overriding mouse assistance on that axis.                                   |
| Q / Left, D / Right        | Force roll, overriding mouse assistance on that axis.                                    |
| A / E                      | Rudder.                                                                                  |
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
| DCA                    | [ / ]                          | Decrease / increase airburst distance    |
| On foot / purgatories  | Click / grounded Space         | Pistol / continuous cleaning jet         |
| Multi-seat vehicle     | Physical Digit1–Digit7 / panel | Contractual change or exchange           |
| Purgatory              | E                              | Open paperwork when physically eligible  |
| Paperwork              | Release valid ink stroke       | Submit and stamp automatically           |
| General                | H                              | Help                                     |

E only selects equipment on foot; A/E remain rudder controls in flight. F is the
exit key for aircraft pilots, gunners and DCA occupants. Forms and text inputs
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
`test-controls.mjs` covers AZERTY mapping, throttle separation, suspended inputs,
capture/release, and the pending-capture/form race.

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
la vue. DCA : Shift augmente la fusée, Ctrl la réduit, avec affichage en mètres
réels. Tank : Z/S ou flèches pour avancer/reculer, Q/D pour tourner ; Shift choisit
HE, Ctrl AP. Au tireur principal, clic gauche tire le canon et Espace la coaxiale. Aux pilotes,
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

## HUD et observation courants

Les informations de coque et munitions sont près du viseur ; l’aide de contexte
reste en bas à gauche, sans panneaux temporaires. Après mort, toute commande de
jeu est neutralisée ; cliquer « Accéder au purgatoire » pour créer son âme et
reprendre les contrôles. Même attente avant le super purgatoire. Le regard à
pied va presque à ±87°, sans retournement. Tous les véhicules achetés passent
par signature puis pose E ; annulation/reprise identique aux installations.
Voir [retours multijoueurs](multiplayer-return.md).

## Hélicoptère et DCA mobile

Hélicoptère, pilote : souris pour incliner, Z/Haut et S/Bas pour la poussée,
C maintenu pour le regard libre (sans roquettes), clic maintenu pour les roquettes.
Copilote : souris pour viser, Maj choisit la MG, Ctrl les missiles. Clic : tirer ;
second appui distinct : détoner le missile. Aucun changement d’arme pendant son vol.
Camion : conduite Z/S et Q/D au conducteur ; souris et clic au tireur, molette
pour la proximité en mètres de référence. 1/2 : mutations signées.
Les réserves, butées et unités sont détaillées dans [véhicules d’appui](support-vehicles.md).

Le [lot confort de jeu, version 37](comfort.md) précise réparation, zoom, jauges,
radar à pied, remise à zéro, fourmis et projectiles du pistolet courants.
