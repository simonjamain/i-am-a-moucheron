# Ombres d’atterrissage

Les ombres aident à juger la hauteur d'un appareil avant le contact. Deux
préréglages de même coût (mêmes lumières, maillages et shadow map 2048²) vivent dans
`src/shadow-settings.ts` ; `applyShadowPreset` applique `landing` par défaut :

| Préréglage | Filtre          | Ambiance | Soleil |
| ---------- | --------------- | -------: | -----: |
| `baseline` | PCF doux        |      2,5 |      3 |
| `landing`  | PCF, rayon 1 px |      1,5 |      4 |

`landing` assombrit et contraste les ombres sous les appareils ; un rayon de flou de
1 texel adoucit les bords sans éclaircir les petites ombres (rayons 1,5 ou 2 testés
sur des gros plans rendus en logiciel, à confirmer en WebGL réel). Les ombres portent
sur les vraies surfaces sol/bureaux. Sur un plan éclairé par ses lampes (Diagonale),
le soleil presque vertical ne porte plus que les objets mobiles :
voir [l'éclairage du bureau](office-lighting.md).

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
2. Comparer « Avant » (`baseline`) et « Candidat » (`landing`) sur le bureau puis le sol, avec les hauteurs
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

Limite connue : `scripts/review-shadows.html` importe directement `../src/*.js` alors
que plusieurs modules sont passés en `.ts` ; il ne fonctionne plus sans l'assembleur
([migration TypeScript](tasks/typescript-migration.md)).

## Tests

- `test-shadow-settings.mjs` : scène identique entre préréglages (meshes, sommets,
  projeteurs, receveurs, shadow map, frustum) ; inventaire CPU, pas temps GPU.
- `test-shadow-review.mjs` : instrumentation du comparateur avec des doublures
  (requêtes GPU, échantillons, sept véhicules et 120 moucherons à l'échelle du client).

Aucune mesure WebGL avant/après n'a été consignée.
