# Rubans d'air et frottement du décrochage

Rien n'est affiché sur l'écran pour prévenir d'un décrochage : l'avertissement vit
dans le monde. À l'approche du décrochage, des **rubans d'air** blancs quittent les
ailes de l'avion, et un **frottement d'air** de plus en plus présent se fait entendre.
Tout le monde les voit et les entend sur tous les avions (`src/air-ribbons.ts`,
boucle `airflow`).

## État de l'air

`airflow(alpha, speed, wing)` lit l'incidence comme le fait le vol sur Rapier
([vol du biplan](plane-physics.md)) : `|α + zeroLift|` face à `stallAngle` du type.

| Valeur    | Définition                                                         |
| --------- | ------------------------------------------------------------------ |
| `onset`   | 0 sous 55 % de l'angle de décrochage, 1 à l'angle de décrochage    |
| `stalled` | 0 à l'angle de décrochage, 1 passé de 0,2 rad (décrochage profond) |
| `level`   | `max(0,5 × onset, stalled)` : force des rubans et du son           |

Sous 6 m/s de référence (à l'arrêt, au roulage) l'air est calme : aucun ruban.
La vitesse et l'orientation des avions des autres joueurs suffisent à calculer
l'incidence : rien ne passe par le réseau.

## Rubans

Deux rubans par avion, un à chaque bout d'aile, placés d'après `AIRCRAFT_GEOMETRY` :
l'origine est **à l'intérieur de l'aile** (90 % de la demi-envergure, en avant du bord
de fuite) pour que le départ carré du ruban reste caché dans le modèle. Les points sont
émis dans le monde et y restent (comme la fumée des moteurs) ; une bande qui fait face
à la caméra les relie, une seule géométrie et un seul tracé pour tous les avions
(48 rubans au plus, 17 points chacun).

- **Vol normal** : aucun ruban.
- **Approche et décrochage** : seule l'**opacité** augmente avec l'incidence ; la
  largeur reste constante (`WIDTH`). Le ruban s'allonge un peu et ondule de plus en plus.
- **Fin du ruban** : l'opacité décroît selon l'âge **et** selon la position dans le
  ruban, de sorte que le point le plus ancien qu'un ruban puisse porter est déjà
  invisible : la queue s'éteint sans coupure franche.
- **Turbulence arrondie** : les points émis dérivent de la ligne de l'aile (sinus),
  puis une courbe de Catmull-Rom _centripète_ passe par eux, avec 4 morceaux par
  segment (69 échantillons par ruban). Ce tracé reste lisse malgré peu de points, ne
  fait ni boucle ni angle quand des points sont très inégalement espacés (un point
  tout juste émis près de l'aile), et coûte quelques dizaines de sommets par ruban,
  dans le même appel de dessin.
- **Au sol, détruit, caché** : aucun ruban, ceux qui restent se dissipent.

Seuls les avions à voilure en ont (`PLANE_TYPES`) ; hélicoptères, chars et camions n'en
ont pas.

## Son

Boucle de bruit filtré `airflow` de 1 s (`synth.ts`, sans couture), jouée sur chaque
avion à voilure habité. Niveau = `level^1,4` (muet en vol normal), hauteur de 0,8 à
1,3 selon le niveau ; spatialisée comme le moteur (`ref` 14 pour son propre avion,
10 pour les autres).
