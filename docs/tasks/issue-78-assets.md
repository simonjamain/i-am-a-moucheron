# Reprise — issue #78 : outils GLB Meshy

État : candidat en PR, non fusionné. Branche `feat/issue-78-meshy-asset-tooling`.

## Décisions
Image Node séparée de l'image du jeu, lancée à la demande par
`compose.assets.yaml`, et vérifiée dans GitHub Actions. Le binaire utilise
glTF Transform pour glTF I/O et meshoptimizer pour remplacer uniquement les
indices de triangles ; il protège les meshes nommés et refuse les monoblocs par
défaut. Le jeu et la flotte existante ne changent pas dans cette PR.

## Prochaines actions
- Vérifier l'exécution du job **Asset tool Docker and UV tests** sur le commit.
- Le lockfile npm complet est maintenant conservé, et l'image utilise npm ci.
- Compléter un essai sur un véritable GLB Meshy segmenté, mesure visuelle et
  repères/animations avant toute activation en jeu.
- Les deux importeurs acceptent désormais, sur demande explicite, une variante
  accompagnée de son original et du rapport de provenance ; valider en vraie
  situation avant de substituer un module intégré au jeu.
- Contrôler `npm test`, `npm run check:docs`, `npm run check:version`, la
  construction Docker du jeu sur la même révision ; noter toute limite.
- Ne pas fusionner sans accord explicite de l'utilisateur.

Références : [issue #78](https://github.com/simonjamain/i-am-a-moucheron/issues/78),
[guide assets](../asset-pipeline.md).
