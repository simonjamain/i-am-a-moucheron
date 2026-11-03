# Issue 58 — Tower defense terrestre

- Issue : https://github.com/simonjamain/i-am-a-moucheron/issues/58
- Branche : `feat/issue-58-ground-tower-defense` (issue en cours, **non livrée**).
- But : labyrinthes de barricades, appâts permanents, bandes collantes, navigation serveur multi-clients ; volants inchangés.
- État au 3 novembre 2026 : ajout des **primitives isolées** de découpage, grille de navigation partagée recalculable, sélection déterministe d'appâts et effets collants, ainsi qu'un test Node.
- **Non intégré au gameplay** : pas de commandes/validation serveur, pose en jeu, réparation, dégâts, bestiaire, déplacement effectif, minimap, synchronisation réseau ou gestion de satiété complète. Aucun critère d'acceptation utilisateur de bout en bout n'est validé.
- Vérification : tests unitaires ajoutés dans `scripts/test-ground-defense.mjs` ; sans clone local ni Docker, les commandes `npm test`, `npm run build` et `docker build` restent à exécuter. Contrôler aussi les éventuels changements de `main` et la CI.
- Prochaine action : intégrer d'abord une entité de construction autoritaire dans `server/game.js` et sa réplication fiable, puis remplacer la progression terrestre basée sur la seule durée de route ; préserver `src/routes.js` pour les volants. Ajouter ensuite UI 3D, minimap, événements de satiété/collage, tests de 2 clients et performance.
- Règle de livraison : **ne pas fusionner cette PR avant intégration et tests complets des critères de l'issue**.
