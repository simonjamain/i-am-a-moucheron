# Meshy — quatre véhicules restants

- Branche : `feat/meshy-remaining-vehicles`, base `b14ecec6c1eed0cd07744b6380bd9da7f42cc8cf`.
- Résultat : Stuka, S6, T3 et D2 intégrés ; M1/B3/H2 conservés ; DCA fixe hors périmètre.
- Référence durable : [visuels et provenance](../meshy-fleet.md), identifiants Meshy et empreintes des GLB inclus. Ne pas régénérer ni dépenser à nouveau les crédits.
- Images isolées : `docs/vehicle-references/`. Données finales : `src/meshy-*-data.js`. Import hors ligne : `scripts/import-meshy-fleet.py`.
- Géométries limitées à 3 000 triangles par coque, buffers partagés, articulation remorque et bouches de tir conservées. Revue des silhouettes par projection CPU effectuée.
- Vérifications locales : `npm ci`, `npm test` (suite complète), `npm run build`, validateur du paquet et liens documentaires réussis. Échec initial du format global dans `src/ground-motion.js` préexistant : reformattage uniquement, sans changement de logique.
- Docker absent localement : vérifier le job GitHub Actions `Docker build` sur le commit de la PR. Prévisualisation temporaire indisponible selon CONTRIBUTING.
- Prochaine action : examiner la CI puis faire l'essai WebGL en jeu (chaque véhicule, chaque poste, tirs, dégâts des ailes, virages D2). Aucun essai WebGL/WAN ni gain de FPS mesuré revendiqué.
