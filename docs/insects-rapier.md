# Insectes et Rapier

Ce qui, chez les insectes, passe par le moteur [Rapier](physics-engine.md) et ce qui reste
calculé par le jeu.

| Sujet                        | Où                                                                 | Calcul                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Volumes de tir               | `insect-hitboxes.ts` (`InsectHitboxes`)                            | **Rapier** : un collider sans corps par insecte vivant, replacé sur son modèle à chaque image.                        |
| Cibles du ciel du purgatoire | `sky-targets.ts` (`SkyTargets`)                                    | **Rapier** : une sphère par âme d'insecte, Saint Pierre et le garde VIP, dans un monde `InsectHitboxes`.              |
| Insectes volants             | `waves.ts` (`swarmFrame`, `midgeDisplacement`), `routes.ts`        | Position en forme fermée depuis identifiant, route et heure du serveur : identique chez tous, sans état.              |
| Tracé des routes             | `routes.ts`, `route-navigation.ts` (`blockedSegment`, `floorPath`) | Segments contre les **boîtes** (décor compris, sans ses triangles), A\* sur une grille de 16 cm pour la route au sol. |
| Insectes au sol              | `ground-creatures.ts`, `ground-defense.ts`                         | Serveur seul, à état : appâts, repas, rubans, barricades ; champs de flux (`GroundFlow`) sur une grille.              |
| Obus lourds, proximité       | `heavy-sim.ts`                                                     | Segment contre la sphère de chaque insecte à l'heure du sous-pas (phase large `sweptSphereMayTouch`).                 |
| Âmes ennemies du purgatoire  | `purgatory-queue.ts`                                               | Une place par formule, sans collision entre elles ([file du purgatoire](purgatory-queue.md)).                         |

## Volumes de tir

`InsectHitboxes` donne à chaque insecte vivant, volant ou au sol, une sphère (moucheron) ou une
capsule le long du plus long rayon de l'ellipsoïde de l'espèce (autres espèces, tolérance
comprise). Les volumes sont replacés à **chaque image**, que l'on tire ou non, pour que le coût
ne dépende pas du tir ; un rayon (`nearest`) les interroge ensuite tous à la fois. Ils ne
servent qu'aux tirs (et, dans le ciel du purgatoire, aux explosions par `within`) : aucune
collision n'est simulée, ni entre insectes ni avec les joueurs. Le bouton « Volumes » les dessine
([affichage de la physique](physics-debug.md)).

Coût (`npm run bench:collisions`, temps CPU du conteneur de développement) : replacement
d'environ 0,8 ms par image pour 900 insectes et 2,6 ms pour 3 000 ; un rayon contre l'ensemble
coûte 1,5 à 3 µs quelle que soit la nuée.

Les âmes du purgatoire n'ont pas de détection d'obstacles entre elles : toutes sont montrées, y
compris au-delà du bord du nuage, et seul le joueur est arrêté par elles.

## Confiance et réseau

Les insectes volants sont calculés par chaque client depuis l'heure du serveur (aucun état à
relayer) ; les insectes au sol par le serveur seul, car leur simulation est à état
([performances](performance.md#choix-darchitecture)). Dégâts et impacts sont déclarés par le
tireur ([confiance](trust-model.md)).

## Vérifier

`scripts/test-insect-hitboxes.mjs` (volumes et rayons) et
`scripts/test-purgatory-sky.mjs` (cibles du ciel).
