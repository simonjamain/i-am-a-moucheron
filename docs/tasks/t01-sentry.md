# Tourelle T-01 — reprise des quatre modules Meshy (PR #93)

- **Objectif :** remplacer la maquette de tourelle automatique du Castor par les quatre modèles Meshy texturés, chacun indépendant ; pivot yaw 360° et canon −10° à +90°, un capteur visible, sans changer les règles de tir.
- **Référence durable :** [T-01 / sources, import et pivots](../t01-asset.md) ; [pipeline d'assets](../asset-pipeline.md). Contribution associée à l'[issue #76](https://github.com/simonjamain/i-am-a-moucheron/issues/76), encore ouverte. Ne pas fermer #76 pour cette seule partie de la défense du Castor.
- **Branche / PR :** `feat/t01-sentry-articulation-90`, [PR #93](https://github.com/simonjamain/i-am-a-moucheron/pull/93). Non fusionnée, relire les tests après la dernière mise à jour.
- **Sources :** quatre GLB Meshy fournis le 7 novembre 2026 et inspectés localement ; leurs empreintes, tâches et statistiques exactes sont consignées dans `docs/t01-asset.md`. Les SHA distinguent notamment la tête `...103356` du capteur `...103241` (horodatages d'exports non ordonnés).
- **Implémentation :** quatre modules JS offline importés depuis les GLB contrôlés par `scripts/import-meshy-t01.py`, avec géométrie et UV originaux et atlas WebP de 1K rééchantillonné des textures 2K Meshy. `src/sentry-model.js` configure les pivots, `src/ground-defense-ui.js` conserve les meshes partagés à travers les snapshots et protège leur GPU de `dispose()` lors d'une suppression. Le canon reste unique.
- **Démonstration locale :** une prévisualisation CPU hors navigateur des quatre meshes assemblés, à 0° et +90°, a aidé à décaler latéralement le radar afin de dégager le fût. Ce n'est **pas** une preuve de rendu WebGL.
- **Optimisation :** les fichiers font 13 626 triangles cumulés. L'import conserve leurs triangles (pas de décimation volontaire, puisque la topologie est déjà légère). L'outil Docker glTF Transform est disponible dans le dépôt mais n'a pas été lancé localement sur ces GLB (Docker et npm CLI hors réseau indisponibles). La compression texture WebP / 1K est distincte d'une réduction géométrique.
- **Vérifications attendues :** CI de PR sur le dernier commit : `Full game regression and formatting` (dont `test-sentry-meshy` et `test-sentry-model`), build Docker du jeu, outil d'assets, 50 pairs UDP, etc. Sans Docker local, utiliser le job `Docker build` de GitHub Actions. Vérifier le numéro VERSION et `npm run check:docs`.
- **Restant :** inspection réelle en navigateur, FPS, collisions optiques/armes et alignement des tracers ; demander le retour de l'utilisateur avant fusion de #93.

- **Essai d'optimisation mesuré en CI :** `tools/assets/test-t01-optimizer.mjs`
  réexporte les quatre maillages Meshy embarqués en GLB temporaires (UV exacts,
  atlas de test PNG 1 pixel), lance le véritable outil du conteneur avec
  `--ratio 0.75 --error 0.005`, valide les sorties et archive les chiffres.
  Il ne modifie pas les fichiers runtime ; il ne teste pas la qualité de l'atlas
  Meshy de 2K ni les fichiers GLB d'origine bit à bit. Consulter l'artifact
  `t01-meshy-geometry-optimization` du job avant d'en annoncer les résultats.
