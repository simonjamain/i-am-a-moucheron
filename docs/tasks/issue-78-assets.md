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
- Ajouter un lockfile complet npm pour rendre la construction figée.
- Compléter un essai sur un véritable GLB Meshy segmenté, mesure visuelle et
  repères/animations avant toute activation en jeu.
- Évaluer l'adaptation contrôlée des importeurs Python Meshy vers un dérivé
  optimisé, sans retirer leurs vérifications SHA d'origine.
- Contrôler `npm test`, `npm run check:docs`, `npm run check:version`, la
  construction Docker du jeu sur la même révision ; noter toute limite.
- Ne pas fusionner sans accord explicite de l'utilisateur.

Références : [issue #78](https://github.com/simonjamain/i-am-a-moucheron/issues/78),
[guide assets](../asset-pipeline.md).
