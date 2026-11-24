# Insectes et Rapier : plan de migration

État des lieux et plan pour passer ce qui touche aux insectes (déplacements, impacts de
tirs, navigation) sur le moteur [Rapier](physics-engine.md), comme le reste du jeu. Les tirs et les âmes du purgatoire sont migrés ; la navigation reste à faire. Ce document fixe l'ordre, les mesures et les risques.

## Ce qui existe

| Sujet                       | Où                                                                 | Calcul actuel                                                                                                         |
| --------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Insectes volants            | `waves.ts` (`swarmFrame`, `midgeDisplacement`), `routes.ts`        | Position en forme fermée depuis identifiant, route et heure du serveur : identique chez tous, sans état.              |
| Tracé des routes            | `routes.ts`, `route-navigation.ts` (`blockedSegment`, `floorPath`) | Segments contre les **boîtes** (décor compris, sans ses triangles), A\* sur une grille de 16 cm pour la route au sol. |
| Insectes au sol             | `ground-creatures.ts`, `ground-defense.ts`                         | Serveur seul, à état : appâts, repas, rubans, barricades ; champs de flux (`GroundFlow`) sur une grille.              |
| Impacts des tirs            | `insect-hits.ts` (`InsectIndex`)                                   | Grille spatiale de 8 cm construite au premier tir de l'image, sphères conservatrices.                                 |
| Obus lourds, proximité      | `heavy-sim.js`                                                     | Segment contre sphères de chaque insecte (phase large `sweptSphereMayTouch`).                                         |
| Âmes ennemies du purgatoire | `purgatory-queue.ts`                                               | **Migré** : places par formule, sans collision entre elles.                                                           |

## Mesures (Rapier 0.21, conteneur de développement)

Banc : N billes cinématiques de 1 cm dans un monde Rapier, une mise à jour de position par
corps et par image, puis un pas. Les valeurs sont des temps CPU ; elles ne disent rien du GPU.

| Insectes | Déplacements de 5 mm par image | Positions aléatoires (pire cas) | Rayon contre l'ensemble |
| -------- | ------------------------------ | ------------------------------- | ----------------------- |
| 100      | 0,7 ms                         | 0,6 ms                          | 4,5 µs                  |
| 900      | 1,6 ms                         | 4,5 ms                          | 1,6 µs                  |
| 3 000    | 4,6 ms                         | 35 ms                           | 2,5 µs                  |

Conclusions :

- Ces billes sont des corps cinématiques ; les volumes de tir réels n'ont **pas de corps**
  (colliders libres, `InsectHitboxes`) : 0,8 ms par image pour 900 insectes et 2,3 ms pour
  3 000, mesurés par `npm run bench:collisions`. Ce coût est payé à chaque image, tir ou non.
- Un rayon Rapier contre l'ensemble est très bon marché (2 à 5 µs) : le coût est la mise à
  jour des positions, pas la requête.
- Un pas de contrôleur de personnage coûte environ 13 µs ([marche](collisions.md)) : le
  faire pour quelques centaines d'insectes au sol sur le serveur tient dans le budget.

## Décisions

- **Tirs : fait.** Les insectes volants (et au sol) ont un volume de tir dans Rapier : une
  sphère pour le moucheron, une capsule pour les autres espèces, replacés à **chaque
  image** (le jeu doit rester aussi fluide en tirant qu'en ne tirant pas). Ils ne servent
  qu'aux tirs : pas de collision entre insectes ni avec les joueurs (à voir plus tard, par
  exemple un avion qui percute une nuée). `InsectIndex` et les tests de sphères maison ont
  disparu. Les obus lourds gardent leur test sur les positions de nuée de chaque sous-pas.
- **Âmes du purgatoire : fait.** Pas de détection d'obstacles entre elles : une place par
  formule (voir [file du purgatoire](purgatory-queue.md)), toutes montrées, y compris
  au-delà du bord du nuage. Seul le joueur est arrêté par elles. Leurs volumes de tir
  sont des sphères dans un monde Rapier (`SkyTargets`).

## Reste à faire, dans l'ordre

1. **Routes et navigation sur les mêmes solides que le reste** (faible risque).
   `blockedSegment` et le `free` de `floorPath` passent par un `SolidQuery` du plan
   (`castShape` d'une sphère du rayon de dégagement : 18 mm en l'air, 25 mm au sol), donc
   par les **triangles** du décor et non plus ses boîtes. La grille de passage (51 × 43
   cases) est cuite une fois par plan, puis l'A\* n'appelle plus que la grille ; le lissage
   des couloirs garde un `castShape`. Risque : **déterminisme**. Serveur et clients
   calculent les mêmes routes depuis la même graine ; le résultat de Rapier doit être
   identique chez tous. Test : comparer les routes de chaque plan entre Node et un
   navigateur et figer le résultat. Repli : le serveur cuit les routes et les envoie.
2. **Insectes au sol sur le contrôleur de personnage** (risque moyen). Le serveur déplace
   chaque insecte au sol avec un `WalkerWorld` du plan (capsule de la taille de l'espèce,
   `autostep` de la hauteur de patte) : fin de la poussée maison, glissement le long des
   meubles et des barricades. Les champs de flux gardent le _but_ ; Rapier garde le _corps_.
   Les barricades (briques) entrent comme colliders ; les rubans collants restent une règle.
   Les règles d'écartement entre insectes (sans collision) restent des règles.
3. **Collision joueur / insecte** (à voir) : les volumes de tir existent déjà ; un avion
   qui percute une nuée est une requête de forme (`InsectHitboxes.contact`).
4. **Nettoyage** : retirer `swept-geometry.ts`, `oriented-collider.ts` et les tests
   boîte par boîte devenus inutiles ; les obus lourds sur les volumes de tir si on accepte
   de les replacer à l'heure de chaque sous-pas.

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
