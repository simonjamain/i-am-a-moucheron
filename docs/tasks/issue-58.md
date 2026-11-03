# Issue 58 — Tower defense terrestre

- Issue : https://github.com/simonjamain/i-am-a-moucheron/issues/58
- Branche : `feat/issue-58-ground-tower-defense` (issue en cours, **non livrée**).
- But : labyrinthes de barricades, appâts permanents, bandes collantes, navigation serveur multi-clients ; volants inchangés.
- État au 3 novembre 2026 : ajout des **primitives isolées** de découpage, grille de navigation partagée recalculable, sélection déterministe d'appâts et effets collants, ainsi qu'un test Node.
- **Non intégré au gameplay** : pas de commandes/validation serveur, pose en jeu, réparation, dégâts, bestiaire, déplacement effectif, minimap, synchronisation réseau ou gestion de satiété complète. Aucun critère d'acceptation utilisateur de bout en bout n'est validé.
- Vérification : tests unitaires ajoutés dans `scripts/test-ground-defense.mjs` ; sans clone local ni Docker, les commandes `npm test`, `npm run build` et `docker build` restent à exécuter. Contrôler aussi les éventuels changements de `main` et la CI.
- Prochaine action : intégrer d'abord une entité de construction autoritaire dans `server/game.js` et sa réplication fiable, puis remplacer la progression terrestre basée sur la seule durée de route ; préserver `src/routes.js` pour les volants. Ajouter ensuite UI 3D, minimap, événements de satiété/collage, tests de 2 clients et performance.
- Règle de livraison : **ne pas fusionner cette PR avant intégration et tests complets des critères de l'issue**.

## Reprise après second jalon (v133)

- Ajout de `src/ground-defense-state.js` : structures persistantes par room, commandes de pose/suppression/réparation, coût calculé côté serveur, PV et destruction interne, révisions de topologie, snapshot collectif.
- `server/game.js` reçoit `ground-defense` sur le canal fiable existant avec contrôle de l'époque, de l'état à pied et de la proximité. Le reset vide les constructions.
- La grille `groundFlow` est recalculable pour les barricades actives mais **elle n'est pas utilisée par les insectes** ; pas d'UI de pose à ce stade.
- Nouveau `scripts/test-ground-structure.mjs` inscrit dans `npm test` ; tests locaux, Docker et CI à contrôler.
- Hypothèses d'équilibrage provisoires : 100 PV par segment, 1 $ par segment, réparation 1 $, sachet de sucre 3 $ avec rayon 15 cm, bande de 3 cm à 1 $ par 20 cm.
- À faire : trajectoires serveur, arrivée au but, attaquants, satiété, rendu, minimap, test deux joueurs et benchmark.

### Correction de validation (v134)

- Réparation et démontage exigent la proximité du **segment précis**, pas celle du début de la barricade. Le test utilise maintenant la position du joueur près du segment concerné.
- Le champ de navigation tient compte des obstacles fixes bas du décor à partir des colliders existants ; les bandes restent traversables et ignorées de la recherche de chemin.
- Les tableaux de coordonnées du snapshot ne partagent plus de mémoire mutable avec les structures serveur.

### Contrôles CI et compatibilité (v135)

- Le nouveau champ `groundDefense` provoquait la divergence attendue avec le benchmark historique de snapshots. La comparaison conserve l'égalité complète de tous les champs historiques et vérifie séparément l'état initial du nouveau champ.
- Le test de la fenêtre « Nouveautés » ne doit pas exiger une entrée de changelog à chaque incrément de version purement technique : il vérifie la dernière version réellement documentée dans `PLAYER_CHANGELOG`, toujours inférieure ou égale à `VERSION`.
- Un contrôle de format signalait aussi `server/game.js` ; mise en forme manuelle des lignes ajoutées. Les suites restent à relancer.

### Contrôle de régression des structures (v136)

- Le test construisait une bande collante exactement sur le segment de barricade déjà posé ; la validation serveur l'a correctement refusée. Le scénario a été corrigé pour poser la bande à côté du mur. Les assertions du test ont été rejouées dans un interpréteur JavaScript isolé ; la suite Node réelle reste à confirmer en CI.

### Synchronisation et refus serveur (v137)

- Test Node `scripts/test-ground-room.mjs` : deux membres d'une même room observent le même état, une autre room reste isolée ; coût atomique, doublon refusé, commande de dégâts interdite aux joueurs, pose hors portée refusée, reset et ancienne époque invalidée.
- Test de l'intégration serveur sans navigateur : les corps à pied du scénario sont placés artificiellement au sol. Il reste à vérifier les interactions réelles à plusieurs clients WebRTC et la navigation des insectes.

### Correction du test réseau de domaine (v138)

- `Game.command(..., 'sync')` exige le rapport de mouvement `state` et `mode` ; le test d'isolation inter-salles fournit désormais ce contrat au lieu d'appeler `sync` à vide. Les tests précédents de transactions ont réussi en CI ; le nouveau test multi-joueurs reste à revalider.

