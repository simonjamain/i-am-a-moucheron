# Reprise — issue #78 : outils GLB Meshy

État : PR #81 actualisée sur la branche `feat/issue-78-meshy-asset-tooling` ; vérifications GitHub Actions finales obligatoires avant fusion.

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
- L'utilisateur a autorisé la livraison autonome de l'issue #78 le 7 novembre 2026. Ne pas présenter un essai visuel sur un vrai GLB Meshy comme réalisé sans exécution et preuve.

Références : [issue #78](https://github.com/simonjamain/i-am-a-moucheron/issues/78),
[guide assets](../asset-pipeline.md).

## Ajustement du 7 novembre 2026

- Synchronisation avec `main` après les défenses Castor : garder les versions et les ajouts récents de `README.md`.
- Sélection de profil conservateur à 75 % par défaut, `error` à 0,001 ; la réduction réelle reste dépendante du modèle.
- Le job CI doit vérifier l'écriture réelle dans les volumes Compose, puis publier le rapport JSON de la fixture.
- Essai visuel et métriques sur un **GLB Meshy réel du jeu** non réalisés dans ce contexte : conserver les sources existantes tant que ce point n'est pas vérifié.

## Vérification de la fixture dans GitHub Actions

- PR #81, workflow `Meshy asset tooling validation` :
  https://github.com/simonjamain/i-am-a-moucheron/actions/runs/42356879595
- Docker Compose a généré une fixture texturée à deux sous-maillages, a optimisé
  puis validé le GLB en préservant la tourelle protégée.
- Mesures **sur la fixture synthétique seulement**, paramètres `ratio=0.25`,
  `error=1` : **289 → 73 triangles**, **6 800 → 7 360 octets**.
  La taille augmente malgré la baisse des triangles ; il ne s'agit pas d'une
  mesure FPS ni d'un essai sur un véritable export Meshy.
- Le rapport JSON est disponible dans l'artifact GitHub Actions
  `meshy-fixture-comparison`. Tester un export Meshy réel et les articulations
  avant de remplacer une géométrie du jeu.
