# Visée des constructions et barricade modulaire

- Demande : placement de tous les objets au point visé par la caméra ; début puis fin pour barricade/ruban ; briques répétées selon la longueur ; fusion autorisée puis essai utilisateur.
- Branche : `fix/camera-placement-brick-barricade`, base `920105b`.
- Implémentation : `placement-aim.js` commun aux achats et défenses (rayon contre les boîtes du bureau, portée et occlusion) ; repère initial sans orientation ; modèle Meshy instancié via `brick-wall.js`.
- Meshy : tâche `01a1a7e1-7451-73ec-b5ba-7c98568b5b9a`, 20 crédits pour un modèle non texturé, 510 triangles. Géométrie extraite en module JS local pour ne pas ajouter de chargement/CDN ; couleurs locales. Conversion reproductible : `python scripts/import-meshy-brick.py model.glb`. La forme générée est une interprétation et non une reproduction exacte de la planche.
- Tests ciblés : `node scripts/test-ground-placement.mjs`, `node scripts/test-service-placement.mjs` passent. Suite globale passée ; build, validateur d’artefact et liens documentaires passés. CI restant à vérifier.
- Formatage : 17 fichiers déjà non conformes dans la base ont reçu uniquement Prettier, pour permettre le contrôle global sans l’affaiblir.
- Docker absent localement ; contrôle GitHub Actions `Docker build` indispensable avant fusion. Aperçu par PR indisponible selon CONTRIBUTING.
- Essai humain restant : visée WebGL, portée ressentie, déplacement en traçant, sucre/ventilateur, réparation/suppression et achats, deux joueurs UDP. Aucun essai WAN ou validation visuelle en partie n'est revendiqué.
- Revue : visée et modularité conformes ; fuite des buffers instanciés corrigée avec `dispose()`, références controls/code-structure actualisées.
- Prochaine action : suite complète et assemblage, revue finale, pousser PR puis attendre contrôles et fusionner si verts.
