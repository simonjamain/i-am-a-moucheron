# Commandes et poussée du H2

## Commandes actuelles — issue #16

Pilote : Maj/Ctrl pour monter/descendre ; Z/S et Haut/Bas pour piquer/cabrer ;
Q/D et Gauche/Droite pour le roulis. O/W ne sont plus des alias du pilote H2.
Le copilote garde Maj/Ctrl pour ses armes. Mapping, vitesses et vérifications :
[issues 15–17](issues-15-16-17.md#16--séparation-puissance-et-tangage-du-pilote-h2).

## Historique — version 39

Correctif demandé le 30 octobre 2026, sources Node/RAM/UDP.

## Attendu et défauts constatés

Le pilote commande une poussée verticale momentanée : **Z, O ou flèche haut**
pour monter, **S ou flèche bas** pour descendre. Relâcher ramène progressivement
au stationnaire assisté. W reste un alias compatible. Plusieurs touches de montée
ne cumulent pas la force ; monter et descendre simultanément donnent le neutre.
Le mouvement dépend du pointeur capturé et s'interrompt dans les menus ou à la
perte de focus. Sans carburant, la gravité reprend ; aucun stationnaire gratuit.

Avant ce correctif, O n'était pas lu par la branche de physique du client. Le test
`node scripts/test-heli-controls.mjs` échouait sur « O must actually climb through
the shipped client physics branch ». Z/Haut/S/Bas atteignaient déjà l'intégrateur
dans un contexte isolé, mais sa poussée progressive était stockée sur le snapshot
remplaçable : une réponse retardée pouvait la ramener en arrière. Enfin, la jauge
`gas` valait simplement 100 % en vol et 0 % posé, sans refléter montée/descente.
Cela ne prouve pas toutes les causes possibles sur chaque poste utilisateur ;
les contrôles reproduisent ces trois défauts précis, sans prétendre à un essai WAN.

## Comportement livré

`heliCollective` conserve l'état de l'intégrateur du pilote local entre les
réponses réseau. Il est initialisé lors d'une prise de poste et transmis par les
mouvements ; les autres clients et postes lisent l'état partagé. Relâchement,
menu ou perte de focus demandent zéro à l'assistance, avec freinage vertical
progressif plutôt qu'un arrêt instantané ou une téléportation d'altitude.

La jauge Gaz affiche désormais `(collectif + 1) / 2` lorsque le moteur est alimenté :
**50 % au stationnaire**, progression vers 100 % en montée, vers 0 % en descente.
Moteur non alimenté : 0 %. C'est la commande du modèle assisté de jeu, pas une
mesure physique de puissance d'un moteur réel. Le carburant conserve sa règle de
300 secondes en vol, indépendante du collectif. Les PV, vitesses et l'échelle
ne sont pas modifiés. L'aide permanente donne les touches courantes.

Les roquettes du pilote partent dans l'axe avant local −Z transformé par le
quaternion de l'hélicoptère, aux deux lanceurs alternés. Côté serveur cette règle
existait déjà ; côté client `weaponDirection()` utilise maintenant explicitement
le même axe pour le pilote H2, au lieu de la visée générique de tourelle. La caméra
ne dirige donc pas les roquettes. L'héritage de vitesse du véhicule, la cadence,
les stocks et les explosions restent ceux des [véhicules d'appui](support-vehicles.md).
Le regard libre C garde sa suspension de tir ; la MG et le missile du copilote
conservent leur propre visée et leurs autorisations.

## Vérifications et limites

Le test exécute la vraie branche `physics()` du client : Z/O équivalents,
alias Haut/W, S/Bas, montée puis retour au stationnaire, jauge progressive,
menus/perte de focus et injection de snapshots à collectif ancien. Il vérifie
également la direction réellement envoyée par le client et les roquettes créées
par le serveur sous plusieurs angles de tangage/lacet/roulis, avec direction de
regard contradictoire. Les stocks et la vitesse relative des roquettes sont contrôlés.
La suite complète conserve les deux pairs UDP natifs, contrats, postes et armes.

Rendu WebGL, Pointer Lock physique et confort de pilotage restent à observer sur
la VM : le navigateur de contrôle ne joint pas UDP. HEL-06/DCM-03 gardent leurs
validations humaines en cours. Livraison ZIP, serveur à redémarrer et navigateurs
à recharger ; aucune publication incompatible sur le Worker historique.

## Pilotage étendu et tourelle — version 45

La souris peut demander jusqu’à 85° de tangage ; le virage peut incliner le H2
jusqu’à 85° de roulis. Le pilote gère ces fortes inclinaisons. La descente
commandée atteint progressivement 30 m/s de référence, contre 8 auparavant ;
la montée reste à 8 m/s et le relâchement freine vers le stationnaire. Les chocs
verticaux à plus de 8 m/s restent destructeurs : anticiper le freinage.

Le copilote dispose d’un tour complet sous la cabine. Sa tourelle se déplace
au plus à π rad/s (180° en une seconde), avec budget commun au lacet et au
tangage, chemin court au passage de ±180° et limites verticales conservées.
La caméra, les tirs et le guidage suivent la position réelle de la tourelle.
`test-heli-handling.mjs` contrôle inclinaison, descente, freinage, tour complet,
franchissement de l’arrière et limite de vitesse à 30/60/144 Hz. Le confort
WebGL et le pilotage à deux restent à essayer par les joueurs.

## Roulis pilote au clavier — issue #9, version 49

Q/flèche gauche forcent le roulis à gauche, D/flèche droite à droite, jusqu’à
85°, même avec une souris immobile. Les alias simultanés ne cumulent pas leur
effet ; les directions opposées se neutralisent. Le roulis clavier prend la
priorité sur l’inclinaison latérale demandée par la souris pendant l’appui.
La montée/descente et la direction souris restent disponibles.

Au relâchement, l’assistance retrouve la consigne souris (ou revient à plat sans
consigne active). Menu et perte de focus neutralisent l’entrée ; l’inclinaison
physique se stabilise progressivement, sans rotation résiduelle commandée.
Seul le pilote commande la coque ; le quaternion existant partage ce mouvement
avec les occupants et observateurs. Les tests exécutent la vraie branche client
pour les quatre touches, le relâchement/focus et le refus depuis le copilote.
Le ressenti et la visualisation à deux restent à essayer en partie.

## Pointage relatif sans rattrapage — issue #10, version 50

Au poste copilote H2 seulement, chaque mise à jour consomme le déplacement de
souris reçu depuis la précédente. Le budget commun lacet/tangage reste π rad/s
(180°/s) : l’excédent est abandonné, sans cible persistante à poursuivre. Une
souris immobile arrête donc la commande dès la prochaine mise à jour. La reprise
et l’inversion partent de l’orientation réelle, y compris au passage de ±180°.
Une commande très ample conserve le sens demandé, sans détour par le chemin
court d’une ancienne cible absolue.

Menus et perte de focus abandonnent le déplacement en attente. Un changement de
poste initialise les deux orientations ensemble. La manette reste une commande
continue bornée ; les autres armes conservent leur visée actuelle. Rotation 360°,
butées verticales, caméra/canon/tirs alignés et guidage missile sont conservés.
La régression automatique couvre les cadences 30/60/144 Hz, arrêt/reprise et
inversion après grande impulsion ; le ressenti en partie reste à essayer.
