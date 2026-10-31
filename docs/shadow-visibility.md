# Issue #11 — ombres d’atterrissage, candidat version 51

**Validation WebGL et performance ouverte. Ne pas fusionner ce candidat avant
la comparaison demandée dans l’issue #11.**

## Solution préparée

Le candidat conserve la même scène, le même soleil et la shadow map 2048 × 2048.
Il remplace le filtrage PCF doux par BasicShadowMap pour obtenir un bord franc,
et modifie uniquement les intensités : ambiance hémisphérique 2,5 → 1,5 ; soleil
3 → 4. Le contraste augmente dans les zones couvertes par les ombres, tout en
compensant une partie de l’éclairage direct. Pas de silhouette précise ajoutée,
ni d’augmentation de résolution, de nombre de lumières, de géométrie ou de surfaces
recevant/projetant les ombres. Les ombres utilisent toujours les vraies surfaces
sol/bureaux. Le mode Basic peut rendre les bords crénelés : sa lisibilité et ses
artefacts doivent être observés avant acceptation.

`shadow-settings.js` centralise le candidat et le préréglage précédent. Le rendu
logiciel de secours n’apporte pas de preuve concernant ces ombres WebGL.

## Comparaison reproductible

Depuis la racine du dépôt, lancer un serveur statique local :

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Ouvrir `http://127.0.0.1:8080/scripts/review-shadows.html` dans un navigateur WebGL.
Aucun compte, réseau UDP ni CDN n’est requis. Ne pas publier ce serveur de travail
sur Internet. Le comparateur utilise les vrais modules et modèles du jeu.

1. Garder matériel, navigateur, taille de fenêtre et résolution constants.
   Fermer les outils de développement pendant les mesures, rester au premier plan.
2. Comparer « Avant » et « Candidat » sur le bureau puis le sol, avec les hauteurs
   0,006 / 0,04 / 0,15 m du monde. Observer en particulier le H2 et les avions,
   l’appui des roues/patins, le contraste et les artefacts sur les surfaces.
3. Lancer « Mesurer A/B/B/A » : sept véhicules, 120 insectes, caméra fixe,
   trajectoire d’altitude déterministe identique. Chaque phase chauffe 120 frames,
   puis mesure 600 frames. Refaire le cycle pour apprécier la variabilité.
4. Exporter le JSON : temps de frame médian/p95/min/max, durée CPU de soumission
   du rendu, temps GPU si l’extension est disponible, draw calls et triangles.
   Sans extension GPU, le champ est nul et ne vaut pas « zéro coût ». Le matériel,
   navigateur et la résolution sont inclus. Une perte de contexte invalide l’essai.
5. Comparer les deux répétitions de chaque mode et la dispersion. Refaire les
   essais si les variations ne permettent pas de conclure. N’accepter qu’en
   l’absence de régression mesurable dans ces conditions ; joindre le JSON et
   les captures sol/bureau/hauteurs à la PR. Le fichier ne conclut jamais seul
   que le candidat est acceptable.

Le benchmark reste un scénario de comparaison, pas une preuve de performance
maximale du jeu ni de confort WAN. Il ne change pas automatiquement de qualité.

## État des preuves

- `test-shadow-settings.mjs` : scène identique avant/après — 355 meshes, 14 932
  sommets, 354 objets projetant une ombre, 345 receveurs, shadow map 2048² et
  frustum inchangé. C’est un inventaire CPU, pas un temps de frame GPU.
- `test-shadow-review.mjs` : instrumentation vérifiée avec des doublures ; une
  requête GPU est terminée une seule fois, et les échantillons sont enregistrés.
  La construction réelle du comparateur vérifie aussi sept véhicules et 120
  moucherons à la même échelle miniature que le client.
- Rendu et mesures avant/après **non exécutés** : aucun exécutable Chromium trouvé
  dans l’environnement ; Playwright indique son navigateur attendu comme absent.
  Aucun FPS, temps GPU ou amélioration visuelle ne sont revendiqués.

Prochaine étape : exécuter le comparateur sur un poste WebGL, analyser les traces
et captures, puis décider de l’acceptation de ce candidat ou d’un ajustement.
