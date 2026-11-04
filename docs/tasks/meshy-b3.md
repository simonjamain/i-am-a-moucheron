# B3 texturé et quatrième poste

- Branche : `feat/meshy-b3-ventral`, base `8275b31`.
- Demande : quatre places, tourelle ventrale indépendante, textures Meshy conservées et disque coloré au-dessus de l’appareil ; fusion autorisée.
- Référence dédiée : image générée depuis « Bombardier B3, tourelle ventrale.png », sujet unique sans annotations.
- Meshy : tâche `01a1a87e-d709-73c8-b5d8-3fe935a944b8`, request `64f9d3ca-44e4-4dc6-912a-f760913785bc`, 30 crédits, génération en cours. Ne pas relancer une génération payante.
- État : B3 texturé intégré (27 573 triangles hors disque), atlas 1024 px conservé, quatre postes avec accès distincts, contrats et munitions indépendants. Modules et références mis à jour.
- Vérifications : tests ciblés Node et géométrie réussis ; suite complète `npm test` réussie. Projection CPU texturée inspectée. Build et validation du paquet réussis. Fichiers modifiés formatés ; contrôle global limité par un écart préexistant dans `src/ground-motion.js` (confirmé sur `main`). Docker absent ; attendre le contrôle GitHub `Docker build`.
- Prochaine action : publier la PR, vérifier tous les résultats CI sur le commit publié puis fusionner ; vérifier le résultat sur `main`.
- Aucun essai WebGL/UDP humain effectué ; aperçu PR indisponible.
