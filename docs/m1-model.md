# Chasseur M1 — modèle Meshy avec son camouflage d'origine

Le M1 utilise le GLB Meshy issu du croquis « Chasseur M1.png » : aile haute,
cockpit vitré, hélice et train fixe. Sa peinture originale n'est plus recolorée
selon le véhicule ; une pastille flottante porte la couleur d'identification.

## Provenance et conversion

Depuis la version 266, le M1 utilise le modèle refait par l'utilisateur (2 376
triangles, aile haute et hélice articulées, deux mitrailleuses de nez) : voir
[le remodelage de la flotte](meshy-fleet.md#remodelage-de-la-flotte-version-263).
L'historique ci-dessous décrit la version précédente.

- Génération Meshy : `01a1a800-d23f-700f-a4c7-6f5cff0ed1fc`.
- GLB d'origine : 27 707 triangles, 4 035 492 octets.
- SHA-256 : `f576a15791f513c5af145556f9c499d4a2ae64b4c4d4fc16f75e4b8077ce66c6`.
- Conversion hors ligne : `python3 scripts/import-meshy-textures.py m1 SOURCE.glb`.
- La conversion vérifie le SHA, tourne le nez en −Z, garde l'envergure 5,6
  unités et le contact des roues à −1,05 unité.

Le résultat embarque **les 27 707 triangles et les UV du GLB**, et une
version JPEG 1 024 px de l'atlas original dans `src/meshy-m1-data.js`.
Les couleurs de texture ne sont plus approximées sur les sommets comme avec
l'ancien [convertisseur simplifié](../scripts/import-meshy-m1.py).
Les positions, UV et indices sont encodés sur 16 bits. La texture est partagée
entre exemplaires ; le disque coloré leur est propre.

`src/m1-model.js` conserve une aile et une hélice articulées séparément,
ainsi que les deux canons et leurs sorties de tir. Les volumes de collision,
la physique et les règles de la [flotte](scale-fleet-weapons.md) restent inchangés.
Le retour au maillage original augmente le nombre de triangles ; aucun gain de
FPS n'est revendiqué.

L'[ancienne projection CPU](m1-model-review.png) montre la géométrie simplifiée
précédente, pas le nouvel atlas.

## Vérification

`node scripts/test-m1-model.mjs` teste le contact au sol, les UV et matériaux,
les buffers partagés, l'aile endommagée, l'hélice et la pastille. Vérifier
également en WebGL les vues pilote/extérieure, l'éclairage, la netteté du
camouflage et les performances avec plusieurs M1.
