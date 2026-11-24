# Insectes et Rapier : plan de migration

État des lieux et plan pour passer ce qui touche aux insectes (déplacements, impacts de
tirs, navigation) sur le moteur [Rapier](physics-engine.md), comme le reste du jeu. Rien
n'est encore migré ici : ce document fixe l'ordre, les mesures et les risques.

## Ce qui existe

| Sujet                       | Où                                                                 | Calcul actuel                                                                                                         |
| --------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Insectes volants            | `waves.ts` (`swarmFrame`, `midgeDisplacement`), `routes.ts`        | Position en forme fermée depuis identifiant, route et heure du serveur : identique chez tous, sans état.              |
| Tracé des routes            | `routes.ts`, `route-navigation.ts` (`blockedSegment`, `floorPath`) | Segments contre les **boîtes** (décor compris, sans ses triangles), A\* sur une grille de 16 cm pour la route au sol. |
| Insectes au sol             | `ground-creatures.ts`, `ground-defense.ts`                         | Serveur seul, à état : appâts, repas, rubans, barricades ; champs de flux (`GroundFlow`) sur une grille.              |
| Impacts des tirs            | `insect-hits.ts` (`InsectIndex`)                                   | Grille spatiale de 8 cm construite au premier tir de l'image, sphères conservatrices.                                 |
| Obus lourds, proximité      | `heavy-sim.js`                                                     | Segment contre sphères de chaque insecte (phase large `sweptSphereMayTouch`).                                         |
| Âmes ennemies du purgatoire | `walk-arena.ts`, `purgatory-queue.ts`                              | Intégration plane, poussée entre corps, obstacles rectangulaires.                                                     |

## Mesures (Rapier 0.21, conteneur de développement)

Banc : N billes cinématiques de 1 cm dans un monde Rapier, une mise à jour de position par
corps et par image, puis un pas. Les valeurs sont des temps CPU ; elles ne disent rien du GPU.

| Insectes | Déplacements de 5 mm par image | Positions aléatoires (pire cas) | Rayon contre l'ensemble |
| -------- | ------------------------------ | ------------------------------- | ----------------------- |
| 100      | 0,7 ms                         | 0,6 ms                          | 4,5 µs                  |
| 900      | 1,6 ms                         | 4,5 ms                          | 1,6 µs                  |
| 3 000    | 4,6 ms                         | 35 ms                           | 2,5 µs                  |

Conclusions :

- Refléter **tous** les insectes volants dans Rapier à chaque image coûte 1,6 à 5 ms chez
  chaque client pour une nuée dense, alors que `InsectIndex` ne se construit que les images
  où l'on tire. À ne pas faire telle quelle.
- Un rayon Rapier contre l'ensemble est très bon marché (2 à 5 µs) : le coût est la mise à
  jour des positions, pas la requête.
- Un pas de contrôleur de personnage coûte environ 13 µs ([marche](collisions.md)) : le
  faire pour quelques centaines d'insectes au sol sur le serveur tient dans le budget.

## Plan, dans l'ordre

Chaque étape est une PR indépendante, avec ses tests et sa doc, mesurée avant et après.

1. **Routes et navigation sur les mêmes solides que le reste** (faible risque).
   `blockedSegment` et le `free` de `floorPath` passent par un `SolidQuery` du plan
   (`castShape` d'une sphère du rayon de dégagement : 18 mm en l'air, 25 mm au sol), donc
   par les **triangles** du décor et non plus ses boîtes. Les meubles à pieds minces
   (chaises, ventilateurs) deviennent franchissables ou bloquants comme ils le sont pour les
   joueurs. La grille de passage (51 × 43 cases) est cuite une fois par plan, puis l'A\*
   n'appelle plus que la grille ; le lissage des couloirs garde un `castShape`. Risque :
   **déterminisme**. Serveur et clients calculent les mêmes routes depuis la même graine ; le
   résultat de Rapier doit être identique chez tous (même version WebAssembly, mêmes flottants
   32 bits). Test : comparer les routes de chaque plan entre Node et un navigateur, et
   figer le résultat dans un test de non-régression. Repli : le serveur cuit les routes et les
   envoie dans le snapshot du plan.
2. **Insectes au sol sur le contrôleur de personnage** (risque moyen). Le serveur déplace
   chaque insecte au sol avec un `WalkerWorld` du plan (capsule de la taille de l'espèce,
   `autostep` de la hauteur de patte) : fin de la poussée maison, glissement le long des
   meubles et des barricades. Les champs de flux gardent le _but_ ; Rapier garde le _corps_.
   Les barricades (briques) entrent comme colliders ; les rubans collants restent une règle.
3. **Cibles de tir dans Rapier, à la demande** (gain à mesurer). Plutôt que de refléter
   les 3 000 insectes : au premier tir de l'image, ne créer des colliders sphère que pour
   ceux que `InsectIndex` juge proches du segment, les retirer à l'image suivante. Les
   obus lourds et les rayons de caméra n'ont alors plus de code de sphères propre. À adopter
   seulement si la mesure bat la grille actuelle ; sinon garder la grille et n'y changer
   que l'API.
4. **Âmes ennemies du purgatoire** (après 2). Même contrôleur que les marcheurs : leurs
   obstacles (guichet, bureau) deviennent des boîtes du monde du purgatoire, comme pour les
   joueurs. La poussée entre corps de `walk-arena.ts` peut alors passer aux colliders des
   marcheurs eux-mêmes.
5. **Nettoyage** : retirer `swept-geometry.ts`, `oriented-collider.ts` et les tests
   boîte par boîte devenus inutiles.

## Pathfinding

Rapier n'en fournit pas. Pistes, de la moins à la plus coûteuse :

- **Garder la grille et l'A\***, avec la passabilité cuite dans Rapier (étape 1). Déterministe,
  sans dépendance, suffisant pour des bureaux de 8 m de côté.
- **Champs de flux** (déjà utilisés au sol) étendus à tous les insectes du sol : un champ par
  but, partagé par toute la nuée, recalculé quand une barricade change.
- **Maillage de navigation** (bibliothèque WebAssembly de type Recast) si les plans
  deviennent bien plus grands ou à plusieurs niveaux. Dépendance, poids du WebAssembly et
  déterminisme entre plates-formes à vérifier avant tout engagement ; pas nécessaire tant
  que les plans restent à une pièce.

## Confiance et réseau

Les insectes volants restent calculés par chaque client depuis l'heure du serveur (aucun
état à relayer) ; les insectes au sol restent calculés par le serveur seul, car leur
simulation est à état ([performances](performance.md)). La migration ne change pas ce
partage. Les dégâts et les impacts restent déclarés par le tireur
([confiance](trust-model.md)).
