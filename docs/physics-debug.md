# Affichage de la physique (debug)

Deux boutons discrets à côté de « Debug » dans l'en-tête, **indépendants du mode debug de
la room** (qui remet la partie à zéro) ; chacun est local au navigateur et mémorisé
(`localStorage`, `view.volumes` / `view.physics`) :

- **Volumes** : ce que montrait déjà le mode debug (hit boxes des ennemis, boîtes et
  triangles de collision du décor, portées des défenses). Le mode debug de la room les
  affiche toujours.
- **Physique** : les corps rigides Rapier des engins, vus par `src/physics-debug.ts`
  (`PhysicsOverlay`, lignes dessinées au-dessus de la scène, sans test de profondeur).

## Légende de la vue physique

| Couleur               | Sens                                                                           |
| --------------------- | ------------------------------------------------------------------------------ |
| cyan                  | contours des colliders d'un corps rigide (fuselage, ailes, coque, remorque…)   |
| vert                  | ressort de suspension à sa longueur de repos (de son point de montage au sol)  |
| ambre                 | course supplémentaire jusqu'à la butée (roues à rayon) ou jusqu'au fond (char) |
| rouge                 | longueur actuelle du ressort, jusqu'au point de contact (croix blanche)        |
| magenta               | force poussée par un ressort                                                   |
| bleu / orange / jaune | portance / traînée / poussée de l'avion                                        |
| gris                  | poids ; blanc cassé : vitesse ; croix blanche au centre : centre de masse      |

Les flèches sont à l'échelle du poids de l'engin : une flèche de portance de la longueur
de la flèche de poids est une portance de 1 g.

## Pour un nouvel engin

Le rig implémente `debugDraw(sink)` (`DebugRig`) et dessine en mètres physiques avec
`drawColliders`, `drawWheels` (contrôleurs de roues Rapier), `arrow` et `cross`. Le client
parcourt `planeRig`, `drivenRigs` et `vacantRigs` (`physicsRigs()` dans `client.js`).
`scripts/test-physics-debug.mjs` vérifie le biplan, le char, le camion et le Castor.
