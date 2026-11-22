# Commandes et poussée du H2

Pilotage assisté de l'hélicoptère d'attaque (H2), partagé par le Castor volant.
Constantes : `HELI` dans `src/helicopter.js`. Armes, stocks et unités :
[véhicules de soutien](support-vehicles.md).

## Mapping pilote H2

| Touches              | Commande        |
| -------------------- | --------------- |
| Maj gauche ou droite | Monter          |
| Ctrl gauche ou droit | Descendre       |
| Z ou flèche Haut     | Piquer          |
| S ou flèche Bas      | Cabrer          |
| Q ou flèche Gauche   | Roulis à gauche |
| D ou flèche Droite   | Roulis à droite |

La souris commande le cap et l'inclinaison ; une touche de tangage ou de roulis prime
sur son axe pendant l'appui, la souris garde les axes non forcés, les alias
simultanés ne cumulent pas et les directions opposées se neutralisent. Tangage et
roulis partagent un budget d'inclinaison de 45° (`maxTilt`), diagonale comprise.
Montée 8 m/s, descente jusqu'à 30 m/s de référence (`descentSpeed`) ; au relâchement,
l'assistance freine progressivement vers le stationnaire et revient à plat. Les chocs
verticaux au-delà de 8 m/s restent destructeurs. Menus et perte de focus neutralisent
l'entrée. Sans carburant, la gravité reprend ; le carburant (300 s de vol) ne dépend
pas du collectif. C maintenu donne le regard libre et suspend les roquettes.

La jauge Gaz affiche `(collectif + 1) / 2` moteur alimenté : 50 % au stationnaire,
vers 100 % en montée, vers 0 % en descente ; 0 % moteur coupé. `heliCollective`
conserve l'intégrateur du pilote local entre les réponses réseau (un snapshot
retardé ne le ramène pas en arrière) et part dans les mouvements partagés. Seul le
pilote commande la coque ; son quaternion est partagé avec occupants et observateurs.

Les roquettes du pilote partent dans l'axe avant local −Z de l'appareil, aux deux
lanceurs alternés (`weaponDirection()` côté client, même règle côté serveur) : la
caméra ne les dirige pas.

## Copilote

Maj choisit la MG, Ctrl le missile ; clic pour tirer, second appui distinct pour
détoner le missile, pas de changement d'arme pendant son vol. La tourelle fait un
tour complet sous la cabine à au plus π rad/s (`turretSpeed`), budget commun au lacet
et au tangage, chemin court au passage de ±180°, butées verticales `minPitch`/`maxPitch`.
Le pointage est relatif : chaque mise à jour consomme le déplacement de souris reçu
depuis la précédente, l'excédent au-delà du budget est abandonné (une souris immobile
arrête la tourelle). Menus et perte de focus abandonnent le déplacement en attente ;
un changement de poste réinitialise les orientations. Caméra, tirs et guidage suivent
la position réelle de la tourelle.

## Rotor, missile et éclairs de bouche

- Dernier occupant parti : le rotor décroît exponentiellement (constante 0,8/s),
  l'assistance perd son efficacité et la gravité reprend ; un copilote seul garde
  l'appareil occupé. Le retour d'un pilote relance le rotor (2/s).
- Le missile suit la direction demandée depuis sa position (limite 1,2 rad/s,
  `missileTurn`), balayage contre tous les solides, expiration inerte à 10 s, recharge
  de 2 s, aucun évitement automatique.
- Les deux tubes Meshy tournent autour d'un pivot longitudinal ; deux ancres sont aux
  sorties sculptées. Les éclairs de bouche (70 ms) suivent l'ancre physique du canon
  pour tous les postes (Spitfire, poste arrière du biplan et DCA fixes compris).

## Tests

`test-heli-controls.mjs` (vraie branche `physics()` du client : touches, retour au
stationnaire, jauge, menus, snapshots anciens, direction des roquettes),
`test-heli-handling.mjs` (inclinaison, descente, freinage, tourelle à 30/60/144 Hz),
`test-heli-no-aim-backlog.mjs` (pointage relatif). Le confort de pilotage à deux reste
à essayer en partie réelle.
