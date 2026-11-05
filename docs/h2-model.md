# Hélicoptère H2 — Meshy avec textures et deux rotors animés

Le H2 reprend son croquis inspiré du Mi-24 : verrières en tandem, train à roues,
livrée olive/crème, pales principales et rotor de queue. Le maillage conserve
maintenant les UV et la texture d'origine. Seule une pastille flottante, et non
la coque, porte la couleur propre à chaque exemplaire.

## Provenance et conversion

- Génération Meshy : `01a1a814-67d0-73ec-833f-d66281bd2d07`.
- GLB d'origine : 28 246 triangles, 4 317 412 octets.
- SHA-256 : `148472fadbaf69bdb02fa365a7c3581e04d550eff2f55c6177e3d25183b513de`.
- Conversion hors ligne : `python3 scripts/import-meshy-textures.py h2 SOURCE.glb`.
- L'orientation et la longueur 8,4 unités sont conservées, avec roues au niveau
  −1,1. Le canon fixe d'origine, déjà remplacé par le canon articulé en jeu,
  reste écarté de l'export.

Le modèle livré contient **27 902 triangles** (hors canon articulé), son atlas
JPEG d'origine ramené à 1 024 px et ses UV. Les UV, indices et positions sont
compactés en 16 bits dans `src/meshy-h2-data.js`. Un seul jeu de matériaux et
de géométries est partagé ; chaque appareil possède sa propre articulation
et sa pastille. Les cartes PBR additionnelles ne sont pas chargées.

Le rotor principal tourne autour de Y et le rotor de queue autour de X.
Le canon du copilote garde son axe yaw/pitch, sa caméra et son origine de tir.
Roquettes, missiles, postes et règles de vol gardent les comportements décrits
dans les [véhicules d'appui](support-vehicles.md).

L'[ancienne projection CPU](h2-model-review.png) correspond à la version
simplifiée précédente. Le retour au maillage complet n'est pas une optimisation
de FPS et nécessite un essai en jeu.

## Vérification

`node scripts/test-h2-model.mjs` couvre l'atlas, les UV, les triangles,
le contact au sol, les deux rotors, le canon articulé et la pastille.
Essayer les deux postes en WebGL/UDP et mesurer les performances avec plusieurs H2.
