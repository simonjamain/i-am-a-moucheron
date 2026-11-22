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

## Suite prévue

1. **Harmonisation** : cinq types de balle pour des tirs très proches. À valider avec le
   propriétaire du jeu avant tout changement de valeur.
2. **Ricochet** : angle maximum par type et par matériau, minimum des deux, voir la PR suivante.
3. **Durées de vie** : +50 % pour les balles et les armes lourdes, avec le ricochet.
