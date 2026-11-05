# Identifiant coloré et atlas Meshy — sept véhicules

- PR : [#75](https://github.com/simonjamain/i-am-a-moucheron/pull/75), branche `feat/meshy-uniform-markers` ; base `main` après #71–#74.
- Objectif : M1, H2, B3, Stuka, S6, T3 et D2 conservent leurs peintures Meshy, tandis que la couleur d'identification individuelle n'apparaît que sur une pastille au-dessus du véhicule.
- Réalisé dans le premier lot (v168) : pastille commune, hauteur adaptée, conservation de la peinture et tests de non-recoloration.
- **GLB retrouvés en Bibliothèque** le 5 novembre 2026 : sept sources vérifiées par SHA-256 exact, y compris le B3 déjà livré. Les six GLB restants ont été convertis hors ligne avec leur atlas JPEG 1 024 px et leurs UV d'origine. Aucun appel ni crédit Meshy.
- Nouveau lot (v169) : `scripts/import-meshy-textures.py` (source reproductible), `src/meshy-texture.js` (ressources partagées) et six données texturées. Animations M1, H2, Stuka, S6 et D2, tourelles T3 conservées ; B3 inchangé.
- Performance : environ 27 000 à 29 000 triangles par véhicule au lieu des 3 000 approximatifs précédents. Textures préférées au rendu simplifié comme demandé ; aucun gain de FPS revendiqué, essai WebGL avec plusieurs véhicules encore nécessaire.
- Vérifications : SHA-256 des sept GLB confirmés ; UV, indices, bornes et contact au sol examinés hors ligne. GitHub Actions [42000952044](https://github.com/simonjamain/i-am-a-moucheron/actions/runs/42000952044) : **5 jobs verts** sur `2c6c5d84bb443a03d95c1b02f5fd5e808b31c079`, incluant tests complets Node, format ciblé CI, liens docs, build, validation du paquet, 50 pairs UDP et Docker. Aucun essai humain WebGL/UDP/WAN.
- Limite d'environnement : clone Git réseau impossible (DNS), Docker indisponible ; travaux du dépôt publiés via l'intégration GitHub, conversion Python effectuée localement, fichiers temporaires de pont Library à supprimer.
- Références : [flotte Meshy](../meshy-fleet.md), [B3](../b3-model.md), [M1](../m1-model.md), [H2](../h2-model.md).
- Prochaine action : revue de la PR, fusion si autorisée, puis essai réel des textures, hélices, rotors, postes et FPS en partie. L'absence de mesure WebGL reste une limite explicite.
