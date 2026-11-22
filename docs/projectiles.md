# Types de projectiles

`src/projectiles.ts` est le **catalogue** des projectiles. Une arme ne porte plus ses
statistiques de munition : elle référence un type et garde ce qui lui appartient (cadence,
chargeur, recul, et plus tard un `speedFactor` pour un canon plus long ou plus court).

## Ce que porte un type

| Champ                      | Sens                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `damage`, `edge`, `radius` | Dégâts au centre, au bord du souffle, rayon du souffle (mètres de référence).                                                                        |
| `speed`                    | Vitesse nominale en m/s de référence ; l'arme la multiplie par son `speedFactor`.                                                                    |
| `lifetime`                 | Durée de vol en secondes.                                                                                                                            |
| `drag`                     | Loi de traînée (`bullet`, `shell`) ou aucune (bombe, missile).                                                                                       |
| `speedExponent`            | Part de la vitesse dans les dégâts : `damage × (vitesse / nominale) ^ exposant`. 1 pour une balle (cinétique), 0 pour une bombe ou un obus explosif. |
| `color`                    | Couleur neutre du corps d'un obus, identique pour tous les joueurs.                                                                                  |

`projectileDamage(id, vitesse)` applique l'exposant. Il n'est pas encore branché sur les
tirs : les dégâts de balle sont fixés par le serveur (`friendly` dans `server/game.js`) et
ne dépendent pas de la vitesse du porteur.

## Types actuels

Aucune valeur n'a changé en introduisant le catalogue (`scripts/test-projectiles.mjs` les
fige). Les types d'armes lourdes alimentent `HEAVY` (`armament.ts`), les balles
alimentent `TANK_MG`, `CASTOR_GUN_DAMAGE`, `RAPID_DCA_DAMAGE` et `HELI.gunDamage`.

| Type                                                                         |                Dégâts | Vitesse (m/s) | Durée (s) | Armes                                              |
| ---------------------------------------------------------------------------- | --------------------: | ------------: | --------: | -------------------------------------------------- |
| `mg`                                                                         |                    75 |           820 |         2 | chasseurs, hélicoptère, mitrailleuse haute du tank |
| `mgLight`                                                                    |                    33 |           820 |         2 | mitrailleuse du conducteur du tank                 |
| `coax`                                                                       |                    50 |           820 |         2 | mitrailleuse coaxiale du tank                      |
| `castorGun`                                                                  |                    40 |           820 |         2 | Castor                                             |
| `rapidDca`                                                                   |                    62 |           820 |         2 | DCA à cadence rapide                               |
| `flak`                                                                       |                   200 |           800 |         3 | DCA légère (obus fusant, souffle 30 m)             |
| `rocket`, `missile`, `proximity`, `dcaHeavy`, `bomb`, `he`, `ap`, `antitank` | voir `projectiles.ts` |               |           | armes lourdes                                      |

## Ricochet

Règle (`src/ricochet.ts`, matériaux dans `src/materials.ts`) : à l'impact, on mesure l'angle entre
la trajectoire et la surface (0° tangent, 90° de plein fouet). Le seuil est le **minimum** de
`ricochetMaxAngle` du type et de celui du matériau. Sous le seuil (et seuil > 0), la balle ricoche ;
au-dessus, elle touche comme avant (dégâts).

- **Réflexion parfaite**, sans aléatoire. La vitesse est multipliée par `1 − 0,6 × angle / seuil` :
  un tir parfaitement rasant garde toute sa vitesse, un tir juste sous le seuil en garde 40 %.
- Un ricochet **n'inflige aucun dégât** à la cible touchée. La balle continue et peut toucher
  n'importe qui plus loin, alliés compris.
- **5 rebonds au maximum** ; le contact éligible suivant arrête la balle, sans dégât.
- Effet : même éclat d'impact que pour une balle qui touche, et le son `ricochet`.
- Les durées de vie des types ont été allongées de 50 % (balles 2 → 3 s, flak 3 → 4,5 s, armes lourdes
  × 1,5), sans autre changement de balistique.

| Type                                                              | Angle max |
| ----------------------------------------------------------------- | --------: |
| balles (`mg`, `mgLight`, `coax`, `castorGun`, `rapidDca`)         |       20° |
| `ap` (obus perforant)                                             |       10° |
| `he` (obus explosif)                                              |        5° |
| flak, roquette, missile, bombe, proximité, `dcaHeavy`, `antitank` |        0° |

| Matériau   | Angle max | Porté par                                                    |
| ---------- | --------: | ------------------------------------------------------------ |
| `decor`    |       10° | murs, sol, meubles, objets (un seul matériau pour l'instant) |
| `armor`    |       90° | le tank : seule la limite de la balle compte                 |
| `hull`     |        0° | les autres véhicules (un matériau par type de véhicule)      |
| `carapace` |       12° | le scarabée                                                  |
| `flesh`    |        0° | les autres insectes et les joueurs                           |

Un matériau fin (papier, bois, métal, verre...) se déclare en ajoutant une entrée à `MATERIALS` et en
l'affectant à des objets ; aucun code de balistique ne change.

**Armes lourdes.** L'obus perforant (`ap`, 10°) et l'obus explosif (`he`, 5°) ricochent aussi, dans
`stepHeavy` (`heavy-sim.js`) : sol, boîtes et triangles du décor, coques de véhicules (sphère : normale du
centre vers l'impact) et insectes. La règle est la même (`src/ricochet.ts`) ; à un ricochet l'obus ne
détone pas, repart réfléchi et ralenti, et s'arrête sans explosion au contact éligible suivant après 5
rebonds (le tireur annonce alors une fin sans impact). Le tireur envoie `heavy-bounce` (`shot`, `p`,
`v`, `age`, `updated`, `bounces`) : le serveur remplace la position et la vitesse de l'enregistrement du
tir (le dernier rebond l'emporte, seul le tireur peut le faire), et les autres joueurs, qui font voler
l'obus depuis cet enregistrement, repartent de ce nouveau départ. Les armes à angle 0 (roquette, missile,
bombe, flak, proximité, `antitank`) n'ont jamais cherché de normale : leur chemin n'a pas changé.

**Limites actuelles.**

- Les **balles** (simulées par `stepProjectileSlice` dans `client.js`) ricochent contre le décor, les
  véhicules et les insectes pour le tireur ; les armes lourdes comme ci-dessus.
- Le côté « autres joueurs » du rebond d'un obus (`displayedShots` qui repart d'un `bounces` différent)
  n'a pas de test automatique ; il est vérifié par lecture du code seulement.
- Les traceurs des autres joueurs sont affichés d'après leurs tirs reçus, sans collision (ils traversent
  les obstacles) : ils ne font que **ricocher visuellement sur le décor**, sans jamais s'arrêter ni
  blesser. Les tirs des autres peuvent donc ne pas suivre exactement la même trajectoire que chez le
  tireur.
- Aucune mesure de performance sur un grand nombre de balles qui ricochent.

## Suite prévue

1. **Harmonisation** : cinq types de balle pour des tirs très proches. À valider avec le
   propriétaire du jeu avant tout changement de valeur.
2. **Réseau des balles** : rafale avec graine et heure de départ, identifiants, événement de ricochet sur
   ce qui bouge (étape suivante).
3. **Pénétration** : résistance d'un matériau et pénétration d'un type, comparées à part du seuil d'angle.