### Navigation des terrestres — moteur isolé (v139)

- Nouveau `src/ground-creatures.js` : déplacement par cellule suivante d'un champ mutualisé, cible d'appât par insecte, repas non répétable par type, effet de ruban traversé, et possibilité pour certaines espèces d'attaquer un mur lorsqu'aucun chemin n'existe.
- `src/ground-defense.js` expose `nextStep` (accès constant à la cellule suivante) pour éviter une recherche complète par insecte et par frame ; `groundFlow` accepte un objectif de nourriture secondaire.
- **Moteur non relié au serveur ni au rendu** : son comportement en jeu, l'ordre des mises à jour et la compatibilité avec les vagues ne sont pas encore validés. Tests de domaine ajoutés, puis intégration à réaliser sur le prochain jalon.

### Précisions de collision (v140)

- Le balayage géométrique de la colle vérifie également le recouvrement des projections de segments colinéaires, pour ne pas signaler une traversée à distance.
- Un insecte immobilisé garde la trace de la bande traversée pendant une courte zone de sortie ; celle-ci ne le fige plus en boucle sur la même bande après expiration du délai.

### Portails en bordure de carte (v141)

- La grille de navigation couvre désormais aussi les sorties des trous de fourmis/cafards (x ≈ ±4,07 m, z ≈ −3,47 m), qui étaient hors des limites initialement retenues. Le goal et la géométrie aérienne sont inchangés.

### Vérification du chemin près de la poubelle (v142)

- Le premier scénario de déplacement partait d'une cellule occupée par un obstacle fixe (`[2.5, -2.7]`) et s'arrêtait correctement. Il utilise désormais une cellule libre et atteignable (`[3, -3]`) pour vérifier l'avancée vers la poubelle. La cellule barrée reste un cas de validation séparé à couvrir.

### Moteur raccordé à la room (v143)

- `Game.advanceGround` active les déplacements autoritaires lorsqu'une construction terrestre est présente ; chaque insecte terrestre reçoit un état persistant individuel et suit le champ partagé. Les champs sont recalculés à une modification de topologie. Les champs secondaires d'appât sont mémorisés par sachet. Le mouvement sans constructions reste inchangé.
- La fin de parcours, le snapshot et les calculs de contact serveur tiennent compte des positions terrestres après activation. `swarmFrame` accepte un état autoritaire facultatif, transmis à l'unique appel du rendu client ; les volants conservent leur traitement précédent.
- Limites importantes : envoi d'un état par terrestre à chaque snapshot (non optimisé), pas encore d'interface de pose, ni benchmark 5 000 terrestres en vraie room. Les trajectoires sans constructions continuent le comportement historique. Vérification WebGL/UDP indispensable.

### Interface tactique et représentation visuelle (v144)

- Ajout de `src/ground-defense-ui.js` : bouton « Défense » à pied, plan de pose au pointeur, murs/rubans étirables, pose de sucre, réparation et suppression par sélection de segment. Utilise la commande fiable `ground-defense` et son prix serveur.
- Modèles procéduraux temporaires (carton, sachet de sucre et cristaux, ruban plat), cercle d'attraction toujours visible au sol et sur le radar. Synchronisation à partir des snapshots de room.
- Limites à tester humainement : échelle de la carte et accès du joueur aux zones de pose, distinction dessin 2D vs pose directe au sol dans le monde, lisibilité et confort sur écran tactile, fluidité WebGL avec un grand nombre d'objets.

### Cas limites de navigation (v145)

- Le champ de navigation accepte une destination couverte par une barricade, sans exception ; aucun chemin n'est trouvé et les espèces destructrices pourront chercher un mur à ouvrir.
- Les appâts dont le champ ne fournit aucune cellule suivante depuis l'insecte ne sont pas sélectionnés en boucle. Scénarios ajoutés aux tests de navigation.

### Précision des tests (v146)

- Vérifie la cellule exacte recouverte lorsque l'objectif est scellé. La régression de l'appât inaccessible inspecte l'insecte réellement simulé, et vérifie qu'il continue vers la poubelle.

### Régression d'objectif totalement bloqué (v149)

- La vérification utilise désormais la cellule contenant réellement le centre de l'objectif sur la grille de 5 cm, plutôt qu'une cellule voisine. Un mur qui couvre l'objectif doit renvoyer un champ sans itinéraire et jamais une exception.

### Vérification des comportements transversaux (v150)

- Nouveau scénario `scripts/test-ground-behaviors.mjs` dans la suite Node : immobilisation temporaire des petits, ralentissement des moyens et faible effet sur les gros, capacité destructrice par espèce, repas de sucre avec satiété unique et retour à la poubelle. Ce test utilise le moteur de déplacement réel, mais pas de rendu WebGL.
