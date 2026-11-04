# H2 — modèle Meshy depuis le croquis

- Branche : `feat/meshy-h2`, base `origin/main` c1aebe9.
- Objectif : remplacer seulement le modèle H2 par le croquis Mi-24 ; garder pilotage, armes, postes et physique.
- Référence : « Hélicoptère H2.png », vue trois quarts recadrée.
- Meshy : `01a1a814-67d0-73ec-833f-d66281bd2d07`, request `aff18573-fda6-418c-b139-642732724057`, génération lancée (30 crédits).
- État : H2 intégré (3 576 triangles, 7 meshes), rotors séparés, canon articulé.
- Vérifications : npm test complet, build, validateur du paquet et check:docs réussis. Format global : écart préexistant src/ground-motion.js ; fichiers modifiés conformes. Docker absent (commande introuvable).
- Revue : aucune violation de standards ; contamination des groupes de rotors corrigée, invariants géométriques ajoutés et testés.
- Prochaine action : publication par le connecteur GitHub (push CLI sans identifiants), puis contrôles CI dont Docker build et fusion.
- Essai WebGL/UDP humain restant ; prévisualisation PR non configurée.
